// wf-chunk.js — Modernity chunk workflow: generate + verify a batch of works.
//
// Pass the works via args: an array of queue entries
//   [{ slug, primaryId, title, author, format, register }, ...]
// (produced from data-src/modernity-queue.json; see docs/modernity-plan.md).
// One generation agent per work writes the beats against the voice bible;
// each result pipelines straight into a cold-reader verifier. Merge the task
// output with scripts/modernity/merge-modernity-run.mjs.
export const meta = {
  name: 'modernity-chunk',
  description: 'Generate + verify a chunk of Modernity works (classics retold in modern voice)',
  phases: [
    { title: 'Generate', detail: 'one agent per work, voice bible as spec, anchors greped from mirror text' },
    { title: 'Verify', detail: 'cold reader checks plot accuracy, verbatim quotes, edition completeness, voice' },
  ],
}

const ROOT = 'C:\\Users\\Michael\\Desktop\\Focus Reader'
const VOICE = ROOT + '\\docs\\modernity-voice.md'

const WORK_SCHEMA = {
  type: 'object',
  properties: {
    slug: { type: 'string' },
    feelings: { type: 'array', items: { type: 'string' } },
    intensity: { enum: ['gentle', 'steady', 'gripping'] },
    beats: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          modern: { type: 'string' },
          quote: { type: 'string' },
          anchor: { type: 'string' },
          endAnchor: { type: 'string' },
          spice: { type: 'integer', minimum: 0, maximum: 2 },
          warnings: { type: 'array', items: { enum: ['self-harm-joke', 'violence', 'death', 'sexual-content', 'era-racism'] } },
          standalone: { type: 'boolean' },
          group: { type: 'string' },
        },
        required: ['title', 'modern', 'anchor', 'endAnchor', 'spice', 'warnings', 'standalone'],
      },
    },
  },
  required: ['slug', 'feelings', 'intensity', 'beats'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          keep: { type: 'boolean' },
          issue: { type: 'string' },
        },
        required: ['title', 'keep'],
      },
    },
    overall: {
      type: 'object',
      properties: {
        voiceOk: { type: 'boolean' },
        accuracyOk: { type: 'boolean' },
        notes: { type: 'string' },
      },
      required: ['voiceOk', 'accuracyOk', 'notes'],
    },
  },
  required: ['verdicts', 'overall'],
}

function genPrompt(w) {
  const file = `${ROOT}\\public\\books\\${w.primaryId}.txt`
  const streamGuide = `Format STREAM: the book's events retold in plot order as clips from the protagonist's live stream. Pick the book's protagonist as the streamer (first person, present tense); if the book has no usable single protagonist (tale collections, episodic histories), use a narrator streamer covering the material. Scale beat count to the book: play or novella 18 to 26 beats, standard novel 26 to 36, long epic 36 to 50. Cover the WHOLE arc start to finish; spoilers are the point. Famous lines get verbatim "quote" fields.`
  const stackGuide = `Format STACK: no plot. 30 to 45 items, each one a REAL idea from the book rewritten as a modern post by the author (first person). Group items with the "group" field into 5 to 7 themes. Every item must trace to an actual passage; anchor each at its passage. Famous passages get verbatim "quote" fields.`
  const testimonyGuide = w.register === 'testimony'
    ? `\n\nREGISTER TESTIMONY (critical): jokes OFF. No gamer idiom, no bits, no chat address. The modern voice stays (direct, present tense, first person, short beats), but this is a person telling you what happened with total clarity. The power is the directness. See the voice bible's register section.`
    : ''
  return `You are writing the Modernity retelling of "${w.title}" by ${w.author}.
Text file: ${file}

FIRST read the voice bible: ${VOICE} — it is the spec: golden standard, core rules, templates, registers, beat fields, anchor/endAnchor/span discipline.

${w.format === 'stack' ? stackGuide : streamGuide}${testimonyGuide}

Hard rules:
1. Work from THIS text file. Skim its structure first (Read the first ~150 lines, Grep for chapter markers). Anchor beats inside the actual work's text, never inside a translator's preface, introduction, or table of contents. If the file looks like an abridged or partial edition, still retell only what THIS text contains.
2. Every beat needs "anchor" (verbatim 8 to 14 consecutive words where the scene/passage begins) AND "endAnchor" (verbatim 8 to 14 words where the retold span ends, at a sentence boundary, AFTER the anchor). The span must contain the retold moment and the quote if any; keep spans tight per the bible.
3. CONFIRM every anchor, endAnchor, and quote with a fixed-string Grep against the file before returning (use a distinctive punctuation-free word run when quotes or commas interfere; the returned field is still the verbatim text). A dead anchor kills the beat at build time.
4. ${w.format === 'stack' ? 'Stack items need no ordering.' : 'Stream beats and their anchors must be in ASCENDING order through the book.'}
5. Mark "standalone": true only on beats that work with ZERO context (aim for 3 to 8). Tag "warnings" honestly. "spice": 0 none, 1 mild, 2 full send.
6. Never write the words "Project Gutenberg" anywhere.

slug: "${w.slug}". Return via StructuredOutput only.`
}

