export const meta = {
  name: 'listed-lean',
  description: 'Hook, voice, era and mood tags for listed books from their opening pages, checked by script',
  phases: [{ title: 'Extract', detail: 'one agent per batch file, up to 40 books each' }],
}

// The opening-pages pass for the books the app lists (the home screen and the
// vibe shelves) that the deep starts pass never reached. The prompt and the
// fields are wf-chunk-lean.mjs's; what differs is where the texts are
// (public/books, fetched by scripts/fetch-data-plane.mjs), that each agent
// writes its answers to scripts/deep-starts/lean-results/ and runs
// scripts/deep-starts/check-lean.mjs on them until it passes, and that only a
// tally crosses back.
//
//   node scripts/deep-starts/lean-queue.mjs          -> BATCHES=n
//   Workflow({ scriptPath, args: { batches: [0, 1, ...], model: 'haiku' } })
//   node scripts/deep-starts/check-lean.mjs --all
//   node scripts/deep-starts/merge-lean.mjs           -> meta.json
//
// The model is the smallest that passes the anchor check (measured on two
// batches before the full run; see scripts/README.md).

const BATCHES = (args && args.batches) || []
const MODEL = (args && args.model) || 'haiku'
const ROOT = (args && args.root) || '/workspace/focus-reader'
log(`batches=${JSON.stringify(BATCHES)} model=${MODEL}`)
const pad = (n) => String(n).padStart(3, '0')

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['books', 'passed'],
  properties: {
    books: { type: 'number' },
    passed: { type: 'boolean' },
  },
}

const promptFor = (i) => `You extract the true story start and light catalog metadata for public-domain books. Work mechanically and fast — no deep analysis.

STEP 1. Read the file ${ROOT}/scripts/deep-starts/batches/batch-${pad(i)}.json (a JSON array of up to 40 book objects, each with an "id", a "title" and an "author").

STEP 2. For EACH book in that array, use the Read tool on ${ROOT}/public/books/<id>.txt with limit=170 (read ONLY the opening — never a whole file). From that opening produce one result object:
  - id: the book's id, as a string.
  - anchor: VERBATIM 8-14 consecutive words copied EXACTLY (same spelling/punctuation) from the FIRST sentence of the actual work, past ALL front matter. Skip: [Illustration] tags, title/author/publisher lines, dedication, Contents/TOC, transcriber notes, prefaces ABOUT the book, epigraphs. Where the work begins: Novels = chapter 1 body (a Prologue counts); plays = first stage direction or dialogue after the cast list; poetry = first line of the first poem; letters = first line of letter 1; reference works = first real content line. NEVER invent or paraphrase text. If the work has not begun within the 170 lines, or the file is unreadable or empty, anchor = "".
  - narrative: false ONLY for pure reference works (dictionaries, indexes, catalogs, encyclopedias). Otherwise true.
  - hook: one spoiler-free enticing sentence, max 25 words. For a book you do not already know, say only what the opening pages support: never guess at events you have not read. Never give away an ending or a twist.
  - voice: one of "first-person","third-person","letters","diary","verse","play","other".
  - era: setting time + place in 6 words or fewer, or "" if unclear.
  - tags: 2-4 from: cozy, adventurous, grim, romantic, funny, eerie, contemplative, thrilling, tragic, whimsical, philosophical, pastoral.
The word "Gutenberg" must not appear in any hook or era.

STEP 3. Write all the result objects to ${ROOT}/scripts/deep-starts/lean-results/batch-${pad(i)}.json as valid JSON of the form {"books":[ ... ]}, one entry per book of the batch.

STEP 4. Run this from ${ROOT}:  node scripts/deep-starts/check-lean.mjs ${i}
It prints each problem by book id. Fix every one (for an anchor problem, Read that book's opening again and copy the words exactly; do not retype from memory), rewrite the file, and run the check again until its last line says PASS. Give up on a book only after three tries, and then set its anchor to "".

Return the number of books you wrote and whether the check's last line said PASS.`

phase('Extract')
const results = await parallel(
  BATCHES.map((i) => () =>
    agent(promptFor(i), { label: `lean-${pad(i)}`, phase: 'Extract', schema: SCHEMA, effort: 'low', model: MODEL })
  )
)

const ok = results.filter(Boolean)
log(`${ok.reduce((n, r) => n + (r.books || 0), 0)} books written by ${ok.length}/${BATCHES.length} agents; ${ok.filter((r) => r.passed).length} batches passed their check`)
// Only the tally comes back: the answers are on disk, checked by script.
return { agentsOk: ok.length, agentsTotal: BATCHES.length, passed: ok.filter((r) => r.passed).length }
