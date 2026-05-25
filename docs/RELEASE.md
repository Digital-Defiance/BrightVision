# Release checklist (aider-vision + core submodule)

Use this when cutting a release that includes Tasks / spec-driven work (roadmap #18) and Vision HTTP API changes.

## 1. Core submodule (`aider-vision-core`)

```bash
cd aider-vision-core
git status   # ensure todo_spec_*, workspace_todos, http_api, session, tests are included
git add -A
git commit -m "$(cat <<'EOF'
feat(vision): todos API, spec layers, background generate jobs

Three-layer specs, workspace/session todo routes, ephemeral spec
generation jobs, move/reorder, branch/PR fields, and spec file sync.
EOF
)"
git tag -a v0.91.0-vision -m "Vision headless API: todos, specs, background jobs"
git push origin main --tags   # when ready
```

## 2. Pin parent app

```bash
cd ..
git add aider-vision-core   # submodule pointer at tag
# commit parent app UI + docs + Tauri todo fields
```

Or use the existing sync script after publishing to PyPI:

```bash
cd aider-vision-core && ./scripts/sync_aider_vision.sh <version> --commit
cd .. && yarn sync:core <version>
```

## 3. Verify

```bash
source activate.sh
yarn verify:submodule
yarn test:full         # local: tsc + vitest + rust + e2e (see TESTING.md)
# or: sh scripts/test-local.sh release   # adds verify:submodule when .venv exists
cd aider-vision-core && python -m pytest tests/basic/test_workspace_todos.py \
  tests/basic/test_todo_spec_generate.py tests/basic/test_todo_spec_jobs.py -q
yarn tauri dev   # smoke: Terminal Start/Stop, Tasks tab, Generate spec (background), Git tab
```

## 4. Optional

- `yarn build:mac` — see [BUILD_MACOS.md](./BUILD_MACOS.md)
- Bump `package.json` / `tauri.conf.json` version if shipping a desktop build
