# Covers plan: real covers where we can get them, cozy generated covers everywhere else

Written 2026-08-24 from a deep research pass over this repo, the Android repo,
production, and external sources. Everything below was verified against real
files, live production responses, or cited external documents — not guessed.

**Status (2026-08-24, end of session):** Phase 0 done in-session — audit
found **785 of 1,468 production covers carry Project Gutenberg branding**
(list: `scripts/covers-audit/branded.json`), and `functions/covers/[id].js`
now serves covers from R2 with clean 404s. Phase 1+2 tools are built and
smoke-tested (`mirror-covers-hires.mjs`, `se-covers.mjs`,
`mirror-covers-longtail.mjs`); the desk runs are in
`scripts/covers-audit/RUNBOOK.md`. Phase 3 design pilot approved
(`scripts/covers-pilot/`): mood scenes, wider muted palette, no era label;
popular books get book-specific art (blue castle / deerstalker / Cheshire
cat) only after Phase 1 shows what still needs covers.

## The one fact that shapes everything

Both apps resolve every book's cover as
`https://focus-reader-48z.pages.dev/covers/<id>.webp`, built from the bare
Gutenberg id (Android `src/services/library.ts:31`, web same). No data files
carry cover URLs — `export-native.mjs` drops them on purpose. If the image
404s, the app draws its deterministic typographic fallback on device.

**So shipping covers = putting webp files at that path. Zero app changes, and
existing installs pick them up.** The whole plan is about filling that
namespace well.

## What's true today

| Set | Count | Cover situation |
|---|---|---|
| Hot set (curated 988 ∪ vibe books) | 1,401 | All have a mirrored cover on Pages (1,468 files incl. 67 legacy) |
| Long tail (R2 texts) | 55,863 | **Zero covers.** `/covers/<id>.webp` returns SPA HTML; app falls back to the typographic cover |

Three problems found with the covers we already have (all verified live):

1. **Trademark leak in production.** `/covers/3659.webp` (The Rosary) is a
   PG auto-generated cover with "Project Gutenberg" printed on it;
   `/covers/50797.webp` carries a PGDP seal. This violates LEGAL.md's own
   rule ("Never show the words 'Project Gutenberg' on books"). The strip
   pipeline is text-only — nobody ever audited the images. Unknown how many
   of the 1,468 are affected; a fingerprint exists (PG auto-covers are
   exactly 200×300 and tiny; real scans are 200×298, 195×300, etc.), but
   OCR of the bottom strip is the reliable test.
2. **The covers are low-res.** Production covers are ~200px wide (PG's
   "medium" cache size), below the ~352px the 176dp shelf card needs at 2×,
   and far below 3× phones. `mirror-covers.mjs` says width 330 but
   `withoutEnlargement` means the 200px sources pass through untouched.
   Full-resolution covers (e.g. 1824×2726 for Frankenstein) sit inside each
   PG epub — same source, same licensing, just never used.
3. **Missing covers are cache-poisoned.** `GET /covers/<missing>.webp`
   returns HTTP 200 `text/html` with `cache-control: max-age=31536000,
   immutable`. Any install that ever rendered a long-tail book has a year of
   pinned HTML at that URL — backfilling the same URL won't reach it.

## The plan

### Phase 0 — Fix the plumbing and the legal exposure (this repo, sessions OK)

1. **Audit the existing 1,468.** Pull them from our own Pages host (no PG
   throttling), classify by the 200×300+small-size fingerprint, OCR bottom
   strips for "Project Gutenberg"/"pgdp.net". Branded ones get replaced in
   Phase 1 (and until then are the first candidates for a generated cover).
   Add an image rule to LEGAL.md and put covers on the lawyer-gate list;
   decide there whether PGDP transcriber seals count as exposure.
2. **Build the covers door: `functions/covers/[id].js`**, a clone of the
   books door (static-first sniff, then `env.BOOKS.get('covers/<id>.webp')`,
   404 with proper headers otherwise). This (a) lets R2 serve long-tail
   covers past the Pages 20k static-file limit, and (b) stops the immutable
   200-HTML poisoning for future clients. Test via `deploy-pages.mjs
   --preview`. Update `freeze-data-plane.mjs`'s "covers have no R2 door"
   premise and `backup-r2.mjs`/`upload-r2.mjs` for the new primary-bucket
   `covers/` prefix.
