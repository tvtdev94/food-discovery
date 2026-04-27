# public/ — Static Assets

## Required binary icons (NOT generated yet)

These PNG files must be created before submitting to app stores or running Lighthouse PWA audit:

| File | Size | Purpose |
|------|------|---------|
| `icon-192.png` | 192×192 px | Standard PWA icon (Android home screen) |
| `icon-512.png` | 512×512 px | Large PWA icon (splash screen) |
| `icon-maskable.png` | 512×512 px | Maskable icon — keep content within inner 80% safe zone |
| `og-image.png` | 1200×630 px | Open Graph share image |

## How to generate

**Option A — Online tool (recommended for MVP):**
1. Go to https://realfavicongenerator.net
2. Upload `icon.svg` (the orange circle SVG in this folder)
3. Download the generated package, copy the PNG files here

**Option B — ImageMagick (CLI):**
```bash
# Requires ImageMagick installed
magick icon.svg -resize 192x192 icon-192.png
magick icon.svg -resize 512x512 icon-512.png
magick icon.svg -resize 512x512 icon-maskable.png
```

**Option C — Design skill:**
Use `/ck:ai-multimodal` or ImageMagick skill to generate from `icon.svg`.

## OG image

`og-image.png` should be 1200×630 px. Suggested content:
- Orange background (#f97316)
- White text: "ĂnGì" large + "Hôm nay ăn gì?" subtitle
- Simple food emoji or illustration

## Fallback

`icon.svg` is a valid SVG favicon (orange circle with "ĂG" text). Used as:
- `<link rel="icon" href="/icon.svg">` (modern browsers)
- Fallback until PNG icons are generated
