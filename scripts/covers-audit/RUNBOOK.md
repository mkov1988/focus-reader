# Covers runbook — the desk runs, in order

Everything here is Michael's-terminal work (long runs, per CLAUDE.md).
Prereqs: repo node_modules installed, `unzip` on PATH. Plan and reasoning:
docs/planning/covers-plan.md.

## Phase 1 — fix the hot set (~1,401 books, ~1-2 hours polite)

```
# 1. Replace branded cards with Standard Ebooks art where they have the book
node scripts/se-covers.mjs --map          # ~30 min, builds the SE↔book map
node scripts/se-covers.mjs --fetch        # downloads matching covers

# 2. Upgrade everything else to full resolution from the book files
node scripts/mirror-covers-hires.mjs      # polite, resumable
```

After both: books still uncovered (branded card + no SE match, listed in
`public/covers/_hires-nocover.json` plus the remainder of `branded.json`)
wait for the generated-cover pipeline. Do NOT deploy while any branded id
still has its old file in public/covers — delete those files first; the
deploy guard's minCovers in scripts/deploy-manifest.json must be updated in
the same change, deliberately.

## Phase 2 — the long tail (~54.5k books)

```
# 1. Cover thumbnails from the sanctioned mirror (one-time, ~1-2 GB)
rsync -avm --include='pg*.cover.medium.jpg' --include='*/' --exclude='*' \
  rsync.ibiblio.org::gutenberg-epub/ mirror/cover-src/

# 2. Sort real art from branded cards
node scripts/mirror-covers-longtail.mjs --classify

# 3. Full-resolution book files, only for the real ones
node scripts/mirror-covers-longtail.mjs --want-list
rsync -av --files-from=mirror/covers-want.txt \
  rsync.ibiblio.org::gutenberg-epub/ mirror/epub-src/

# 4. Extract, convert, stage
node scripts/mirror-covers-longtail.mjs --stage

# 5. Ship: upload mirror/covers/ to the covers/ prefix of the primary
#    bucket (rclone, same pattern as upload-r2.mjs), then backup
rclone copy mirror/covers r2:focus-reader-books/covers --progress
node scripts/backup-r2.mjs
```

The covers/ prefix is served to apps by functions/covers/[id].js (deploy
that first — test with `node scripts/deploy-pages.mjs --preview`).

## Phase 3 — generated covers

For every book still uncovered after phases 1-2 (all the "card" and
"missing" classifications). Design pilot: scripts/covers-pilot/. Direction
approved 2026-08-24: mood-driven scenes, wider muted palette, no era label;
make popular books' art book-specific (Michael: a blue castle for The Blue
Castle, a deerstalker for Sherlock, the Cheshire cat for Alice) — but only
build these after phase 1 shows which popular books still need them.
