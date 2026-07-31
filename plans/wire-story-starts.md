# Plan: Wire the deep-catalog story starts into the app

Goal: every book in the catalog (not just the 1,401 bundled ones) opens at its verified
first narrative sentence. The data already exists and is final; this is wiring only.
Design was adversarially reviewed; the decisions below are settled — follow them, don't
re-litigate. The hard product rule throughout: **nothing may ever block or delay the
book-open UX.** Worst case must always be exactly today's behavior.

## Data sources (already on disk, do not regenerate)

- `scripts/deep-starts/verified.json` — `{ [id]: startIndex }` for 54,525 long-tail books.
  Token indexes are in the reader's id space (parseText tokenization).
- `scripts/deep-starts/non-narrative.json` — array of ~4,950 ids flagged as pure reference
  works (dictionaries, factbooks). No consumer yet; carried along for future browse filters.
- `src/data/story-starts.json` — the bundled 1,401 shipped books. Already wired and live.
  **Zero id overlap** with verified.json. Leave untouched.
- `scripts/deep-starts/meta.json` (hooks/voice/era/tags, 11MB) — explicitly OUT of scope.
  It ships later as per-book sidecars once a UI surface actually displays hooks. Do not
  upload or wire it in this pass.

## Why one bulk file (settled design)

A start index is consumed once per book per device: only a FRESH open seeks to it; every
later open is a resume (`pending.startIndex` branch in App.tsx). Per-book fetches would
add races, timeouts, 404s for bundled books, and cache-staleness for near-zero cache hits.
All 54,525 starts gzip to ~221KB — one static file, loaded off the open path, looked up
synchronously in memory. No R2 upload, no new Pages Function.

## Step 1 — Alignment spot-check (do this BEFORE building anything)

The indexes were computed against mirror text; the reader tokenizes
`stripGutenbergBoilerplate(fetched text)` (see `src/services/library.ts` — the strip runs
even on pre-stripped mirror text; it is designed to be idempotent). Verify end to end:

- Pick ~10 ids from verified.json spread across the range (include a couple of verse/play
  books). For each, load `mirror/books/<id>.txt` (same bytes the bucket serves), replicate
  the app pipeline in a node script: apply the SAME strip logic library.ts uses, tokenize
  exactly like `parseText` (blank-line runs → skipped `[P]`, whitespace split), and print
  the 12 tokens at `verified[id]`.
- PASS = each prints the start of real narrative prose (not TOC/title/preface).
  If any misalign, STOP and report — do not ship a misaligned file.

## Step 2 — Build the bulk file

New script `scripts/build-starts-bundle.mjs`:

- Reads verified.json + non-narrative.json.
- Writes `public/starts-v1.json` with shape:
  `{ "v": 1, "starts": { [id]: startIndex }, "nn": [ids...] }`
- The filename IS the version. Future re-verification rounds ship `starts-v2.json` and bump
  one constant in the app — never mutate v1 in place (immutable caching depends on this).
- Print count + byte size as a sanity check (~54,525 starts, ~630KB raw).

## Step 3 — App wiring (web repo)

New tiny service `src/services/deepStarts.ts`:

- `loadDeepStarts()`: fetches `/starts-v1.json` same-origin, **in the background after
  first paint** (e.g. kicked off from App mount inside `requestIdleCallback` or a
  `setTimeout(…, 3000)` — NOT on the open path). Parses into an in-memory map. Persists
  the parsed object in IndexedDB (reuse the existing bookCache IDB patterns) so later
  cold launches can hydrate from disk even offline; hydrate-from-IDB first, then fetch
  only if absent.
- Guard for dev servers / SPA fallback: reject any response whose content-type includes
  `text/html`, and try/catch the `.json()` (vite dev serves index.html for unknown paths).
  On any failure: silently do nothing (feature simply stays off; heuristic covers it).
- `getDeepStart(id): number | null` — synchronous in-memory lookup. Returns null until
  loaded; that's fine.

Wire into `src/App.tsx` `completePendingOpen` (the fresh-open branch that currently does
bundled `getStoryStart(id)` → `readableStartWord`):

