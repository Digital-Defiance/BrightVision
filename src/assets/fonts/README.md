# Brand font

Commit **Glass TTY VT220** here as:

```
Glass_TTY_VT220.woff2
```

The in-app SVG wordmarks (`src/assets/brand/*.svg`) reference this family. If the file is missing, logos fall back to the wrong system font — use `BRAND_LOGO_MODE = 'png'` in `src/brand.ts` until the font is present.

Include font license terms in the repo if required for distribution.
