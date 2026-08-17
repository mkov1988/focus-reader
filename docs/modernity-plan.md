# Modernity: classics retold in modern voice

The plan for a new "Modernity" section: about 110 classics retold beat by beat
in the streamer voice of the Hamlet examples (the golden standard for this
feature). This doc is the working plan; nothing here is built yet.

## What a modernization is

Not a line by line translation. Each book becomes a **stream**: an ordered feed
of short clips, each one a scene retold as if the protagonist is live on camera
talking to chat. The Hamlet set ("The Curtain Incident", "Yorick", "The Cup",
"The Rest Is Silence") is the exact target voice and format.

Two templates, because the queue has two kinds of book:

1. **Story books** (plays, novels): 20 to 50 beats following the plot in
   order. Spoilers are the point; this is the whole book as a highlight reel.
2. **Level heads** (the stoics, plus other idea books like The Prince or
   A Modest Proposal): no plot, so the book's ideas become a stack of modern
   one liners and posts, 30 to 60 per work, grouped by theme. Marcus Aurelius
   reads like a man posting through it with total composure.

Every beat carries:

| field | what it is |
|---|---|
| `title` | clip name ("The Curtain Incident") |
| `modern` | the retelling, roughly 30 to 90 words |
| `quote` | optional: the exact original line it translates, verbatim from our stripped text |
| `anchor` | verbatim 8 to 14 word phrase from the mirrored text where the beat's scene begins |
| `endAnchor` | verbatim phrase where the retold passage ends (sentence boundary) |
| `spice` | 0 clean, 1 mild, 2 full send |
| `warnings` | tags like `self-harm-joke`, `violence` for beats that need them |

The anchors are the delight feature. The build resolves them to token indexes
(same technique as `build-scenes.mjs`), and each output beat gets `startIndex`
plus `words` (span length). That powers two things:

1. **The modern/original toggle.** Every beat card can flip between the
   modern retelling and the exact original passage it retells: the app
   slices tokens `[startIndex, startIndex + words)` from the book text it
   already fetches through the existing ladder. No original text is
   duplicated into the data file. The same span works in reverse later: a
   reader position inside a span identifies the active beat, so the reader
   could surface "see this scene in Modernity."
2. **The reader deep link.** Tapping through opens the Reader at
   `startIndex`, the real scene. Modernity stands alone first, and the
   original book is the gentle afterward. Same principle as short reads,
   never a funnel.

## Which books

**Top 100.** Raw `downloadCount` in `curated.json` is not "famous classics":
the raw top 100 includes the CIA World Factbook, a dictionary volume, a
concrete construction manual, duplicate editions (two Draculas, two Pride and
Prejudices), and a shelf of obscure pulp romances. So selection is a scripted
pass with three rules:

1. Sort curated by `downloadCount`, walk down the list.
2. Drop reference works, indexes, anthologies (the Complete Works of
   Shakespeare volume is skipped in favor of individual plays), and duplicate
   editions (keep the most downloaded edition of each work).
