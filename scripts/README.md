# Pipelines

The map for every script here: what belongs to which pipeline, what order
things run in, and which scripts are one time backfills that should NOT be
rerun casually. Authored source data lives in `../data-src/` (precious,
committed); `scripts/` itself is code plus gitignored scratch (dotfiles) plus
the committed deep pass stores under `deep-starts/`.

**Every pipeline ends the same way:** `npm run export:native` writes the four
bundled data files into the Android repo in native schema. Hand copying is
retired; if you changed data and the app should see it, run the export and
bump `expo.version` over there.

## 1. Curated catalog

The 988 book curated set in `src/data/curated.json`.

| Step | Command | Notes |
|---|---|---|
| 1 | `node scripts/fetch_curated_books.mjs` | **Backfill, every few months at most.** Fully OVERWRITES curated.json; steps 2 to 4 MUST rerun after it. |
| 2 | `npm run mirror:books -- --curated` | mirror any new texts |
| 3 | `node scripts/repair-curated.mjs` | swap dead editions (run AFTER mirror:books) |
| 4 | `npm run build:downloads` | refresh download counts |
| 5 | `npm run export:native` | ship to the app |

## 2. Covers and curated book text (the hot set)

Outputs are gitignored local artifacts served as Pages static assets; the
deploy guard in deploy-pages.mjs counts them before any push.

- `npm run mirror:covers` → `public/covers/` (1,468 webp)
- `npm run mirror:books` → `public/books/` (1,401 txt, stripped at mirror
  time by `lib/strip-gutenberg.mjs`)

## 3. Bulk mirror and R2 (the 55,863 book long tail)

Long runs: Michael's terminal, never in a session.

| Step | Command | Notes |
|---|---|---|
| 1 | `npm run crawl:catalog` | full Gutenberg catalog crawl → `mirror/catalog.json` |
| 2 | `npm run mirror:all` | download + quality gate + strip → `mirror/books/` (~19 GB); resumable; rejects logged to `mirror/_rejected.json` |
| 3 | `node scripts/upload-r2.mjs --all` | sync into the `focus-reader-books` bucket (keys in `.r2.env` at repo root) |

After any resweep or strip fix: `node scripts/resweep-trademark.mjs` then
`node scripts/upload-r2.mjs --changed`.

## 4. Vibes

- `npm run build:vibes` rebuilds `src/data/vibes.json` from `crawl-vibes`
  era research plus curation; then `npm run export:native` (the export owns
  the native schema rename, do not hand edit).
- `node scripts/add-vibe-wordcounts.mjs` refreshes the `words` fields
  (HEAD Content-Length based; resumable cache in `.vibe-wordcounts.json`).

## 5. Story starts, scenes, and the deep pass

The precision pipeline: anchors are token indexes against the EXACT mirrored
bytes (see ../docs/BACKUP.md for why that makes backups load bearing).

| Step | Command | Notes |
|---|---|---|
| authored + verdicts | `data-src/scenes-src.json`, `data-src/story-starts-overrides.json` | precious, committed, hand + agent authored |
| build starts | `npm run build:starts` | resolves anchors → `src/data/story-starts.json` |
| merge verdicts | `npm run merge:starts` | folds overrides in |
| build scenes | `npm run build:scenes` | resolves anchors → `src/data/scenes.json` |
| deep pass merge | `node scripts/merge-deep-pass.mjs <results.json>` | one funnel: updates the `deep-starts/` stores, appends to scenes-src, refreshes ../DEEP-PASS-CHECKLIST.md |
| bulk starts file | `node scripts/build-starts-bundle.mjs` | → `public/starts-v1.json` (filename IS the version, never mutate v1) |
| ship | `npm run export:native` | scenes + starts into the app |

Deep pass tooling lives in `deep-starts/` (wf-chunk, collect-journal,
merge-redo and friends, committed together with the stores they produced).
`deep-pass-verify-batches.mjs`, `apply-deep-pass-verdicts.mjs`, and
`harvest-deep-pass.mjs` drive the verification rounds; if another round ever
runs, persist the verdicts JSON next to the chunk (audit D21 note).

## Legal toolkit (read ../LEGAL.md first)

- `lib/strip-gutenberg.mjs`, THE canonical strip, imported by both mirror scripts
- `check-strip-sync.mjs`, verifies every strip copy agrees (run after touching any)
- `resweep-trademark.mjs`, cleans stored files after a strip fix

## Deploy and QA

- `node scripts/deploy-pages.mjs` (`--preview` for a non production URL);
  content guard counts come from `deploy-manifest.json`
- `test-bounds.mjs` (`npm test`), readable bounds integration test
- `build-parity-viewer.mjs`, the parity pack viewer

## One time backfills, do not rerun casually

`fetch_curated_books.mjs` (overwrites curated.json), `repair-curated.mjs`,
`add-curated-downloads.mjs`, `build-scene-labels.mjs`,
`segment-books-local.mjs` (local heuristic scenes, superseded by the deep
pass), `deep-starts-night.mjs` / `deep-starts-pass.mjs` / `merge-recap-night.mjs`
/ `merge-snippets.mjs` / `harvest-deep-pass.mjs` (the finished deep pass
grind), `fetch_curated_books.mjs`. When in doubt, read the script header;
every script states its own contract.
