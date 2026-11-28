export const meta = {
  name: 'listed-deep',
  description: 'Whole-book read of listed books: parts, pacing, pace and cast, every anchor checked by script',
  phases: [
    { title: 'Read', detail: 'one reader per segment of each book' },
    { title: 'Compose', detail: 'one editor per book, from the readers notes' },
  ],
}

// The deep pass for the books the app lists that have no authored parts: one
// full read per book, producing its parts (a title, where each starts, a one
// line recap), a pacing sentence, a pace from 1 to 5 and up to six cast lines,
// in the shape scripts/merge-deep-pass.mjs takes.
//
// A whole book does not fit in one reader's head, so scripts/deep-starts/
// deep-queue.mjs cuts each into segments. A reader takes one segment and
// leaves notes (every anchor checked by scripts/deep-starts/check-deep.mjs
// against the served text); an editor composes the book from the notes and
// runs the same check on the result. Nothing of the texts crosses back: the
// results are files under scripts/deep-starts/deep-work/<id>/.
//
//   node scripts/deep-starts/deep-queue.mjs --count 50      -> [{id, segments}, ...]
//   Workflow({ scriptPath, args: { books: [...], reader: 'haiku', composer: 'sonnet' } })
//   node scripts/deep-starts/build-listed-chunk.mjs <n>     -> deep-pass-results/listed-<n>.json
//   node scripts/merge-deep-pass.mjs scripts/deep-starts/deep-pass-results/listed-<n>.json
//   npm run build:scenes && npm run export:native
//
// Books that are not stories keep their own chapters as parts (the editor
// adds a plain line to each where it helps), have no cast, and get a pacing
// sentence and a pace only where those mean something. A pure reference work
// (deep-queue.mjs marks it) is not read through: one agent looks at its
// opening and the head of each chapter.

const BOOKS = (args && args.books) || []
const READER = (args && args.reader) || 'haiku'
const COMPOSER = (args && args.composer) || 'sonnet'
const ROOT = (args && args.root) || '/workspace/focus-reader'
const WORK = `${ROOT}/scripts/deep-starts/deep-work`
const pad = (n) => String(n).padStart(2, '0')
log(`books=${BOOKS.length} segments=${BOOKS.reduce((n, b) => n + b.segments, 0)} reader=${READER} composer=${COMPOSER}`)

const OK = {
  type: 'object',
  additionalProperties: false,
  required: ['passed'],
  properties: { passed: { type: 'boolean' } },
}

const readerPrompt = (id, n) => `You are one of several readers of a public-domain book. You read ONE segment of it, every line, and leave notes for an editor who will not read the book. Be exact and plain. No commentary.

STEP 1. Read ${WORK}/${id}/seg-${pad(n)}.json. It names the book, your segment's text file ("file", relative to ${ROOT}), the Read calls that cover it ("reads"), and the chapters that start in it ("chapters", possibly empty).

STEP 2. Read the whole segment, in order: make every Read call listed in "reads" on the segment's file, with exactly that offset and limit. Do not skip any and do not stop early.

STEP 3. Write your notes to ${WORK}/${id}/notes-${pad(n)}.json as valid JSON with these fields:
  "kind": "story" if this text tells a story (a novel, a tale, a play, a narrative poem, a memoir told as a story). "not-story" for anything else (a reference work, essays, sermons, a collection of poems, a history, a report, a treatise, a collection of letters).
  "summary": 3 to 6 plain sentences on what happens in this segment (or what it covers), in order. The editor needs the facts, so this may give things away.
  "beats": 3 to 6 places in this segment (6 to 8 if "of" is 1: your segment is the whole book) where a new stretch begins (a new scene, a turn in the story, a new piece or chapter worth marking), in the order they occur and spread over the whole segment, the first near its start. For each:
      "anchor": the first 8 to 14 words of the sentence where the stretch begins, copied EXACTLY from the text: the same words in the same order, nothing left out, nothing added. Take it from a sentence of the text itself, never from a heading, a contents list or a page header. Prefer a sentence with unusual words in it, so the same run of words does not occur earlier in the book.
      "label": a title for the stretch, 2 to 5 words. It is shown to a reader BEFORE they read the stretch, so it must not give away what happens. For a not-story text use the piece's own title where it has one.
      "recap": one plain sentence, at most 25 words, on what happens in the stretch. Say the situation and what is at stake, not how it comes out.
  "cast": up to 8 people (or creatures) who matter in this segment, each as "Name, who they are in a few words": who they are when first met, never what becomes of them. [] for a not-story text.
  "pacing": one sentence on how this stretch reads (fast or slow, eventful or talky, plain or ornate).
  "pace": a whole number: 1 slow burn, 2 unhurried, 3 steady, 4 quick, 5 gripping.
  "chapterNotes": if kind is "not-story" and "chapters" is not empty: for each listed chapter, {"n": its number, "note": one plain line of at most 20 words on what that chapter covers}. Otherwise [].
The word "Gutenberg" must not appear in any label, recap, cast line, pacing or chapter note.

STEP 4. From ${ROOT} run:  node scripts/deep-starts/check-deep.mjs notes ${id} ${n}
It prints each problem. Fix every one. For an anchor problem, Read that part of the segment file again and copy the words exactly (never retype from memory); if the check says the words occur earlier in the book, take the next 8 to 14 words of the same sentence or the following sentence instead. Rewrite the file and run the check again until its last line is PASS.

Return whether the last line of the check was PASS.`

