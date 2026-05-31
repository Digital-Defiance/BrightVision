"""
LLM-assisted three-layer todo spec generation and parsing.
"""

from __future__ import annotations

import re
from typing import Literal

from bright_vision_core.ears.prompt import format_spec_quality_for_prompt
from bright_vision_core.workspace_todos import TodoItem

GenerateMode = Literal["generate", "refine"]
SpecSection = Literal["all", "requirements", "design", "tasks_md"]

_SECTION_HEADERS = {
    "## requirements": "requirements",
    "## design": "design",
    "## implementation tasks": "tasks_md",
}

# --- Kiro-style layer guidance (no curly braces: these are concatenated into
# --- .format() templates, so any "{" would be parsed as a field). ---

_REQUIREMENTS_FORMAT = """\
Write thorough, Kiro-style requirements:
- Begin with a `### Introduction` paragraph describing the feature, its users, and scope.
- Add one `### REQ-NNN: <title>` section per requirement (unique id; a short title may follow the id).
- Under each requirement, write a `**User Story:** As a <role>, I want <capability>, so that <benefit>.` line.
- Then an `**Acceptance Criteria**` numbered list of EARS clauses. Each clause uses **THE** system **SHALL** with a trigger: **WHEN** <event>, **IF** <condition> **THEN**, **WHILE** <state>, or **WHERE** <feature> — or a ubiquitous **THE** system **SHALL** statement.
- Give every requirement at least two acceptance criteria; cover the happy path, edge cases, invalid input / error handling, and relevant non-functional needs (performance, security, accessibility).
- Prefer at least three requirements unless the feature is genuinely trivial.
"""

_DESIGN_FORMAT = """\
Be comprehensive and concrete. Use these level-3 (###) subsections:
- `### Overview` — what is being built and why, tied to the requirements.
- `### Architecture` — the major pieces and how requests/data flow between them (a diagram is welcome).
- `### Components and Interfaces` — each component, its responsibility, and key function/endpoint signatures.
- `### Data Models` — important types, their fields, and how they are persisted.
- `### Error Handling` — failure modes and how the system responds.
- `### Testing Strategy` — unit, integration, and e2e coverage.
Reference concrete modules/files in this repository where relevant, and cite the REQ ids each part satisfies (e.g. REQ-001). Every requirement must be covered.
"""

_TASKS_FORMAT = """\
Break the work into incremental, test-driven coding steps:
- Use a numbered checklist; add sub-steps (e.g. 1.1, 1.2) for larger steps.
- Each step is an actionable coding task (write or change code/tests), not project management.
- Note the requirement ids each step implements (e.g. `_Requirements: REQ-001, REQ-002_`) and a `(depends: none|N)` marker.
- Order steps so each builds on previous ones, and wire tests alongside the code they cover.
"""

_REQUIREMENTS_EXAMPLE = """\
Format example (replace with the real feature; do not copy this content):

### Introduction
The health endpoint lets clients confirm the API is reachable before pairing.

### REQ-001: Health check
**User Story:** As a client app, I want a health endpoint, so that I can confirm the API is up.

**Acceptance Criteria**
1. **WHEN** a client sends `GET /health` **THE** system **SHALL** respond with HTTP 200 and a JSON status body.
2. **IF** the core is still starting **THEN THE** system **SHALL** respond with HTTP 503 and a retry hint.
"""

_DESIGN_EXAMPLE = """\
Format example (structure only):

### Overview
Implements REQ-001 as an HTTP route.
### Architecture
FastAPI app -> health handler -> status payload.
### Components and Interfaces
- `health()` returns the status payload — REQ-001.
### Data Models
A Status value with an "ok" boolean field.
### Error Handling
Return HTTP 503 while the core is starting (REQ-001).
### Testing Strategy
An HTTP test asserts 200 and a JSON body for REQ-001.
"""

_TASKS_EXAMPLE = """\
Format example:

- [ ] 1. Add the health route and status payload — _Requirements: REQ-001_ (depends: none)
  - [ ] 1.1 Return HTTP 503 while the core is starting (depends: none)
- [ ] 2. Add an HTTP test asserting 200 and a JSON body — _Requirements: REQ-001_ (depends: 1)
"""

