# Fonts (bundled for the desktop app)

Source of truth for full families: repo root [`assets/`](../../../assets/).  
Ship copies here so Vite bundles them into the app.

## UI + chat (Inter)

Copied from `assets/Inter/`:

| File | Weight |
|------|--------|
| `Inter-Regular.woff2` | 400 |
| `Inter-Medium.woff2` | 500 |
| `Inter-SemiBold.woff2` | 600 |
| `Inter-Bold.woff2` | 700 |

Registered in `src/styles/global.scss` as `font-family: Inter`. Default for UI and chat (Settings → Appearance).

## Wordmark (BrightVision logo text)

| File | CSS name |
|------|----------|
| `Inter-Black.woff2` | `Inter-Black` |
| `Inter-Thin.woff2` | `Inter-Thin` |

Used by inline SVG in `BrandLogo`, not the general UI stack.

## Optional retro chat

| File | Preset |
|------|--------|
| `Glass_TTY_VT220.woff2` | Settings → Appearance → Glass TTY VT220 |

Include font license terms in the repo if required for distribution (Inter OFL).
