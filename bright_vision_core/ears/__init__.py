"""
EARS (Easy Approach to Requirements Syntax) — spec grammar, lint, and index.

Standalone package: no imports from Session, http_api, or workspace_todos.
Designed for eventual lift into cecli (see docs/EARS_MODULE.md).
"""

from bright_vision_core.ears.index import build_spec_index
from bright_vision_core.ears.lint import analyze_requirements
from bright_vision_core.ears.model import (
    EarsClause,
    EarsIssue,
    EarsLintResult,
    PatternKind,
    Severity,
)
from bright_vision_core.ears.trace import analyze_traceability

__all__ = [
    "EarsClause",
    "EarsIssue",
    "EarsLintResult",
    "PatternKind",
    "Severity",
    "analyze_requirements",
    "analyze_traceability",
    "build_spec_index",
]