_ALL_EXAMPLE = """\
Format example (structure only; replace with the real feature):

## Requirements
### Introduction
The health endpoint lets clients confirm the API is reachable.

### REQ-001: Health check
**User Story:** As a client, I want a health endpoint, so that I can confirm the API is up.

**Acceptance Criteria**
1. **WHEN** a client sends `GET /health` **THE** system **SHALL** respond with HTTP 200 and a JSON status.
2. **IF** the core is still starting **THEN THE** system **SHALL** respond with HTTP 503.

## Design
### Overview
Implements REQ-001 as an HTTP route.
### Architecture
FastAPI app -> health handler -> status payload.
### Components and Interfaces
- `health()` returns the status payload — REQ-001.
### Data Models
A Status value with an "ok" boolean field.
### Error Handling
Return HTTP 503 while starting (REQ-001).
### Testing Strategy
An HTTP test asserts 200 for REQ-001.

## Implementation tasks
- [ ] 1. Add the health route — _Requirements: REQ-001_ (depends: none)
- [ ] 2. Add an HTTP test for the route — _Requirements: REQ-001_ (depends: 1)
"""

_GENERATE_TEMPLATE = (
    "You are writing a complete spec-driven development plan for this repository. "
    "Do not edit any files.\n\n"
    "Feature request:\n{prompt}\n\n"
    "{existing}{ears_context}\n\n"
    "Respond with markdown only. Use exactly these three level-2 (##) headings and no other "
    "level-2 headings; use level-3 (###) for every subsection:\n\n"
    "## Requirements\n" + _REQUIREMENTS_FORMAT + "\n"
    "## Design\n" + _DESIGN_FORMAT + "\n"
    "## Implementation tasks\n" + _TASKS_FORMAT + "\n"
    + _ALL_EXAMPLE
)

_REQUIREMENTS_SECTION_TEMPLATE = (
    "You are writing the requirements layer for a spec-driven task. Do not edit any files.\n\n"
    "Feature request:\n{prompt}\n\n"
    "{existing_requirements}{ears_context}\n\n"
    "Respond with markdown only, under a single level-2 heading:\n\n"
    "## Requirements\n" + _REQUIREMENTS_FORMAT + "\n" + _REQUIREMENTS_EXAMPLE
)

_DESIGN_SECTION_TEMPLATE = (
    "You are writing the design layer for a spec-driven task. Do not edit any files.\n\n"
    "Task title: {title}\n\n"
    "## Requirements (approved — the design must satisfy every REQ id)\n{requirements}\n\n"
    "Design note:\n{prompt}\n\n"
    "{existing_design}{ears_context}\n\n"
    "Respond with markdown only, under a single level-2 heading:\n\n"
    "## Design\n" + _DESIGN_FORMAT + "\n" + _DESIGN_EXAMPLE
)

_TASKS_SECTION_TEMPLATE = (
    "You are writing the implementation tasks layer for a spec-driven task. "
    "Do not edit any files.\n\n"
    "Task title: {title}\n\n"
    "## Requirements\n{requirements}\n\n"
    "## Design\n{design}\n\n"
    "Implementation note:\n{prompt}\n\n"
    "{existing_tasks}{ears_context}\n\n"
    "Respond with markdown only, under a single level-2 heading:\n\n"
    "## Implementation tasks\n" + _TASKS_FORMAT + "\n" + _TASKS_EXAMPLE
)

_REFINE_TEMPLATE = (
    "You are reviewing and improving a spec-driven task. Do not edit any files.\n\n"
    "Task title: {title}\n\n"
    "## Requirements\n{requirements}\n\n"
    "## Design\n{design}\n\n"
    "## Implementation tasks\n{tasks_md}\n\n"
    "User note: {prompt}\n{ears_context}\n\n"
    "Output an improved version with the same three level-2 (##) headings "
    "(## Requirements, ## Design, ## Implementation tasks). Deepen any thin section, fix "
    "contradictions between layers, ensure every REQ id is covered by the design and tasks, "
    "and resolve every EARS issue listed above. Follow this structure:\n\n"
    + _REQUIREMENTS_FORMAT + "\n" + _DESIGN_FORMAT + "\n" + _TASKS_FORMAT
)


def _optional_existing_block(label: str, text: str) -> str:
    body = (text or "").strip()
    if not body:
        return ""
    return f"Existing {label} (improve and extend):\n{body}\n\n"


