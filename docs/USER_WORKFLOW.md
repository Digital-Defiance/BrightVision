# User workflow

## What you install

**Aider Vision** is the desktop app. **Aider Vision Core** ships inside it (submodule at `aider-vision-core/`). You do not add core to every project you code on.

## First-time setup (developers of Vision)

```bash
git clone https://github.com/Digital-Defiance/aider-vision.git
cd aider-vision
git submodule update --init --recursive
source activate.sh
yarn install
yarn tauri dev
```

On launch, **project** defaults to the app repo. Use Chat welcome or Settings to point at another repo if needed.

## Day-to-day use

1. **Open the app** — project path is auto-detected or restored from last session.
2. **Choose project** (optional) — welcome card or Settings → folder picker. This is the git repo the agent edits.
3. **Settings** (optional) — model, LiteLLM params, context files → **Save**.
4. **Terminal → Start** — spawns core from the app bundle, opens an HTTP session on your project.
5. **Chat** — send prompts; git activity appears on the Git tab.

## Two paths

| Goal | Project workspace | Engine |
|------|-------------------|--------|
| Hack on Aider Vision itself | `aider-vision` repo root | Bundled `aider-vision-core` |
| Work on any other repo | That repo’s root (via picker) | Same bundled engine |

## Environment

- `AIDER_VISION_ENGINE` — optional absolute path to core if not using the default bundle.