3. Hand promote canon that raw downloads miss: Hamlet (#27761), Macbeth
   (#1533), A Midsummer Night's Dream (#1514) are all in curated below the
   raw cutoff. Backfill to 100 from ranks 101 and up; 392 curated books sit
   above 15k downloads, so there is depth.

**Level Heads: all 16 books, as 8 works.** The vibe carries multiple editions
and overlapping compilations per author (four Meditations, four Epictetus,
four Seneca, four scholarly context books). We generate one modernization per
work and map it to every edition id, so each entry on the Level Heads page
lights up: Meditations (4 ids), Epictetus (4 ids), Seneca's essentials
(3 ids), Seneca on nature (its own thing), plus the four scholarly books
(A Guide to Stoicism, Roman Society, Roman Stoicism, the Marcus Aurelius
study) each as an idea stack of what the book teaches. Anchors resolve
against the primary edition's text; the reader deep link opens that edition.

Union: 108 works (94 streams, 14 stacks) covering 116 book ids. All ids are
inside the 1,401 mirrored set, so every anchor can be verified against
`public/books/<id>.txt`.

Status: **built.** `scripts/build-modernity-queue.mjs` holds the curated
ledger and writes `data-src/modernity-queue.json` plus `MODERNITY-CHECKLIST.md`
at repo root (progress bar, one checkbox per work, bench of ~20 swap
candidates at the bottom). Michael eyeballs the checklist and swaps anything
by moving an id in the script.

## The voice, locked before scale

`docs/modernity-voice.md` (to be written) holds the Hamlet examples verbatim
as the golden standard, plus the extracted rules:

- Streamer and chat idiom: address "chat", clip titles, F in chat, VOD
  receipts, kayfabe, NPC, griefing, third partying.
- Present tense. First person when the book has a protagonist.
- Every beat lands a punchline or a real emotional beat. Summary is failure.
- Full send profanity is allowed and tagged `spice: 2`. One text per beat;
  a clean mode later is a filter or a targeted regeneration, not a second
  corpus.
- Serious content rule: the voice can joke from inside the character's head
  (the To Be or Not To Be example does), but any beat touching suicide,
  assault, or era racism gets a `warnings` tag so the app can gate or preface
  it later. Note for later: full send profanity likely means a Mature rating
  on the Play Store; the spice tags keep a Teen build possible without
  regenerating everything.

**Pilot before scale: 3 works.** Hamlet (the examples become seed beats),
Pride and Prejudice (novel template), Meditations (idea stack template).
Michael reads all three, the voice doc gets adjusted, then we scale. This is
the reader feel playbook applied to prose: golden standard first, then volume.

## Pipeline (same shape as the deep pass)

The deep pass playbook is proven at 800 books; Modernity reuses its skeleton.

1. **Queue**: `scripts/build-modernity-queue.mjs` builds
   `data-src/modernity-queue.json` and regenerates `MODERNITY-CHECKLIST.md`
   at repo root (progress bar plus checkboxes, one line per work, rebuilt on
   every merge). Paste and glance, nothing to track by hand.
2. **Generate**: workflow fan out, one agent per work. Each agent gets the
   voice doc, bounded reads of the book's stripped mirror text (for verbatim
   anchors and quotes; the plot knowledge is the model's own for famous
   books), and a schema forced JSON output. Runs happen in chunks across
   sessions, like the deep pass did.
3. **Verify**: cold reader agents judge each work's beat set: plot accuracy
   per beat, voice consistency, whether the joke lands, anchor plausibility.
   Flat or wrong beats get flagged for regeneration. Unverified is not kept.
4. **Merge**: `scripts/merge-modernity.mjs` folds survivors into
   `data-src/modernity-src.json` with hard rails: every anchor must resolve
   against the mirrored text, story beats must be in ascending text order,
   every quote must be a verbatim substring of the stripped text, enums
   enforced on spice and warnings. Never overwrites hand fixed entries.
5. **Build**: `scripts/build-modernity.mjs` (`npm run build:modernity`)
   resolves anchors to token indexes and writes `src/data/modernity.json`,
   with the same validation and exit code discipline as `build-scenes.mjs`.
6. **Export**: **measured, decided.** At 27 works the built file is 567 KB,
   so all 108 project to roughly 2.3 MB, past the 2 MB eager-parse threshold
   `export-native.mjs` warns at. So Modernity ships as a fetched
   `modernity-v1.json` on Pages using the deepStarts pattern (background
   fetch after boot, disk cache, silent failure, filename IS the version),
   not as a bundled import. `scripts/build-starts-bundle.mjs` is the model
   for emitting it into `public/`. Bundling stays possible later if the app
   only needs a slice (say, beat counts and titles for the section index)
   with full beats fetched on demand.

### Small gotchas for whoever builds this

- `curated.json` ids are **strings**; a queue script comparing against number
  literals will silently match nothing.
- Two Level Heads titles carry a stray MARC `: $b` artifact (76392, 78320);
  clean the title before feeding it to a generation prompt.
- The 2 MB warning in `export-native.mjs` only fires on a run that actually
  wrote changes, and its header comment says "four data files"; both need a
  touch when the fifth emit is added.

## The app surface

Michael sketches the designs; no UI code until then (same rule as short
reads). What the data contract supports when he is ready:

- A Modernity section entry (Today block or menu), listing the works.
- A work page as a scrollable feed of beats, each a card with the clip title
  and modern text; a toggle flips the card (or the whole page) to the exact
  original passage (`startIndex` + `words` sliced from the fetched book
  text); a "read this scene for real" action opens the Reader at the beat's
  `startIndex`.
- Level heads works render as swipeable stacks of one liners.
- Wiring points when the time comes: route in `nav.ts`, screen in `App.tsx`,
  entry on `TodayScreen`, service over the bundled JSON, exactly like Vibe
  pages.

## Short reads synergy

The snippets effort (story-tags.json, 616 tagged real text spans, unshipped)
and Modernity feed the same future surface. Three deliberate joints:

1. **Shared vocabulary.** Works carry `feelings` and `intensity` using the
   same words as the story tags, and beats carry `warnings` from the same
   list, so one Short Reads shelf can mix real text snippets and modernity
   clips without a translation layer.
2. **Standalone singles.** Beats flagged `standalone: true` (3 to 8 per
   work) need zero book context ("Yorick" works cold; "The Cup" does not).
   These are ready made short reads: a 30 second laugh that gently points at
   a classic, exactly the snippets framing (stands alone first, parent book
   as a soft afterward).
3. **Build time join.** `build-modernity.mjs` checks each beat's resolved
   token index against the snippet spans in `scripts/deep-starts/snippets.json`;
   a beat landing inside a span gets a `snippetTier` field, so the app can
   pair "the clip" with "the real scene, bounded" instead of dropping the
   reader into the middle of a full book.

## Legal and content notes

- All anchors and quotes come from the **stripped** mirrored texts, never raw
  Gutenberg files. The modern text is original writing: ours, sellable.
- Quotes from translated works (Odyssey, War and Peace, Nietzsche) share the
  risk profile of serving those editions at all, which LEGAL.md already
  covers. Nothing new is introduced, but the lawyer review list applies to
  Modernity too.
- The section name "Modernity" is clean; no Gutenberg branding anywhere in
  the generated content, and the verify pass should assert that.

## Cost and effort

Roughly 110 works times two agent passes plus retries: around 250 to 300
agent runs, smaller than the deep pass (800 books). Runs in chunks with the
checklist showing progress.

## Order of work

1. ~~Queue script plus candidate list, and the voice doc.~~ DONE 2026-08-12.
2. ~~Pilot: Hamlet, Pride and Prejudice, Meditations.~~ GENERATED, VERIFIED,
   BUILT 2026-08-12 (103 beats, all anchors resolved; preview in
   docs/modernity-pilot-preview.md). Awaiting Michael's taste pass.
3. Voice locked, then scaled generation in chunks, verify gating merge.
4. Build, export, version bump, ship data. UI whenever his sketches are ready.

Lesson from the pilot, now a standing rule for the scale run: **check the
edition before generating.** The catalog's most downloaded Hamlet (#27761)
turned out to be a cut 1859 stage edition missing four famous scenes; the
cold reader caught beats retelling scenes the text never shows. The full play
(#1524) is now primary. Every scale-run verifier must ask "does this edition
actually contain the scenes these beats retell", and abridged or partial
editions get swapped or demoted to `also` ids in the queue ledger.

## Michael's decisions

1. Taste the pilot: voice, spice default, beat length.
2. Eyeball the final 100 candidate list, swap anything.
3. Play Store rating stance (full send vs a Teen filter) can wait until the
   UI ships.