def build_generate_message(
    prompt: str,
    *,
    mode: GenerateMode = "generate",
    item: TodoItem | None = None,
    section: SpecSection = "all",
) -> str:
    ears_context = ""
    if item and (mode == "refine" or section in ("all", "requirements")):
        ears_context = format_spec_quality_for_prompt(
            item.requirements,
            item.design,
            item.tasks_md,
        )
    if mode == "refine" and item:
        return _REFINE_TEMPLATE.format(
            title=item.title,
            requirements=item.requirements.strip() or "(empty)",
            design=item.design.strip() or "(empty)",
            tasks_md=item.tasks_md.strip() or "(empty)",
            prompt=prompt.strip() or "Review for consistency.",
            ears_context=ears_context,
        )
    if section == "requirements":
        existing = _optional_existing_block(
            "requirements draft",
            item.requirements if item else "",
        )
        return _REQUIREMENTS_SECTION_TEMPLATE.format(
            prompt=prompt.strip(),
            existing_requirements=existing,
            ears_context=ears_context,
        )
    if section == "design" and item:
        return _DESIGN_SECTION_TEMPLATE.format(
            title=item.title,
            requirements=item.requirements.strip() or "(empty)",
            prompt=prompt.strip(),
            existing_design=_optional_existing_block("design draft", item.design),
            ears_context=ears_context,
        )
    if section == "tasks_md" and item:
        return _TASKS_SECTION_TEMPLATE.format(
            title=item.title,
            requirements=item.requirements.strip() or "(empty)",
            design=item.design.strip() or "(empty)",
            prompt=prompt.strip(),
            existing_tasks=_optional_existing_block("implementation tasks draft", item.tasks_md),
            ears_context=ears_context,
        )
    existing = ""
    if item and (item.requirements or item.design or item.tasks_md):
        existing = (
            "Existing draft (improve and extend):\n"
            f"Requirements:\n{item.requirements}\n\n"
            f"Design:\n{item.design}\n\n"
            f"Implementation tasks:\n{item.tasks_md}\n"
        )
    return _GENERATE_TEMPLATE.format(
        prompt=prompt.strip(),
        existing=existing,
        ears_context=ears_context,
    )


def parse_generated_layers(text: str, *, section: SpecSection = "all") -> dict[str, str]:
    """Extract requirements, design, and tasks_md from model markdown."""
    sections: dict[str, list[str]] = {k: [] for k in ("requirements", "design", "tasks_md")}
    current: str | None = None

    for line in text.replace("\r\n", "\n").split("\n"):
        key = _SECTION_HEADERS.get(line.strip().lower())
        if key:
            current = key
            continue
        if current:
            sections[current].append(line)

    out = {k: "\n".join(v).strip() for k, v in sections.items()}
    if not any(out.values()):
        cleaned = _strip_fences(text)
        if cleaned:
            if section == "design":
                out["design"] = cleaned
            elif section == "tasks_md":
                out["tasks_md"] = cleaned
            else:
                out["requirements"] = cleaned
    return out


def merge_generated_layers(
    item: TodoItem,
    parsed: dict[str, str],
    *,
    section: SpecSection,
) -> dict[str, str]:
    """Merge parsed output with stored layers for phased apply."""
    if section == "all":
        return {
            "requirements": parsed.get("requirements", "") or item.requirements,
            "design": parsed.get("design", "") or item.design,
            "tasks_md": parsed.get("tasks_md", "") or item.tasks_md,
        }
    if section == "requirements":
        return {
            "requirements": parsed.get("requirements", "") or item.requirements,
            "design": item.design,
            "tasks_md": item.tasks_md,
        }
    if section == "design":
        return {
            "requirements": item.requirements,
            "design": parsed.get("design", "") or item.design,
            "tasks_md": item.tasks_md,
        }
    return {
        "requirements": item.requirements,
        "design": item.design,
        "tasks_md": parsed.get("tasks_md", "") or item.tasks_md,
    }


def validate_section_prerequisites(item: TodoItem, section: SpecSection) -> None:
    if section == "design" and not item.requirements.strip():
        raise ValueError("Generate requirements before design")
    if section == "tasks_md":
        if not item.requirements.strip():
            raise ValueError("Generate requirements before implementation tasks")
        if not item.design.strip():
            raise ValueError("Generate design before implementation tasks")


def _strip_fences(text: str) -> str:
    t = text.strip()
    m = re.match(r"^```(?:markdown|md)?\s*\n(.*)\n```\s*$", t, re.DOTALL | re.I)
    return m.group(1).strip() if m else t
