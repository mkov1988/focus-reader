# Covers pilot — code-drawn covers, no AI, no cost

Draws sample book covers as images, one per mood, styled to the app
(espresso/cream/mustard/sage palette plus muted night blue, plum, blush,
sea-slate; Fraunces serif titles). Each book's saved mood picks the scene;
Michael approved this direction 2026-08-24 (no small era text above titles).

Run it:

1. `npm install @resvg/resvg-js sharp` (in a scratch folder, or add here)
2. Download fonts into `fonts/` (regular TTF files from Google Fonts):
   Fraunces 400, Fraunces 600, Fraunces Italic, Inter 600 — named
   `Fraunces-400.ttf`, `Fraunces-600.ttf`, `Fraunces-Italic.ttf`,
   `Inter-600.ttf`.
3. `node gen.mjs` → covers land in `out/` as PNG, 530×795 (2:3).

`picks.json` holds the 12 sample books (curated titles joined with their
mood/era data from `scripts/deep-starts/meta.json`).

Not wired into any pipeline yet — this is the design playground. The real
run would: pick scene by each book's first mood tag, vary layout/colors by a
stable per-book seed so every book keeps its cover forever, convert to webp,
and upload alongside real covers. See docs/planning/covers-plan.md.
