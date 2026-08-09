export const meta = {
  name: 'deep-starts-redo',
  description: 'Re-verify story-start anchors and narrative flags the Sonnet sweep got wrong',
  phases: [{ title: 'Redo', detail: 'one agent per batch file, up to 40 books each' }],
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

const promptFor = (i) => `You extract the true story start and light catalog metadata for public-domain books. These books were processed once by a weaker model that either failed to produce a resolvable anchor or wrongly flagged them non-narrative — your job is to get both right. Work mechanically and fast.

STEP 1. Read the file scripts/deep-starts/batches/batch-${pad(i)}.json (a JSON array of up to 40 book objects, each with an "id").

STEP 2. For EACH book in that array, use the Read tool on mirror/books/<id>.txt with limit=170 (read ONLY the opening — never a whole file). From that opening produce one result object:
  - id: the book's id, as a string.
  - anchor: VERBATIM 8-14 consecutive words copied EXACTLY (same spelling/punctuation, any language) from the FIRST sentence of the actual work, past ALL front matter. Skip: [Illustration] tags, title/author/publisher lines, dedication, Contents/TOC, transcriber notes, prefaces ABOUT the book, epigraphs. Where the work begins: Novels = chapter 1 body (a Prologue counts); plays = first stage direction or dialogue after the cast list; poetry = first line of the first poem; letters = first line of letter 1; essay/history/biography collections = first sentence of the first piece; reference works = first real content line. NEVER invent or paraphrase text. Foreign-language text is fine — copy it verbatim exactly as printed. Only return anchor "" if the file is truly unreadable (binary garbage, empty, no prose at all in 170 lines).
  - narrative: false ONLY for pure lookup works: dictionaries, indexes, catalogs, encyclopedias, almanacs, tables. Essays, sermons, histories, biographies, tributes, anthologies, speeches, travel writing, and every kind of fiction are narrative: true — they all have a real first content line worth seeking to. When in doubt, true.
  - hook: one spoiler-free enticing sentence, max 25 words.
  - voice: one of "first-person","third-person","letters","diary","verse","play","other".
  - era: setting time + place in 6 words or fewer, or "" if unclear.
  - tags: 2-4 from: cozy, adventurous, grim, romantic, funny, eerie, contemplative, thrilling, tragic, whimsical, philosophical, pastoral.

Return ONLY the schema object {books:[...]} with one entry per book you processed. Your final output IS the data — do not summarize.`

phase('Redo')
const results = await parallel(
  Array.from({ length: BATCH_COUNT }, (_, i) => () =>
    // model pinned to the tier that measured 99.0% anchor-verified on this
    // exact task (Sonnet measured 89.1%); effort low — verbatim copying
    // gains nothing from thinking. Remove the pin to inherit the session model.
    agent(promptFor(i), { label: `redo-${pad(i)}`, phase: 'Redo', schema: SCHEMA, effort: 'low', model: 'fable' })
  )
)

const books = results.filter(Boolean).flatMap((r) => r.books || [])
log(`re-verified ${books.length} books across ${results.filter(Boolean).length}/${BATCH_COUNT} agents`)
// Lean return — records are harvested from journal.jsonl by collect-journal.mjs.
return { count: books.length, agentsOk: results.filter(Boolean).length, agentsTotal: BATCH_COUNT }