const composerPrompt = (id, segs) => `You are the editor of a reading app's page about one book. Readers have read the whole book in ${segs} segment${segs === 1 ? '' : 's'} and left notes. You have not read it: work only from their notes. Be exact and plain.

STEP 1. Read ${WORK}/${id}/plan.json (the book's title and author; "meta", what the app already says about it, or null; "chapters", the book's own chapters as the app can show them, or null). Then read every notes file, in order: ${WORK}/${id}/notes-01.json to notes-${pad(segs)}.json.

STEP 2. Decide whether the book is a story. Go by what the readers found ("kind") and by what the book is: a novel, tale, play, narrative poem or memoir told as a story is a story. A reference work, a collection of essays, sermons or poems, a history, a treatise, a report or a collection of letters is not.

STEP 3. Write ${WORK}/${id}/result.json as valid JSON:
{
  "id": "${id}",
  "nonNarrative": false for a story, true otherwise,
  "scenes": [ { "anchor": "...", "label": "...", "recap": "..." }, ... ],
  "chapterNotes": [ { "n": 3, "note": "..." }, ... ],
  "details": { "cast": [ "...", ... ], "pacing": "...", "contentNotes": [ "...", ... ], "themes": [ "...", ... ] },
  "pace": 3
}
(If "meta" in plan.json is null, also add "hook": one spoiler-free sentence of at most 25 words; "voice": one of first-person, third-person, letters, diary, verse, play, other; "era": time and place in 6 words or fewer; "tags": 2 to 4 of cozy, adventurous, grim, romantic, funny, eerie, contemplative, thrilling, tragic, whimsical, philosophical, pastoral.)

FOR A STORY:
  "scenes": the book's parts, 6 to 12 of them (3 to 8 for a short book of one segment), in order, covering the whole book from its opening to its last stretch, spaced fairly evenly. Build each from one of the readers' beats:
      "anchor": copied EXACTLY from that beat, character for character. Never write or edit an anchor yourself.
      "label": the part's title, 2 to 5 words. A reader sees the title of the part they are about to read, so it must give nothing away.
      "recap": one plain sentence, at most 25 words, on what happens in that part: the situation and what is at stake, not how it comes out, and nothing from later in the book. Someone who has not read that far must learn nothing from it that the part itself would not tell them early on.
  The first part must be the readers' first beat of segment 1 that belongs to the story itself (not a preface or contents).
  "chapterNotes": [].
  "details.cast": up to six lines, the leads first, each "Name, who they are" in one short clause. Who they are when first met. Never what becomes of them.
  "details.pacing": one sentence, at most 30 words, on how the whole book reads.
  "pace": one whole number for the whole book: 1 slow burn, 2 unhurried, 3 steady, 4 quick, 5 gripping.

FOR A BOOK THAT IS NOT A STORY:
  "details.cast": [].
  "details.pacing" and "pace": only where they mean something. A history, a memoir of ideas or a book of essays reads at a pace: give the sentence and the number. A dictionary, an almanac or a table does not: give "" and null.
  If "chapters" in plan.json is NOT null, the book keeps its own chapters as its parts: "scenes" is [], and "chapterNotes" gives one plain line (at most 20 words) for each chapter where a line helps a reader know what it covers, taken from the readers' chapter notes (tidy the wording; leave out a chapter whose heading already says it all, or that no reader described).
  If "chapters" is null, give "scenes" as for a story (3 to 12 parts): each label the piece's own title where it has one, each recap a plain description of what that part covers. "chapterNotes" is [].

"details.themes": 3 to 5 single words. "details.contentNotes": up to 6 short notes on content some readers would want warned about ([] if none).
The word "Gutenberg" must not appear anywhere.

STEP 4. From ${ROOT} run:  node scripts/deep-starts/check-deep.mjs book ${id}
Fix every problem it prints and run it again until its last line is PASS. If an anchor fails, pick another of the readers' beats near the same place: never repair an anchor by hand.

Return whether the last line of the check was PASS.`