function verifyPrompt(w, work) {
  const file = `${ROOT}\\public\\books\\${w.primaryId}.txt`
  return `You are a cold reader and fact checker for a Modernity retelling (classics retold in modern voice).

The voice bible (golden standard): ${VOICE} — read it first.
The book: "${w.title}" by ${w.author} (${w.format}${w.register === 'testimony' ? ', register: testimony — jokes are OFF by design, judge voice against the bible\u2019s testimony register, not the streamer register' : ''}). Text file: ${file}

The generated work as JSON:
${JSON.stringify(work, null, 1)}

Judge every beat:
1. EDITION COMPLETENESS first: skim the file's structure. If this text is abridged, a partial volume, or missing content the beats retell, mark those beats keep:false with issue "not in this edition" and say so clearly in overall.notes.
2. PLOT/PASSAGE ACCURACY: does each beat describe something that actually happens in (or an idea actually in) THIS text? Spot-check the file where unsure. Wrong facts = keep:false.
3. QUOTES: check each "quote" against the file, IGNORING punctuation, capitalization, whitespace, and Gutenberg italic markers (_word_) — the build repairs those automatically by rewriting the quote to the exact source text. Only mark keep:false when the quote's WORDS are wrong or absent (issue "quote words not in text"); never reject a beat over a comma, a period, an italic underscore, or a line break.
4. ANCHORS AND SPANS: Grep a distinctive word-run from each anchor and endAnchor. Missing = keep:false with issue "anchor not found" / "endAnchor not found". For a few beats, confirm the endAnchor sits AFTER the anchor and the span reads as one continuous moment, not two merged scenes.
5. VOICE: compare against the golden standard (or testimony register where applicable). A beat that only summarizes with no landed punchline, gut punch, or lore drop = keep:false with issue "flat".
6. FLAGS: spice, warnings, standalone sensible? Minor flag problems are keep:true with the issue noted.

Be harsh on accuracy, dead quotes/anchors, and edition gaps; honest on flatness; lenient on humor taste. In overall.notes, say whether the voice holds and whether the beat set covers the book. Return via StructuredOutput only.`
}

const works = typeof args === 'string' ? JSON.parse(args) : args
if (!Array.isArray(works) || !works.length) throw new Error('pass the chunk works via args (array of queue entries)')

log(`chunk: ${works.length} works — ${works.map((w) => w.slug).join(', ')}`)

phase('Generate')

const results = await pipeline(
  works,
  (w) => agent(genPrompt(w), { label: `gen:${w.slug}`, phase: 'Generate', schema: WORK_SCHEMA }),
  (work, w) => {
    if (!work || !work.beats || !work.beats.length) return null
    return agent(verifyPrompt(w, work), { label: `verify:${w.slug}`, phase: 'Verify', schema: VERIFY_SCHEMA })
      .then((v) => ({ slug: w.slug, work, verify: v }))
  }
)

const ok = results.filter(Boolean)
log(`chunk done: ${ok.length}/${works.length} works came back with verify results`)
return ok
