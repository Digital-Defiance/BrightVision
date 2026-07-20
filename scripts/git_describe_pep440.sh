#!/usr/bin/env sh
# Git describe for setuptools-scm: map v0.2.1-bright5 tags to PEP 440 (v0.2.1.post5).
# Invoked from pyproject.toml [tool.setuptools_scm] git_describe_command (root = last arg).
set -eu
root="${1:-.}"
cd "$root"
desc="$(git describe --tags --long --match 'v*' 2>/dev/null)" || desc="$(git describe --tags --always 2>/dev/null)"
printf '%s\n' "$desc" | sed -E 's/^v([0-9]+\.[0-9]+\.[0-9]+)-bright([0-9]+)/v\1.post\2/g'
