// wf-verify-only.js — cold-reader verification for already-generated Modernity
// works whose original verifiers died (e.g. on a usage limit). The staged work
// JSON lives in scripts/modernity/pending-verify/<slug>.json; agents Read it
// themselves so the payload never routes through the orchestrator.
// args: [{ slug, primaryId, title, author, format, register }]
// Verifiers run on sonnet at low effort: the job is mostly fixed-string greps.
export const meta = {
  name: 'modernity-verify-only',
  description: 'Verify staged Modernity generations (cold reader, sonnet, low effort)',
  phases: [{ title: 'Verify', detail: 'grep quotes/anchors, fact-check beats, judge voice' }],
}

const ROOT = 'C:\\Users\\Michael\\Desktop\\Focus Reader'
const VOICE = ROOT + '\\docs\\modernity-voice.md'

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

const works = typeof args === 'string' ? JSON.parse(args) : args
if (!Array.isArray(works) || !works.length) throw new Error('pass staged works via args')

phase('Verify')

const results = await parallel(works.map((w) => () =>
  agent(
    `You are a cold reader and fact checker for a Modernity retelling (classics retold in modern voice).

The voice bible (golden standard): ${VOICE} — read it first.
The book: "${w.title}" by ${w.author} (${w.format}). Text file: ${ROOT}\\public\\books\\${w.primaryId}.txt
The generated work: Read ${ROOT}\\scripts\\modernity\\pending-verify\\${w.slug}.json — the "work" key holds { feelings, intensity, beats: [{title, modern, quote?, anchor, endAnchor, spice, warnings, standalone}] }.

Judge every beat:
1. EDITION COMPLETENESS first: skim the file's structure. If this text is abridged, a partial volume, or missing content the beats retell, mark those beats keep:false with issue "not in this edition" and say so clearly in overall.notes.
2. PLOT/PASSAGE ACCURACY: does each beat describe something that actually happens in THIS text? Spot-check the file where unsure. Wrong facts = keep:false.
3. QUOTES: check each "quote" against the file, IGNORING punctuation, capitalization, whitespace, and Gutenberg italic markers (_word_) — the build repairs those automatically. Only keep:false when the quote's WORDS are wrong or absent (issue "quote words not in text").
4. ANCHORS AND SPANS: Grep a distinctive word-run from each anchor and endAnchor. Missing = keep:false with issue "anchor not found" / "endAnchor not found". For a few beats, confirm the endAnchor sits AFTER the anchor and the span reads as one continuous moment.
5. VOICE: compare against the golden standard. A beat that only summarizes with no landed punchline, gut punch, or lore drop = keep:false with issue "flat".
6. FLAGS: spice, warnings, standalone sensible? Minor flag problems are keep:true with the issue noted.

Be harsh on accuracy, dead quotes/anchors, and edition gaps; honest on flatness; lenient on humor taste. In overall.notes, say whether the voice holds and whether the beat set covers the book. Return via StructuredOutput only.`,
    { label: `verify:${w.slug}`, phase: 'Verify', schema: VERIFY_SCHEMA, model: 'sonnet', effort: 'low' }
  ).then((v) => ({ slug: w.slug, verify: v }))
))

return results.filter(Boolean)
