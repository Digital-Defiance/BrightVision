"""Link Cecli agent ``todo.txt`` (UpdateTodoList) with workspace Tasks (``.cecli/todos.json``)."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from bright_vision_core.workspace_todos import (
    ChecklistItem,
    TodoItem,
    TodoStore,
    WorkspaceTodos,
    _now_iso,
)

if TYPE_CHECKING:
    from bright_vision_core.session import Session

AGENT_PLAN_TITLE = "Agent session plan"
AGENT_PLAN_LINK = "cecli:agent-todo"
AGENT_TODO_LINK_PREFIX = "cecli:agent-todo:"


@dataclass(frozen=True)
class AgentTodoRow:
    text: str
    done: bool
    current: bool


def agent_todo_link_for(relpath: str) -> str:
    return f"{AGENT_TODO_LINK_PREFIX}{relpath.replace(chr(92), '/')}"


def parse_agent_todo_link(links: list[str]) -> str | None:
    for link in links:
        if link.startswith(AGENT_TODO_LINK_PREFIX):
            return link[len(AGENT_TODO_LINK_PREFIX) :]
    return None


def is_agent_linked_task(item: TodoItem) -> bool:
    return bool(parse_agent_todo_link(item.links)) or AGENT_PLAN_LINK in item.links


def parse_agent_todo_txt(content: str) -> list[AgentTodoRow]:
    """Parse ``todo.txt`` written by cecli ``updatetodolist``."""
    rows: list[AgentTodoRow] = []
    for raw in content.splitlines():
        line = raw.strip()
        if not line or line in ("Done:", "Remaining:"):
            continue
        done = False
        current = False
        text = line
        if line.startswith("✓ "):
            done = True
            text = line[2:].strip()
        elif line.startswith("→ "):
            current = True
            text = line[2:].strip()
        elif line.startswith("○ "):
            text = line[2:].strip()
        else:
            continue
        if text:
            rows.append(AgentTodoRow(text=text, done=done, current=current))
    return rows


def format_agent_todo_txt(rows: list[AgentTodoRow]) -> str:
    done_tasks: list[str] = []
    remaining: list[str] = []
    for row in rows:
        if row.done:
            done_tasks.append(f"✓ {row.text}")
        elif row.current:
            remaining.append(f"→ {row.text}")
        else:
            remaining.append(f"○ {row.text}")
    lines: list[str] = []
    if done_tasks:
        lines.append("Done:")
        lines.extend(done_tasks)
        lines.append("")
    if remaining:
        lines.append("Remaining:")
        lines.extend(remaining)
    if lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def find_latest_agent_todo_txt(workspace: Path) -> Path | None:
    agents = workspace / ".cecli" / "agents"
    if not agents.is_dir():
        return None
    candidates = list(agents.glob("**/todo.txt"))
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def resolve_agent_todo_path(workspace: Path, relpath: str | None) -> Path | None:
    if relpath:
        path = workspace / relpath
        return path if path.is_file() else None
    latest = find_latest_agent_todo_txt(workspace)
    return latest


def rows_from_checklist(checklist: list[ChecklistItem]) -> list[AgentTodoRow]:
    rows: list[AgentTodoRow] = []
    marked_current = False
    for entry in checklist:
        current = not entry.done and not marked_current
        if current:
            marked_current = True
        rows.append(AgentTodoRow(text=entry.text, done=entry.done, current=current))
    return rows


_TASK_MD_LINE = re.compile(r"^-\s*\[([ xX])\]\s*(.+)$")


def rows_from_tasks_md(tasks_md: str) -> list[AgentTodoRow]:
    rows: list[AgentTodoRow] = []
    marked_current = False
    for raw in tasks_md.splitlines():
        m = _TASK_MD_LINE.match(raw.strip())
        if not m:
            continue
        done = m.group(1).lower() == "x"
        text = m.group(2).strip()
        if not text:
            continue
        current = not done and not marked_current
        if current:
            marked_current = True
        rows.append(AgentTodoRow(text=text, done=done, current=current))
    return rows


def rows_from_todo_item(item: TodoItem) -> list[AgentTodoRow]:
    if item.checklist:
        return rows_from_checklist(item.checklist)
    if item.tasks_md.strip():
        parsed = rows_from_tasks_md(item.tasks_md)
        if parsed:
            return parsed
    return []


def rows_to_tasks_md(rows: list[AgentTodoRow]) -> str:
    lines = ["## Implementation tasks", ""]
    for row in rows:
        mark = "x" if row.done else " "
        lines.append(f"- [{mark}] {row.text}")
    return "\n".join(lines).strip() + "\n"


def plan_title_from_rows(rows: list[AgentTodoRow]) -> str:
    for row in rows:
        if row.current and not row.done:
            t = row.text.strip()
            if t:
                return t[:120]
    for row in rows:
        if not row.done:
            t = row.text.strip()
            if t:
                return t[:120]
    return AGENT_PLAN_TITLE


def _ensure_agent_link(item: TodoItem, agent_todo_relpath: str | None) -> None:
    if agent_todo_relpath:
        link = agent_todo_link_for(agent_todo_relpath)
        if link not in item.links:
            item.links = [*item.links, link]
    elif AGENT_PLAN_LINK not in item.links:
        item.links = [*item.links, AGENT_PLAN_LINK]


def _resolve_target_task(store: TodoStore, target_todo_id: str | None) -> TodoItem | None:
    if target_todo_id:
        return store.todos and next((t for t in store.todos if t.id == target_todo_id), None)
    if not store.active_id:
        return None
    item = next((t for t in store.todos if t.id == store.active_id), None)
    if item and item.status not in ("done", "cancelled"):
        return item
    return None


def import_agent_plan_store(
    store: TodoStore,
    rows: list[AgentTodoRow],
    *,
    target_todo_id: str | None = None,
    agent_todo_relpath: str | None = None,
) -> TodoStore:
    if not rows:
        return store

    checklist = [
        ChecklistItem(id=uuid.uuid4().hex[:8], text=row.text, done=row.done) for row in rows
    ]
    tasks_md = rows_to_tasks_md(rows)
    any_open = any(not row.done for row in rows)
    status: str = "in_progress" if any_open else "done"
    now = _now_iso()

    target = _resolve_target_task(store, target_todo_id)
    if target:
        target.title = plan_title_from_rows(rows) if target.title in (AGENT_PLAN_TITLE, "Untitled") else target.title
        target.checklist = checklist
        target.tasks_md = tasks_md
        if target.status not in ("done", "cancelled"):
            target.status = status  # type: ignore[assignment]
        target.updated_at = now
        _ensure_agent_link(target, agent_todo_relpath)
        store.active_id = target.id
        return store

    existing = next(
        (
            t
            for t in store.todos
            if AGENT_PLAN_LINK in t.links
            or parse_agent_todo_link(t.links)
            or t.title == AGENT_PLAN_TITLE
        ),
        None,
    )
    title = plan_title_from_rows(rows)
    if existing:
        existing.title = title
        existing.checklist = checklist
        existing.tasks_md = tasks_md
        existing.status = status  # type: ignore[assignment]
        existing.updated_at = now
        _ensure_agent_link(existing, agent_todo_relpath)
        store.active_id = existing.id
    else:
        item = TodoItem(
            id=uuid.uuid4().hex,
            title=title,
            tasks_md=tasks_md,
            status=status,  # type: ignore[arg-type]
            links=[AGENT_PLAN_LINK],
            checklist=checklist,
            created_at=now,
            updated_at=now,
        )
        _ensure_agent_link(item, agent_todo_relpath)
        store.todos.insert(0, item)
        store.active_id = item.id

    return store


def export_todo_item_to_agent(workspace: Path, relpath: str, item: TodoItem) -> None:
    rows = rows_from_todo_item(item)
    if not rows:
        return
    path = workspace / relpath
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(format_agent_todo_txt(rows) + "\n", encoding="utf-8")


def export_agent_plan_for_task(workspace_dir: str | Path, todo_id: str) -> None:
    api = WorkspaceTodos(workspace_dir)
    store = api.load()
    item = api.find(store, todo_id)
    if not item:
        raise ValueError(f"Unknown task: {todo_id}")
    relpath = parse_agent_todo_link(item.links)
    if not relpath:
        raise ValueError("Task is not linked to a Cecli agent todo.txt")
    export_todo_item_to_agent(api.root, relpath, item)


def import_agent_plan_for_workspace(
    workspace_dir: str | Path,
    *,
    agent_todo_relpath: str | None = None,
    target_todo_id: str | None = None,
) -> TodoStore:
    api = WorkspaceTodos(workspace_dir)
    root = api.root
    todo_path = resolve_agent_todo_path(root, agent_todo_relpath)
    if not todo_path:
        raise FileNotFoundError(
            "No Cecli agent todo.txt in this workspace (.cecli/agents/…/todo.txt)"
        )
    rows = parse_agent_todo_txt(todo_path.read_text(encoding="utf-8"))
    if not rows:
        raise ValueError("Agent todo.txt is empty")
    relpath = agent_todo_relpath or str(todo_path.relative_to(root)).replace("\\", "/")
    store = import_agent_plan_store(
        api.load(),
        rows,
        target_todo_id=target_todo_id,
        agent_todo_relpath=relpath,
    )
    api.save(store)
    active = next((t for t in store.todos if t.id == store.active_id), None)
    if active:
        api.sync_spec_files(active)
    return store


def session_agent_todo_relpath(session: Session) -> str:
    return session.coder.local_agent_folder("todo.txt")


def sync_session_agent_todos(session: Session, *, pull: bool = True, push_active: bool = True) -> TodoStore:
    """
    Two-way link for the current chat session:
    - pull: agent todo.txt → workspace (active task, or agent-plan task)
    - push: active workspace task → this session's todo.txt
    """
    api = WorkspaceTodos(session.coder.root)
    relpath = session_agent_todo_relpath(session)
    store = api.load()

    if pull:
        path = api.root / relpath
        if path.is_file():
            rows = parse_agent_todo_txt(path.read_text(encoding="utf-8"))
            if rows:
                store = import_agent_plan_store(
                    store,
                    rows,
                    target_todo_id=store.active_id,
                    agent_todo_relpath=relpath,
                )

    if push_active and store.active_id:
        item = api.find(store, store.active_id)
        if item:
            export_todo_item_to_agent(api.root, relpath, item)
            _ensure_agent_link(item, relpath)
            item.updated_at = _now_iso()

    api.save(store)
    if store.active_id:
        active = api.find(store, store.active_id)
        if active:
            api.sync_spec_files(active)
    return store


def maybe_export_task_to_agent(workspace_dir: str | Path, item: TodoItem) -> None:
    """After a workspace task edit, push to linked agent todo.txt if bound."""
    relpath = parse_agent_todo_link(item.links)
    if not relpath:
        return
    export_todo_item_to_agent(Path(workspace_dir).resolve(), relpath, item)
