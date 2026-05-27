"""Workspace metadata directory migration."""

from __future__ import annotations

from pathlib import Path

from bright_vision_core.workspace_paths import (
    WORKSPACE_META_DIR,
    attachments_dir,
    todos_json_path,
    workspace_meta_dir,
)
from bright_vision_core.workspace_todos import WorkspaceTodos


def test_migrates_aider_vision_into_cecli(tmp_path: Path):
    legacy = tmp_path / ".aider-vision"
    legacy.mkdir()
    (legacy / "todos.json").write_text('{"version":1,"active_id":null,"todos":[]}', encoding="utf-8")
    (legacy / "specs").mkdir()
    (legacy / "specs" / "abc").mkdir()
    (legacy / "specs" / "abc" / "tasks.md").write_text("# tasks", encoding="utf-8")

    meta = workspace_meta_dir(tmp_path)
    assert meta.name == WORKSPACE_META_DIR == ".cecli"
    assert not legacy.exists()
    assert todos_json_path(tmp_path).is_file()
    assert (meta / "specs" / "abc" / "tasks.md").is_file()


def test_merges_into_existing_cecli_agents(tmp_path: Path):
    cecli = tmp_path / ".cecli"
    (cecli / "agents").mkdir(parents=True)
    legacy = tmp_path / ".aider-vision"
    legacy.mkdir()
    (legacy / "todos.json").write_text('{"version":1,"active_id":null,"todos":[]}', encoding="utf-8")

    meta = workspace_meta_dir(tmp_path)
    assert (cecli / "agents").is_dir()
    assert meta == cecli
    assert todos_json_path(tmp_path).is_file()


def test_workspace_todos_uses_cecli(tmp_path: Path):
    api = WorkspaceTodos(tmp_path)
    assert str(api.path).endswith(".cecli/todos.json")
    assert str(api.specs_root).endswith(".cecli/specs")


def test_attachments_dir_under_cecli(tmp_path: Path):
    path = attachments_dir(tmp_path)
    assert path == tmp_path / ".cecli" / "attachments"


def test_concurrent_migration_race_safe(tmp_path: Path):
    """Second merge must not crash if the first pass already moved todos.json."""
    legacy = tmp_path / ".aider-vision"
    legacy.mkdir()
    (legacy / "todos.json").write_text('{"version":1,"active_id":null,"todos":[]}', encoding="utf-8")
    cecli = tmp_path / ".cecli"
    cecli.mkdir()
    (cecli / "agents").mkdir()

    workspace_meta_dir(tmp_path)
    # Simulate partial legacy listing after todos.json was moved
    if legacy.exists():
        legacy.mkdir(exist_ok=True)

    workspace_meta_dir(tmp_path)
    assert todos_json_path(tmp_path).is_file()