3. **Decide the cache-convergence story.** Replacing a cover at its old URL
   won't reach clients for up to a year (server fix is instant; client
   caches aren't). Recommendation: replace in place anyway (fixes web +
   fresh installs + expired caches immediately), and bump `COVER_BASE` to a
   versioned path (`/covers/v2/…`, function-backed) in the next Android
   release so updated apps converge instantly. One-constant change in
   `config.ts`.

### Phase 1 — Real covers, done right, for the hot 1,401

1. **Re-mirror at full resolution** from the epub-internal covers instead of
   the 200px cache mediums. Target 530px-wide webp (176dp card at 3×), q78,
   2:3. `COVER_WIDTH=530` is already an env knob.
2. **Branding gate every image** (the Phase 0 classifier, run at mirror
   time — same posture as the text strip: never serve unswept).
3. **Prefer Standard Ebooks art where a title matches.** SE has ~1,400
   meticulously made covers — public-domain paintings + clean typography —
   dedicated CC0 including the cover art, no trademark license, and the
   closest existing look to "warm cozy classic". The SE→PG id join is
   mechanical: each SE GitHub repo's `content.opf` has
   `<dc:source>https://www.gutenberg.org/ebooks/<id></dc:source>`; art is
   public at 484×726 (site) / 1400×2100 (GitHub). Their catalog skews to
   exactly our curated canon, so overlap should be large. (Joining the
   Patrons Circle for the OPDS feed is cheap goodwill.)
4. Books whose only "real" cover is a PG auto-card fall through to the
   generated tier (Phase 3).

### Phase 2 — Real covers for the long tail (~54.5k, Michael's terminal)

1. **Enumerate.** Committed files cover 54,525 ids (starts-v1). The
   remaining ~1,338 R2 books and all long-tail titles/authors need
   `mirror/catalog.json` (on Michael's machine / backup bucket
   `mirror-meta/`) — a plan dependency, or a 15–25 min Gutendex re-crawl.
2. **Bulk-fetch covers via the sanctioned rsync mirror** (`rsync
   rsync.ibiblio.org::gutenberg-epub` carries the cache tree with the cover
   jpgs), never by crawling gutenberg.org (they IP-ban crawlers; LEGAL.md
   already mandates the mirror route). Long run → Michael's terminal.
3. **Classify every image** (auto-card vs real scan vs transcriber card;
   `hasCover` in the catalog is useless — it's true for essentially every
   book). Real scans → webp → R2 `covers/` prefix → served by the new door.
   Everything else → generated tier.
4. Expectation to plan around: a large share of the long tail will NOT have
   usable real art. The generated system is load-bearing, not a nice-to-have.

**Source verdicts** (researched, with the traps):

- **PG own covers — USE.** Primary source, PD, full-res in epubs. Gate for
  branding.
- **Standard Ebooks — USE.** CC0 incl. art, no logo on cover faces, ~1,400
  titles, mechanical id join.
- **Open Library — USE WITH CARE.** Never the naive work-level cover: for
  Frankenstein it's a modern Turkish paperback with a Boris Karloff film
  still (verified). Only safe via their metadata dumps → editions published
  ≤1930 → cover tar dumps on archive.org. API bulk crawling is prohibited.
- **Internet Archive / Wikimedia — USE WITH CARE.** Hand-curated passes for
  marquee titles; matching at scale is the bottleneck.
- **Google Books, HathiTrust, LibraryThing — AVOID.** TOS forbids paid apps
  / bulk prohibited / API disabled, respectively.

### Phase 3 — Generated covers that actually feel like the app

Two tiers, one shared typography engine.

