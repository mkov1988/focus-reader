export const meta = {
  name: 'verify-story-starts-meta',
  description: 'Verify story starts + collect details-page metadata for a batch set',
  phases: [
    { title: 'Verify', detail: 'one agent per 12-book batch' },
    { title: 'Retry', detail: 're-run batches that returned nothing' },
  ],
}

const parsedArgs = typeof args === 'string' ? JSON.parse(args) : (args || {})
// Batch indices to process. Defaults to all 0..(count-1) if `missing` not given.
const INDICES = Array.isArray(parsedArgs.missing) && parsedArgs.missing.length
  ? parsedArgs.missing
  : Array.from({ length: Number(parsedArgs.count) || 417 }, (_, i) => i)
const pad = (i) => String(i).padStart(3, '0')

const SCHEMA = {
  type: 'object',
  required: ['books'],
  additionalProperties: false,
  properties: {
    books: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'anchor', 'narrative', 'hook', 'voice', 'era', 'tags'],
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          anchor: { type: 'string' },
          narrative: { type: 'boolean' },
          hook: { type: 'string' },
          voice: {
            type: 'string',
            enum: ['first-person', 'third-person', 'letters', 'diary', 'verse', 'play', 'other'],
          },
          era: { type: 'string' },
          tags: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['cozy', 'adventurous', 'grim', 'romantic', 'funny', 'eerie', 'contemplative', 'thrilling', 'tragic', 'whimsical', 'philosophical', 'pastoral'],
            },
          },
        },
      },
    },
  },
}

const promptFor = (i) => `Verify where the actual work begins for each book in one batch of Project Gutenberg plain-text files, and collect short details-page metadata for each.

Step 1 - Read the batch file "C:/Users/Michael/Desktop/Focus Reader/scripts/deep-starts/batches/batch-${pad(i)}.json". It is a JSON array of up to 12 books: {id, dl, conf, detStart, preview}. "preview" is an automatic detector's guess at the first words of the work. Treat it as a hint only; it is often wrong (it may sit on the table of contents, a preface, or an illustration caption).

Step 2 - For EACH book in the batch, Read the opening of "C:/Users/Michael/Desktop/Focus Reader/mirror/books/<id>.txt" using the Read tool with limit=170. These files can be huge: NEVER read a whole file. If after those 170 lines you are clearly still inside front matter (for example a long Contents list), you may read at most two further chunks (offset=170 limit=170, then offset=340 limit=170). If the true start is still not visible after that, give that book anchor "".

Step 3 - Identify the FIRST word of the actual work, skipping ALL front matter: [Illustration] tags, the title, the author, the publisher, the dedication, the Contents list, transcriber's notes, prefaces or introductions ABOUT the book, and standalone epigraphs.
- Novels: the first sentence of the chapter 1 body. A Prologue counts as the work; an author's preface or an editor's introduction does not.
- Plays: the first stage direction or line of dialogue after the cast list.
- Poetry: the first line of the first poem.
- Letters: the first line of the first letter.
- Reference works: the first line of real content.

Step 4 - For each book produce ALL of these fields:
- id: the book's id exactly as in the batch file (keep it a string).
- anchor: a VERBATIM phrase of 8 to 14 consecutive words copied character-for-character from the true first sentence (or first line, for poetry/plays). Copy exactly what is printed. Never invent, paraphrase, reorder, or fix spelling or punctuation. Do not include the chapter heading; start with the sentence text itself. If the file could not be read, or the start was not findable within the allowed reads, use anchor "".
- narrative: false ONLY for pure reference works (a dictionary, factbook, catalog, or book of tables); true for everything else.
- hook: ONE enticing, spoiler-free sentence (max 25 words) telling a browsing reader what this book is. Ground it in what you actually read plus the title and author. No spoilers, no "this book"; just make it inviting.
- voice: exactly one of "first-person", "third-person", "letters", "diary", "verse", "play", "other" - based on the opening you read.
- era: the setting's time and place in 6 words or fewer (e.g. "Regency England", "Mars, far future", "1860s London"). Use "" if the opening gives no clear signal.
- tags: 2 to 4 mood words chosen ONLY from this list: cozy, adventurous, grim, romantic, funny, eerie, contemplative, thrilling, tragic, whimsical, philosophical, pastoral.

Step 5 - Using the Write tool, save the full result as JSON in the shape {"books":[{"id":"...","anchor":"...","narrative":true,"hook":"...","voice":"...","era":"...","tags":["...","..."]}, ...]} to "C:/Users/Michael/Desktop/Focus Reader/scripts/deep-starts/results/parts/batch-${pad(i)}.json".

Step 6 - Return the same {books: [...]} object as your structured output. Include EVERY book from the batch exactly once, even ones with anchor "".`

phase('Verify')
log(`Fanning out ${INDICES.length} batch agents`)
const results = await parallel(
  INDICES.map((i) => () =>
    agent(promptFor(i), { label: `batch-${pad(i)}`, phase: 'Verify', schema: SCHEMA })
  )
)

const failedIdx = []
results.forEach((r, k) => {
  if (!r || !Array.isArray(r.books) || r.books.length === 0) failedIdx.push(INDICES[k])
})

if (failedIdx.length) {
  phase('Retry')
  log(`Retrying ${failedIdx.length} failed batches`)
  const retried = await parallel(
    failedIdx.map((i) => () =>
      agent(promptFor(i), { label: `retry-${pad(i)}`, phase: 'Retry', schema: SCHEMA })
    )
  )
  const idxPos = Object.fromEntries(INDICES.map((v, k) => [v, k]))
  retried.forEach((r, k) => {
    if (r && Array.isArray(r.books) && r.books.length > 0) results[idxPos[failedIdx[k]]] = r
  })
}

let ok = 0
const stillMissing = []
results.forEach((r, k) => {
  if (r && Array.isArray(r.books) && r.books.length > 0) ok++
  else stillMissing.push(pad(INDICES[k]))
})

return { requested: INDICES.length, succeeded: ok, stillMissing }
