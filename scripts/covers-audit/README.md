# Cover audit — 2026-08-24

Every cover the production site serves was downloaded and checked for
Project Gutenberg branding (their name printed on the image), because the
standing rule in LEGAL.md forbids showing those words on a book in a paid
app.

**Result: 785 of 1,468 production covers are Project Gutenberg's
auto-generated cards with "Project Gutenberg" printed on them** (728 belong
to books in the current curated + vibes set). The remaining 683 are genuine
covers — scans of real bindings, title pages, and illustrations — and are
keepers.

`branded.json` is the list of affected book ids. It is an input to
`scripts/mirror-covers-hires.mjs` (those ids are skipped when re-mirroring
— their "cover" upstream is the same branded card) and marks which books
need a cover from Standard Ebooks or the generated-cover pipeline instead.

How the check was done: all 1,468 files fetched from the production host;
text read off every cover's bottom strip (where the branding sits) by
machine, plus a color-pattern detector for the cards' flat neon style, plus
a human eye pass over everything both methods were unsure about. Machine
flags were verified by eye; borderline calls default to "branded" since a
wrongly-branded verdict just means a book gets a nicer replacement cover.

Replacement plan and order of work: docs/planning/covers-plan.md.
