export const meta = {
  name: 'deep-starts-chunk-lean',
  description: 'Extract verbatim story-start anchors + details metadata for one chunk of Gutenberg books',
  phases: [{ title: 'Extract', detail: 'one agent per batch file, up to 40 books each' }],
}

const BATCH_COUNT = (args && args.batchCount) || 15
log(`args=${JSON.stringify(args)} BATCH_COUNT=${BATCH_COUNT}`)
const pad = (n) => String(n).padStart(3, '0')

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['books'],
  properties: {
    books: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'anchor', 'narrative', 'hook', 'voice', 'era', 'tags'],
        properties: {
          id: { type: 'string' },
          anchor: { type: 'string' },
          narrative: { type: 'boolean' },
          hook: { type: 'string' },
          voice: { type: 'string', enum: ['first-person', 'third-person', 'letters', 'diary', 'verse', 'play', 'other'] },
          era: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

const promptFor = (i) => `You extract the true story start and light catalog metadata for public-domain books. Work mechanically and fast — no deep analysis.

STEP 1. Read the file scripts/deep-starts/batches/batch-${pad(i)}.json (a JSON array of up to 40 book objects, each with an "id").

STEP 2. For EACH book in that array, use the Read tool on mirror/books/<id>.txt with limit=170 (read ONLY the opening — never a whole file). From that opening produce one result object:
  - id: the book's id, as a string.
  - anchor: VERBATIM 8-14 consecutive words copied EXACTLY (same spelling/punctuation) from the FIRST sentence of the actual work, past ALL front matter. Skip: [Illustration] tags, title/author/publisher lines, dedication, Contents/TOC, transcriber notes, prefaces ABOUT the book, epigraphs. Where the work begins: Novels = chapter 1 body (a Prologue counts); plays = first stage direction or dialogue after the cast list; poetry = first line of the first poem; letters = first line of letter 1; reference works = first real content line. NEVER invent or paraphrase text. If the file is unreadable or empty, anchor = "".
  - narrative: false ONLY for pure reference works (dictionaries, indexes, catalogs, encyclopedias). Otherwise true.
  - hook: one spoiler-free enticing sentence, max 25 words.
  - voice: one of "first-person","third-person","letters","diary","verse","play","other".
  - era: setting time + place in 6 words or fewer, or "" if unclear.
  - tags: 2-4 from: cozy, adventurous, grim, romantic, funny, eerie, contemplative, thrilling, tragic, whimsical, philosophical, pastoral.

Return ONLY the schema object {books:[...]} with one entry per book you processed. Your final output IS the data — do not summarize.`

phase('Extract')
const results = await parallel(
  Array.from({ length: BATCH_COUNT }, (_, i) => () =>
    agent(promptFor(i), { label: `batch-${pad(i)}`, phase: 'Extract', schema: SCHEMA, effort: 'low' })
  )
)

const books = results.filter(Boolean).flatMap((r) => r.books || [])
log(`extracted ${books.length} books across ${results.filter(Boolean).length}/${BATCH_COUNT} agents`)
// Lean return: the records are harvested from journal.jsonl by
// scripts/deep-starts/collect-journal.mjs so 600 records never cross the
// orchestrator context. Only the tally comes back.
return { count: books.length, agentsOk: results.filter(Boolean).length, agentsTotal: BATCH_COUNT }