**The design system to match** (from both repos' code): 2:3, warm palette —
espresso `#3A2A1E`, mocha `#6B5544`, cream `#FBF5EA`, warm-beige `#EADBC4`,
mustard `#D49A3F`, sage `#7E8F6E`, terracotta `#C2674B`, papers
`#FCFAF4`/`#FBF7EE` — Fraunces serif titles (italic authors), Inter tracked
eyebrows, the stitched-border + spine-line book furniture, pinned warm inks
(Michael's existing dark-mode call). The reader-feel playbook doctrine
applies to art too: real printed-object feel, no glossy faked gradients.

**Determinism contract:** the on-device fallback picks variant/tint by
`hash31(cleanTitle(title) + formatAuthor(author))` — cleaned title (MARC $b
stripped) and *flipped* author ("Austen, Jane" → "Jane Austen"). Server-side
generated covers must reproduce both transforms so the cover a user sees
while the image loads agrees with the image that arrives.

**Tier A — curated/hot set (~1,401, quality matters):**
AI background art + programmatic typography. Never let a model draw the
title — AI text rendering still fails on Victorian titles; the type layer is
ours (and is the copyrightable part — pure AI images aren't copyrightable,
USCO 2025). Stack: FLUX on Replicate (seeds for reproducibility, $2–5 LoRA
to lock a house style from ~30 approved covers; $0.04/image → **~$40–60 for
the whole set**) — or the zero-AI alternative: the SE formula with our
palette, PD paintings from Wikimedia/Artvee tone-mapped warm. Either way:
prompt/seed manifest committed per book, human review via contact sheets
(~1k images is an afternoon). Prompt seeds per book come from vibes
membership, scenes labels/recaps (477 books), and deep-starts meta — plus a
small Gutendex fetch for the 544 curated books with no committed theme data.

**Tier B — long tail (~54.5k, cost + safety matter):**
Pure procedural, no AI. satori (real text layout, embeds our Fraunces TTF,
no fontconfig lottery) → SVG → sharp → webp, in the exact `mirror-covers`
output conventions. This is safe to ship unreviewed at 55k scale —
deterministic, $0, re-runnable in ~1–2 hours locally — which AI is not (QC
at 2s/image is ~31 hours of eyeballing, and the API bill is the small part).
The design fuel is already committed: `scripts/deep-starts/meta.json` has
**54,994 books × {mood tags, era, voice, one-line hook}** — cozy/eerie/
pastoral/adventurous etc. map to motif + palette families; era styles the
frame; voice (verse/play/letters/diary) gets its own treatments; the 4,942
non-narrative works get a quieter reference style. Titles/authors join in
from catalog.json. Prior art proving this works at exactly this corpus and
scale: NYPL's tenprintcover (procedural PG covers for SimplyE).

If illustrated long-tail art is ever wanted later: FLUX schnell is ~$170 for
all 55k, or ~$15 self-hosted — but review cost, not generation cost, is the
real constraint. A middle path from NYPL's playbook: harvest PD
illustrations already inside the books' own PG HTML editions.

### Rollout order

1. Phase 0.1 audit + 0.2 covers door (can start now; preview-deploy to test)
2. Phase 1 hot-set re-mirror + SE overlay (short desk run)
3. Tier B generator prototype → contact sheet for Michael's taste pass →
   full long-tail run + R2 upload (Michael's terminal)
4. Tier A curated art pass (style lock first: ~30 candidates → LoRA/lock →
   batch → review → ship)
5. Android follow-ups (separate repo): bump `COVER_BASE` to the versioned
   path; stop preferring the gutenberg.org hotlink for search results once
   mirrored long-tail covers exist (`BookCover.tsx:79`, `gutenberg.ts:110`)

### Open decisions for Michael

1. Versioned cover path in next app release (recommended) vs riding out the
   year-long caches?
2. Tier A: AI art with locked style vs SE-style PD paintings vs a richer
   procedural-only look? (Cheap to prototype all three as one contact sheet.)
3. Do PGDP/transcriber-sealed covers count as exposure for the lawyer gate?
4. Standard Ebooks Patrons Circle membership (small donation, full feed +
   goodwill)?

### Standing-rule compliance notes

- All bulk fetching (rsync mirror, 55k generation upload) is Michael's
  terminal work; sessions only build the scripts.
- Deploys keep the full static cover plane or the guard blocks; when the
  hot-set covers are regenerated the `minCovers` count and the freeze
  machinery get updated deliberately.
- `src/` stays frozen — everything here lives in `scripts/`, `functions/`,
  and data.
