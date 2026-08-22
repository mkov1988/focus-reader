# Legal position: selling a reader built on public domain books

The business intends to charge for the app. This page is the single legal
reference for both repos; the strip code and steering docs link here. It was
extracted from `docs/planning/book_access_strategy.md` §7 (kept there as
history) during the August 2026 structural audit. None of this is legal
advice.

## The gate before any payment goes live

Have an intellectual property lawyer review the final title list before
turning on payments, especially for sales outside the US. Two questions to
put to them at the same time:

1. Do bare `gutenberg.org` URLs and phrases like "this Gutenberg eText"
   inside about 50 served texts count as references that must also be
   removed? (The exact trademark phrase is already stripped; these leftovers
   are links and nicknames.)
2. The international exposure below.
3. Voice narration: confirm comfort with the provenance of the Kokoro voice
   packs (the open TTS model behind the narrator personas) for use in a paid
   product. The synthesized audio itself is Apache-2.0-licensed model output;
   the question is the voices' training provenance.

## The text is free to sell

Public domain works have no copyright owner. Anyone may copy, host, modify,
and sell them, with no royalty owed. Selling a reading app built on public
domain books is a long established model (Serial Reader and many classics
apps run on the same texts).

## The Gutenberg trademark is the catch; stripping it is the escape hatch

"Project Gutenberg" is a registered trademark. Their license travels with any
file carrying their name, and it is restrictive: keep the branding on a book
you charge for and you owe the foundation a 20 percent royalty plus their
full license text. Their own license states that once every reference to
Project Gutenberg is removed, what remains is a plain public domain work
their license no longer governs.

So the boilerplate strip is legally load bearing, not cosmetic. Rules:

- Always strip at mirror or build time, before serving or bundling a book.
- Never show the words "Project Gutenberg" on books or in the reading view.
  Reattaching the name can pull the license back in.
- Never treat the strip as a size optimization that can be skipped.

### Where the strip lives (keep this inventory current)

- Canonical: `scripts/lib/strip-gutenberg.mjs` (both mirror scripts import it).
- Runtime copy: `src/services/library.ts` (retired web app, still deployed).
- Runtime copy: `Focus Reader Android/src/services/gutenberg.ts` (tier 3
  strips live Gutenberg fetches on device and caches the result).
- Guard: `node scripts/check-strip-sync.mjs` verifies all copies agree. Run
  it after touching any copy.

### August 2026 resweep

The original strip filtered per line, so the phrase survived when hard line
wrapping split it ("Project" ending one line, "Gutenberg" starting the next).
A full scan found it in 6 curated texts and 89 long tail mirror files (95
total). The strip now joins wrapped occurrences before filtering, and
`scripts/resweep-trademark.mjs` cleaned the stored files. Changed mirror
files must be re-uploaded to R2 (see docs/SERVING.md).

## Voice narration is a derived work of the stripped text

AI narration (docs/narration-plan.md) inherits every rule above, the way
Modernity does: synthesis input is the STRIPPED text only, never raw
Gutenberg files, and no "Project Gutenberg" reference may ever be voiced.
Because narrated words must stay one-to-one with reader token ids, narration
text is never edited to fix a leftover — the pipeline's gate
(`scripts/narration/plan.mjs`) EXCLUDES any book whose narrated span still
carries `gutenberg`/URL/eText leftovers, and the exclusion is listed in
NARRATION-CHECKLIST.md. Excluded books stay un-narratable until a
coordinated re-strip and re-anchor of all token data.

Two narration-specific rules:

- **Narrator voices are original archetype personas** (Marlowe, Rowan,
  Hazel), never cloned from, tuned toward, or marketed by reference to a
  real person. Sound-alike imitations of identifiable people lose in court
  even unnamed (Midler v. Ford; Waits v. Frito-Lay; Tennessee's ELVIS Act
  covers any "simulation of the voice"; California AB 1836 covers deceased
  performers). Keep persona descriptions attribute-only in every doc.
- **Generated audio carries the underlying edition's risk unchanged.** A
  narration of a protected translation is as exposed as serving that
  translation's text; the lawyer review list applies to narrated titles too
  (and see gate question 3 above on voice-model provenance).

## Real risks to manage

1. **International copyright is the big one.** Public domain in the US is not
   public domain everywhere. The US line in 2026 is works published in 1930
   or earlier, advancing each January; most other countries use life of the
   author plus seventy years. A title free in the US can still be protected
   in the UK, EU, Canada, or Australia, and worldwide app store distribution
   could mean distributing something still protected somewhere. Mitigate by
   curating to authors dead more than seventy years, or restricting by
   region.
2. **Editions, translations, and introductions carry their own copyright.**
   Original words are free; a modern translation, introduction, or footnotes
   can be independently copyrighted. Old works and old translations are safe.
3. **Server access policy.** Gutenberg discourages bulk crawling and blocks
   IPs. Mirror from an official mirror site at a gentle rate. Operational,
   not copyright, but it gates the build step.

## Business reality

No exclusivity is possible on public domain text; a competitor can legally
clone the catalog. The moat is the product: the focus reader, curation and
vibes, offline, the experience. Price the paid tier as the app, never as
access to a specific book. A donation to the Gutenberg foundation is
reasonable goodwill given we build on their work; Standard Ebooks (CC0, no
trademark license at all) remains an option as a premium source.

## Provenance

Every bundled book entry carries its gutenberg.org source URL
(`Focus Reader Android/src/data/catalog.json` and `vibes.json`), so the
title list for lawyer review can be generated on demand.
