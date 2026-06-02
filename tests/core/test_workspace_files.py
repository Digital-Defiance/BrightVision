"""Workspace path existence and spec-layer edit detection."""

from __future__ import annotations

from pathlib import Path

from bright_vision_core.workspace_files import (
    edited_spec_layers_for_todo,
    filter_existing_workspace_paths,
)


def test_filter_existing_workspace_paths(tmp_path: Path):
    f = tmp_path / "src" / "real.rs"
    f.parent.mkdir(parents=True)
    f.write_text("fn main() {}\n", encoding="utf-8")
    existing, missing = filter_existing_workspace_paths(
        tmp_path,
        ["src/real.rs", "src/ghost.rs", "../outside.rs"],
    )
    assert existing == ["src/real.rs"]
    assert missing == ["src/ghost.rs", "../outside.rs"]


def test_edited_spec_layers_for_todo():
    tid = "12926a1aadec47208e7f9a23d56bff7e"
    edited = [
        ".cecli/specs/12926a1a/requirements.md",
        "Cargo.toml",
    ]
    assert edited_spec_layers_for_todo(edited, tid) is True
    assert edited_spec_layers_for_todo(["Cargo.toml"], tid) is False
