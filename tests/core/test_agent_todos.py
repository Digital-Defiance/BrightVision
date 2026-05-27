"""Cecli agent todo.txt → workspace Tasks bridge."""

from __future__ import annotations

from pathlib import Path

import pytest

from bright_vision_core.agent_todos import (
    AGENT_PLAN_TITLE,
    agent_todo_link_for,
    export_todo_item_to_agent,
    import_agent_plan_for_workspace,
    import_agent_plan_store,
    parse_agent_todo_txt,
    rows_from_todo_item,
    format_agent_todo_txt,
    AgentTodoRow,
)
from bright_vision_core.workspace_todos import ChecklistItem, TodoItem, WorkspaceTodos, _now_iso


def test_parse_agent_todo_txt():
    raw = """Done:
✓ First done

Remaining:
→ Current task
○ Next task
"""
    rows = parse_agent_todo_txt(raw)
    assert len(rows) == 3
    assert rows[0].done and rows[0].text == "First done"
    assert rows[1].current and not rows[1].done
    assert rows[2].text == "Next task"


def test_import_agent_plan_into_workspace(tmp_path: Path):
    agents = tmp_path / ".cecli" / "agents" / "2026-05-27" / "abc"
    agents.mkdir(parents=True)
    (agents / "todo.txt").write_text(
        "Remaining:\n→ Ship feature\n○ Write tests\n",
        encoding="utf-8",
    )
    store = import_agent_plan_for_workspace(tmp_path)
    assert len(store.todos) == 1
    item = store.todos[0]
    assert item.title == "Ship feature"
    assert len(item.checklist) == 2
    assert store.active_id == item.id
    assert item.status == "in_progress"

    # Second import updates same task
    (agents / "todo.txt").write_text(
        "Remaining:\n→ Ship feature\n✓ Write tests\n",
        encoding="utf-8",
    )
    store2 = import_agent_plan_for_workspace(tmp_path)
    assert len(store2.todos) == 1
    assert store2.todos[0].checklist[1].done is True


def test_import_agent_plan_missing_file(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        import_agent_plan_for_workspace(tmp_path)


def test_import_merges_into_active_task(tmp_path: Path):
    api = WorkspaceTodos(tmp_path)
    now = _now_iso()
    user_task = TodoItem(
        id="user1",
        title="My feature",
        tasks_md="",
        status="in_progress",
        links=[],
        checklist=[],
        created_at=now,
        updated_at=now,
    )
    store = api.load()
    store.todos.append(user_task)
    store.active_id = user_task.id
    api.save(store)

    agents = tmp_path / ".cecli" / "agents" / "2026-05-27" / "sess"
    agents.mkdir(parents=True)
    rel = ".cecli/agents/2026-05-27/sess/todo.txt"
    (agents / "todo.txt").write_text("Remaining:\n→ Step A\n○ Step B\n", encoding="utf-8")

    store2 = import_agent_plan_for_workspace(tmp_path, agent_todo_relpath=rel)
    assert len(store2.todos) == 1
    item = store2.todos[0]
    assert item.id == "user1"
    assert item.title == "My feature"
    assert len(item.checklist) == 2
    assert agent_todo_link_for(rel) in item.links


def test_export_roundtrip(tmp_path: Path):
    rows = [
        AgentTodoRow(text="Done step", done=True, current=False),
        AgentTodoRow(text="Now", done=False, current=True),
        AgentTodoRow(text="Later", done=False, current=False),
    ]
    rel = ".cecli/agents/x/todo.txt"
    item = TodoItem(
        id="t1",
        title="Plan",
        tasks_md="",
        status="in_progress",
        links=[agent_todo_link_for(rel)],
        checklist=[
            ChecklistItem(id="a", text="Done step", done=True),
            ChecklistItem(id="b", text="Now", done=False),
            ChecklistItem(id="c", text="Later", done=False),
        ],
        created_at=_now_iso(),
        updated_at=_now_iso(),
    )
    assert rows_from_todo_item(item) == rows
    export_todo_item_to_agent(tmp_path, rel, item)
    path = tmp_path / rel
    assert path.is_file()
    parsed = parse_agent_todo_txt(path.read_text(encoding="utf-8"))
    assert [r.text for r in parsed] == [r.text for r in rows]
    assert format_agent_todo_txt(rows) in path.read_text(encoding="utf-8")