- New precedence: bundled `getStoryStart(id)` → `getDeepStart(id)` → `readableStartWord`.
- Apply the same bounds guard the bundled path has: only use the index if
  `idx < pendingParsed.tokens.length` (tier-3 live-Gutenberg fetches can tokenize
  differently than the mirror).
- Synchronous read only. **Never await anything here, never re-seek after the reader has
  shown words.** If the file hasn't loaded yet on a device's very first open, the
  heuristic handles that one open — acceptable by design.

Service worker (`vite.config.ts`, vite-plugin-pwa):

- **Exclude** `starts-v1.json` from the precache manifest (don't make every visitor
  download 630KB at install; check `globPatterns`/`globIgnores`).
- Add a runtime CacheFirst rule for `/starts-*.json` with its **own cacheName**
  (e.g. `story-starts`), NOT the existing book-text cache (that one is entry-capped and
  protects expensive book downloads; don't let this churn it).

## Step 4 — Verify (must be against production, not just local)

1. `npx tsc -b` clean, `npm run build` clean.
2. Deploy (`node scripts/deploy-pages.mjs`).
3. `curl` the deployed `/starts-v1.json` — JSON served, correct size.
4. On the live site (mobile viewport), open a long-tail book that is NOT in
  `public/books` (pick an id from verified.json; reach it via search). Confirm the reader
  opens at the verified start (compare visible first words against the node script's
  output from Step 1), not at the title page.
5. Confirm a bundled book (e.g. Alice, id 11) still opens exactly as before.
6. Confirm graceful degradation: with the file blocked (devtools offline or before load),
  a long-tail open still works via the heuristic.

## Step 5 — Commit

Commit the script, the service, App.tsx, vite.config.ts changes, and `public/starts-v1.json`
(yes, commit the JSON — it's versioned data, 630KB, and deploys must be reproducible).
Message should note: starts land for 54,525 long-tail books, bulk-file design, hooks/meta
deferred. Do NOT push.

## Step 6 — Native counterpart (C:\Users\Michael\Desktop\Focus Reader Android)

The APK is the product actually in Michael's pocket; it currently uses NEITHER the bundled
1,401 starts nor the new 54k — a fresh open falls to `parsed.readableStartWord`
(`src/screens/ReaderScreen.tsx`, the `initialIndex` memo around line 133). Bring it to
parity in the same pass, AFTER the web deploy is verified (native fetches from the web
deployment, so web ships first).

1. **Bundle the shipped set:** copy the web repo's `src/data/story-starts.json` (16KB,
   1,401 books) into native `src/data/` and add a `getStoryStart(id)` lookup in native
   `src/services/scenes.ts`, mirroring the web service.
2. **Deep starts:** fetch `https://focus-reader-48z.pages.dev/starts-v1.json` once in the
   background at app start (native has no CORS constraints). Keep it in memory and persist
   it with the same storage the native book cache uses, hydrate-from-disk first on later
   launches. Silent failure = feature off, heuristic covers it. Never fetch on the open path.
3. **Precedence in `initialIndex`:** explicit `startIndex` from the opener (resume) →
   bundled `getStoryStart(book.id)` → deep-starts lookup → `parsed.readableStartWord`.
   The existing `Math.min(…, tokens.length - 1)` clamp already provides the bounds guard —
   keep it wrapping the whole expression. Synchronous lookups only; never delay open.
4. **Version bump:** bump `expo.version` in the native `app.json` (Michael verifies builds
   by the version stamp on Today).
5. **Verify:** native typecheck clean; then the Android web QA harness (port 8090, layout/
   data checks work there) — open a long-tail book and confirm it starts at the verified
   first sentence, and a bundled book (e.g. 84) starts at its authored start. Pacing/feel
   checks are device-only and are NOT needed for this change.
6. Commit the native repo separately (its own message, do not push).

## Explicitly deferred (do not do in this pass)

- Hooks/voice/era/tags sidecars (waits for a UI surface).
- Any use of the `nn` list beyond shipping it in the file.
- The top-800 deep pass (recaps + snippets) — separate track entirely.
