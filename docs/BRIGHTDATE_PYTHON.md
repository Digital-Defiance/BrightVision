# brightdate-python submodule

PyPI **`brightdate`** [0.1.0](https://pypi.org/project/brightdate/0.1.0/) · source submodule **`brightdate-python/`** → [Digital-Defiance/brightdate-python](https://github.com/Digital-Defiance/brightdate-python).

## Clone / update

```bash
git submodule update --init brightdate-python
# or
sh scripts/init-brightdate-python-submodule.sh
source activate.sh   # pip install -e brightdate-python
```

## First-time repo setup (maintainers)

1. Create empty GitHub repo `Digital-Defiance/brightdate-python`.
2. From the submodule directory (first commit):

```bash
cd brightdate-python
git init -b main
git add -A
git commit -m "feat: brightdate 0.1.0 — epoch, convert, format, ISO, btime"
git remote add origin https://github.com/Digital-Defiance/brightdate-python.git
git push -u origin main
git tag -a v0.1.0 -m "brightdate 0.1.0"
git push origin v0.1.0
```

3. Parent BrightVision already records the submodule in `.gitmodules`; after push, pin the gitlink:

```bash
cd ..
git add brightdate-python .gitmodules
git commit -m "chore: pin brightdate-python submodule"
```

4. PyPI: configure trusted publishing per [brightdate-python/PUBLISH.md](../brightdate-python/PUBLISH.md); tag `v0.1.0` triggers the publish workflow.

## BrightVision dependency

Root `pyproject.toml` declares `brightdate>=0.1.0,<1`. Dev: `source activate.sh` (editable submodule). CI / PyPI-only: `pip install brightdate` or `BRIGHT_VISION_CORE_INSTALL=pypi source activate.sh` once `bright-vision-core` wheels pin PyPI `brightdate`.

## Consumers in this repo

| App / layer | Library | Role |
|-------------|---------|------|
| **Vision API / Test Lab runner** | PyPI `brightdate` | `btime` bounds, durations, ETC in `bright_vision_core` + `test_suite/` |
| **Desktop UI + Test Lab UI** | npm `@brightchain/brightdate` via `@brightvision/vision-client` | Settings timing, Test Lab step ETA/ETC chips |

`bright_vision_core/brightdate.py` is only BrightVision glue (env flags, bgpucap format string, `btime` argv).

## Related

- Spec: [brightdate-specification](https://github.brightdate.org/docs/papers/brightdate-specification)
- npm: `@brightchain/brightdate`
- Rust CLI: [brightdate-rust](https://github.com/Digital-Defiance/brightdate-rust) (`btime`)
