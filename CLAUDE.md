# Focus Reader web repo, read this first

The web app here is RETIRED as a product (July 2026). The product is the
native Android app at `../Focus Reader Android` (start with its AGENTS.md).
This repo is serving infrastructure + data pipelines + archived spec, and
README.md is the map. Do not build or "fix" web UI features here.

Standing rules:

- `src/` is frozen but deploy load bearing (the Pages site builds from it).
  Serving and data changes only.
- The Gutenberg strip is legally load bearing. Read LEGAL.md before touching
  it; run `node scripts/check-strip-sync.mjs` after.
- Pipelines and their run order live in scripts/README.md. Long runs (full
  mirrors, crawls) go in Michael's terminal, never in a session.
- Deploys are production for installed apps. Use
  `node scripts/deploy-pages.mjs --preview` to test infra changes first.
- Challenge the premise before building; verify programmatically before
  declaring done.
- Talk to Michael in PLAIN ENGLISH, always. No jargon, no acronyms, no
  insider shorthand (nothing like "long tail", "OCR", "CC0", "static
  limit") — say what a thing is in everyday words or briefly explain it.
  Keep it concise: results and decisions, not minutiae.
