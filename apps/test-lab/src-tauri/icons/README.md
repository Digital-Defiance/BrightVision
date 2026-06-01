# Test Lab app icons

These files are bundled separately from the main BrightVision app (`src-tauri/icons/`).

Generate all sizes from one square PNG (1024×1024 recommended):

```bash
# from repo root — pass your source art
yarn test-lab:icon path/to/test-lab-icon.png

# or from apps/test-lab (default input: ./app-icon.png)
yarn tauri:icon ./app-icon.png
```

Output lands in this directory (`icons/` next to `tauri.conf.json`). Then rebuild:

```bash
yarn test-lab:dev   # dev
# or production bundle via Tauri
```

Tauri expects `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns` (macOS), and `icon.ico` (Windows). A distinct tray/dock icon here does not change the main IDE icon.
