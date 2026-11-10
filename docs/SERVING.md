# Serving topology

The one page that describes how book data reaches installed apps. Everything
here was previously reconstructable only from wrangler.toml comments, the
function's comments, and commit messages.

```
Android app (src/config.ts: SERVING_ORIGIN)
  │
  ▼
Cloudflare Pages project "focus-reader"  →  https://focus-reader-48z.pages.dev
  │  production branch: main (deploy script targets it explicitly)
  │  preview: any other branch name (deploy --preview uses audit-preview)
  │
  ├── static assets (dist/, max 20k files — why the long tail is NOT here)
  │     /books/<id>.txt      1,401 curated texts (hot set; a CACHE of the bucket)
  │     /covers/<id>.webp    1,468 covers (same)
  │     /starts-v1.json      54,525 deep-catalog story starts (filename IS the version)
  │     /narration-v1.json   which books have narration, by voice (same contract)
  │     caching + CORS: public/_headers
  │
  ├── Pages Function  functions/books/[id].js
  │     static asset first (ASSETS.fetch, SPA-fallback content sniff),
  │     else R2 bucket "focus-reader-books" key books/<id>.txt
  │     sets immutable cache + Access-Control-Allow-Origin on R2 responses
  │
  ├── Pages Function  functions/covers/[id].js   (added 2026-11)
  │     same ladder for covers: static first, else key covers/<id>.webp
  │
  └── Pages Function  functions/audio/[[path]].js
        /audio/<id>/<voice>/seg-NNN.opus and .../timing-v1.json from the
        same bucket's audio/ prefix; strict path shape, no Range (the app
        downloads whole segments to disk, then plays locally)

R2 bucket "focus-reader-books"  (binding BOOKS in wrangler.toml) — the ONE
place that holds everything the app can ask for:
  books/<id>.txt                 55,863 long-tail texts (~19 GB) + the 1,401
                                 curated texts (54 of them exist nowhere else
                                 in the mirror: the bulk quality gate rejected
                                 them, they were served statically all along)
  covers/<id>.webp               1,468 curated covers (long-tail covers go here
                                 too when they are made)
  audio/<id>/<voice>/…           narration segments + timing
  uploaded via scripts/upload-r2.mjs, scripts/upload-audio-r2.mjs and
  .github/workflows/r2-hot-set.yml (keys in .r2.env at repo root / repo secrets)
  rebuild source: mirror/books + scripts/narration/work on Michael's machine
  (backup: docs/BACKUP.md; backup-r2.mjs covers books, covers, and audio)
```

Why the static copy stays even though the bucket has everything: static
assets are free and unmetered; every Function invocation (the R2 door) counts
against the Workers free plan's daily request quota. The hot set — what most
opens and every shelf paint hit — stays static, the bucket is the source of
truth and serves the rest. A deploy that misses a static cover or text no
longer deletes it from production: the door answers from the bucket.

## The three URLs shipped inside APKs

`Focus Reader Android/src/config.ts` is the single owner: BOOK_BASE,
COVER_BASE, STARTS_URL, all derived from SERVING_ORIGIN. Before the first
public APK, front the Pages project with a custom domain we own and change
SERVING_ORIGIN once (installed apps cannot be re-pointed afterward).

## Operations

| Task | Command |
|---|---|
| Deploy (production) | `npm run deploy` (guarded: refuses without books/covers/starts in dist) |
| Deploy (preview) | `node scripts/deploy-pages.mjs --preview` |
| Upload new/changed long-tail books | `npm run upload:r2 -- --changed` (or `--all`, `--ids=`) |
| Put the static hot set (curated texts + covers) into the bucket too | GitHub Actions → "R2 hot set" (`.github/workflows/r2-hot-set.yml`; fetches production, copies with `--ignore-existing`, reads back) |
| Upload finished narration audio | `node scripts/upload-audio-r2.mjs --ids=…` (then `node scripts/backup-r2.mjs`) |
| Re-verify strip copies | `npm run check:strip` |

Every production deploy replaces the whole static surface for installed
apps; that is why the content guard exists and why infra changes should go
through a preview deploy first.