const referencePrompt = (id) => `You are the editor of a reading app's page about one book. This book is a reference work (a dictionary, an almanac, an encyclopaedia, a catalogue, a roll): nobody reads it through, and neither will you. Be exact and plain.

STEP 1. Read ${WORK}/${id}/plan.json: the book's title and author, its text file ("file", relative to ${ROOT}), and "chapters", the book's own chapters as the app can show them (each with its number "n", its heading and the line of the text file it starts on), or null.

STEP 2. Read the opening of the book: ${WORK}/${id}/seg-01.txt, the first 400 lines only.

STEP 3. If "chapters" is not null: for each chapter (if there are more than 30, take every chapter whose heading alone does not say what it holds, up to 30), Read 40 lines of the text file starting at that chapter's line, to see what the chapter holds.

STEP 4. Write ${WORK}/${id}/result.json as valid JSON:
{
  "id": "${id}",
  "nonNarrative": true,
  "scenes": [],
  "chapterNotes": [ { "n": 3, "note": "..." }, ... ],
  "details": { "cast": [], "pacing": "", "contentNotes": [], "themes": [ "...", ... ] },
  "pace": null
}
"chapterNotes": one plain line (at most 20 words) for each chapter you looked at where a line helps a reader know what it holds. Leave out a chapter whose heading already says it all. [] if "chapters" is null.
"details.themes": 3 to 5 single words on what the book is about.
The word "Gutenberg" must not appear anywhere.

STEP 5. From ${ROOT} run:  node scripts/deep-starts/check-deep.mjs book ${id}
Fix every problem it prints and run it again until its last line is PASS.

Return whether the last line of the check was PASS.`

const results = await pipeline(
  BOOKS,
  async (book) => {
    if (book.reference) return { id: book.id, read: 0 }
    const read = await parallel(
      Array.from({ length: book.segments }, (_, i) => () =>
        agent(readerPrompt(book.id, i + 1), { label: `read ${book.id} ${i + 1}/${book.segments}`, phase: 'Read', schema: OK, effort: 'low', model: READER })
      )
    )
    return { id: book.id, read: read.filter((r) => r && r.passed).length }
  },
  async (prev, book) => {
    if (book.reference) {
      const done = await agent(referencePrompt(book.id), { label: `reference ${book.id}`, phase: 'Compose', schema: OK, effort: 'low', model: READER })
      return { id: book.id, composed: Boolean(done && done.passed) }
    }
    if (prev.read < book.segments) {
      log(`#${book.id}: only ${prev.read}/${book.segments} segments have notes that pass; not composed`)
      return { id: book.id, composed: false }
    }
    const done = await agent(composerPrompt(book.id, book.segments), { label: `compose ${book.id}`, phase: 'Compose', schema: OK, effort: 'medium', model: COMPOSER })
    return { id: book.id, composed: Boolean(done && done.passed) }
  }
)

const ok = results.filter((r) => r && r.composed).map((r) => r.id)
const failed = BOOKS.map((b) => b.id).filter((id) => !ok.includes(id))
log(`${ok.length}/${BOOKS.length} books composed and passing; not done: ${failed.join(', ') || 'none'}`)
return { composed: ok.length, of: BOOKS.length, failed }
