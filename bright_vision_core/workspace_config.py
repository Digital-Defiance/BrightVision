"""Repo-local cecli workspace file helpers for Vision sessions."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

WORKSPACE_YAML_NAMES = (".cecli.workspaces.yml", ".cecli.workspaces.yaml")


def workspaces_file_in_project(workspace: Path) -> Path | None:
    root = workspace.resolve()
    for name in WORKSPACE_YAML_NAMES:
        candidate = root / name
        if candidate.is_file():
            return candidate
    return None


def ensure_workspaces_file(workspace: Path, config: dict[str, Any] | None) -> None:
    """
    Write ``.cecli.workspaces.yml`` when the client supplies config and no file exists yet.
    Does not overwrite an existing user file.
    """
    if not config:
        return
    if workspaces_file_in_project(workspace):
        return
    target = workspace / ".cecli.workspaces.yml"
    target.write_text(yaml.dump(config, sort_keys=False), encoding="utf-8")


def read_workspaces_yaml_text(workspace: Path) -> tuple[str, str] | None:
    """Return ``(filename, raw text)`` when a workspace file exists."""
    path = workspaces_file_in_project(workspace)
    if not path:
        return None
    return path.name, path.read_text(encoding="utf-8")


def describe_cecli_workspace(workspace: Path) -> dict[str, Any]:
    """
  Summary for Settings / header chip.

  Does not validate paths on disk; uses cecli ``validate_config`` when parseable.
    """
    root = workspace.resolve()
    raw_pair = read_workspaces_yaml_text(root)
    if not raw_pair:
        return {
            "present": False,
            "filename": None,
            "name": None,
            "project_count": 0,
            "projects": [],
            "layout": None,
            "raw": None,
        }

    filename, raw = raw_pair
    out: dict[str, Any] = {
        "present": True,
        "filename": filename,
        "name": None,
        "project_count": 0,
        "projects": [],
        "layout": "local",
        "raw": raw,
    }
    try:
        loaded = yaml.safe_load(raw) or {}
        if not isinstance(loaded, dict):
            return out
        from cecli.helpers.monorepo.config import validate_config

        validate_config(loaded)
        out["name"] = loaded.get("name")
        projects = loaded.get("projects") or []
        if not isinstance(projects, list):
            return out
        summaries = []
        for p in projects:
            if not isinstance(p, dict):
                continue
            entry: dict[str, Any] = {
                "name": p.get("name"),
                "primary": bool(p.get("primary")),
                "readonly": bool(p.get("readonly")),
            }
            if p.get("path"):
                entry["path"] = str(p["path"])
            if p.get("repo"):
                entry["repo"] = str(p["repo"])
            summaries.append(entry)
        out["projects"] = summaries
        out["project_count"] = len(summaries)
    except Exception as err:
        out["parse_error"] = str(err)
    return out
