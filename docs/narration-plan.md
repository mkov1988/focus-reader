# Voice narration plan

Planned 2026-08-22, from a phone-only session. Nothing is built yet: this doc is
the full design plus the runbook for the first desk session (§13). The feature:
natural-sounding AI narration of the books, always in sync with the WPM the
reader has set. Owner decisions in §2 are settled; open questions live in §14.

Read alongside: `docs/reader-feel-playbook.md` (engine invariants),
`docs/SERVING.md` (data plane), `docs/modernity-plan.md` (the pipeline pattern
this copies), `LEGAL.md` (strip rules — narration inherits all of them).

---

## 1. What this is

The reader gets an optional voice. Toggle it on and a narrator reads the book
while the reel runs; the voice and the on-screen word stay locked, at whatever
WPM the reader picks, and the WPM controls keep working exactly as today. Toggle
off and nothing about the reader has changed — narration is additive, defaults
off, and can never block or slow a book open.

Two ways to get a voice, built in this order of quality:

- **Lane B (flagship)**: pre-generated narration by our own narrator personas,
  for a curated shelf of books. Natural prosody, three distinct voices, word-
  accurate sync. Generated offline with a local model — no cloud AI at runtime,
  no per-listen cost, ever.
- **Lane A (universal, maybe)**: the phone's own text-to-speech engine, on the
  fly, for any book in the catalog including the 55k long tail. Zero storage,
  zero cost, works offline. Decent but recognizably synthetic. Whether Lane A
  ships at all is an open question — if Lane B's shelf is what people actually
  use, Lane A may not earn its complexity (§14).

Speed is **always** handled on the fly in both lanes — playback rate for Lane B,
engine speech rate for Lane A. We never generate multiple recordings per speed.
Pre-generation is only ever about *which books get the flagship voices*, and
that is a curated shelf, never the whole catalog (the whole catalog at audiobook
bitrates is terabytes; the long tail's answer is Lane A or nothing).

## 2. Settled decisions — do not re-litigate

| Decision | Settled as |
| --- | --- |
| Scope of the 2026-08-22 round | This document only; code comes in the desk sessions |
| Clock | The existing reel engine stays the only clock; audio follows it |
| Voices | Three original archetype personas (§7), generated with Kokoro-82M locally |
| Celebrity voices | Never cloned or tuned toward a real person; §7 has the line and why |
| Speed cap | Narration auto-mutes above 400 WPM; the WPM stepper is never clamped |
| Generation cost | $0 marginal: local model, own GPU/CPU, R2 zero-egress serving |
| Runtime cloud AI | None, same as everywhere else in this product |
| Dirty texts | Books with surviving gutenberg.org leftovers are excluded, never text-edited |
| Coverage | Curated shelf pre-generated; long tail on-device or nothing |
| Background audio | Deferred; narration plays only with the reader open, matching the AppState-pause invariant |

## 3. Why this won't repeat the "TTS ruined the app" failure

The archived PRD said "No audio sync — TTS is a different product," and the user
research file records a competitor RSVP app whose bolted-on TTS made the screen
fight the voice ("now I can't stop the screen from moving to adjust my
settings"). That failure mode is structural: two clocks — a TTS engine pacing
itself and a reader pacing itself — fighting for the screen.

This design has one clock. The reel engine paces the words exactly as it does
today; narration audio is a follower that gets nudged back into line. The
visual dwell per word is *derived from* the narration's own prosody (§5), so
voice and text agree by construction rather than by tuning. Narration defaults
off, adds one toggle to the existing controls, never blocks a book open, and
switching it off returns the reader to today's behavior bit for bit.

## 4. The two lanes

### Lane B — pre-generated personas (the flagship)

Offline pipeline in this repo (§8) synthesizes each shelf book with Kokoro-82M
(Apache-2.0, output freely redistributable, near-commercial quality, native
word timestamps), encodes ~20-minute Opus segments, and produces a per-word
timing file. Assets ship as immutable static files from R2 behind a new Pages
Function door (§9), following the same versioned-file contract as
`starts-v1.json` / `modernity-v1.json`. The app downloads segments to disk and
plays them locally — no streaming infra, no Range requests, and offline
listening for any book you've started, matching how book text already works.

The master is synthesized at a **~200 WPM natural pace** (Kokoro's speed knob,
roughly 1.2). Android's pitch-corrected playback rate runs 0.5×–2.0×, so a
200-natural master covers **WPM 100–400 exactly** — the full voiced range lands
on our floor and the agreed mute point with nothing wasted.

Pilot shelf: the three bundled books (84, 1342, 14838) × three personas.
Roughly 21 hours of audio per persona, ~700 MB total at 24 kbps mono Opus —
trivial R2 cost, zero egress cost. Expansion after the pilot is pure pipeline
re-runs plus uploads; no app change.

### Lane A — on-device TTS (universal coverage, pending spike)

`expo-speech` over the phone's system TTS engine. Sentence-per-utterance queue
(Android caps an utterance at ~4,000 chars), each utterance spoken at
rate ≈ wpm / natural; the engine re-syncs at every sentence start, so drift is
bounded by a sentence. Word-level lock can use the engine's word-boundary
callbacks where the installed TTS engine supports them — fidelity varies by
engine and must be confirmed by a device spike before any UI promises are made.
Quality is whatever voices the phone has; treat it as functional narration, not
the flagship experience.

Future note, deferred: Kokoro is small enough (82M params) to run on-device via
sherpa-onnx, which would eventually merge the lanes — natural voices, on the
fly, any book. That needs a custom native module and battery/thermal testing;
not in any near phase.

## 5. How the sync works (Lane B)

Today the engine shows word *i* for `(60000 / wpm) × delayMultiplier[i]` ms,
where the multipliers are synthetic (sentence end 3×, comma 2×, and so on).
Narration mode swaps that array for one derived from the recording itself:

```
delays_narr[i] = wordDurMs[i] × naturalWpm / 60000
```

where `wordDurMs[i]` is how long the narrator actually spends on word *i*
(including the pause after it — a sentence-end word naturally carries its long
dwell, because the narrator pauses there too), and
`naturalWpm = 60000 × spanWordCount / totalAudioMs`. The mean of
`delays_narr` is exactly 1.0, so the WPM readout stays honest: N words at
300 WPM take N/300 minutes.

Feed that array through the engine's existing per-book delay table and
everything else follows without modification: the engine's word delay becomes
`wordDurMs[i] / rate`, the audio plays at
`setPlaybackRate(wpm / naturalWpm, pitch-corrected)`, and the reel and the
voice advance at the same relative pace by construction. The WPM stepper,
scrubbing, seeking, sentence skip, session stats, readable-span clamping — all
untouched.

What still needs active correction: the engine discards accumulator overshoot
on every word advance (deliberate web parity), which loses about half a frame
per word — roughly 4% slippage at 300 WPM, cumulative. So the audio controller
does a throttled drift check (at most ~1/second, on word commits via the
engine's index subscription): if the player position is more than ~250 ms from
where the committed word says it should be, hard-seek the audio. Scrubs, seeks,
and sentence skips need zero extra wiring — the next drift check sees a huge
delta and reseeks. If seeks prove audible in practice, a ±2% rate nudge is the
gentler correction; start with seek-only.

Edge rules:
- Words outside the readable span keep their synthetic multipliers; narration
  audio only exists over the span. Scrubbing into front/back matter behaves
  exactly like today, silently.
- Sentence-mode's extra start-of-sentence hold is forced off while narrating
  (it would fight the recording; the narrator already breathes there).
- If the next audio segment isn't downloaded yet, the voice drops out and the
  reel keeps going; the voice rejoins when the segment lands. Reading never
  waits for audio, anywhere, ever.
- If a book's timing file disagrees with the app's parsed readable bounds
  (tokenizer drift guard), narration silently disables for that book.

## 6. Speed range and the 400 mute

The WPM stepper stays completely free, 100–1000 — narration never limits
reading speed. The voice follows from 100 up to 400 WPM (the 2.0× ceiling of
the 200-natural master, and about where synthetic speech stops being
intelligible anyway). Step above 400 and narration mutes with a small
indicator; step back under and it rejoins where the reel is. Same rule for
Lane A. No second "fast master" recording unless real users hit the mute wall
and complain (deferred, and it would double storage and pipeline time).

## 7. The three narrator personas

Original voices, built as **generic archetype profiles** — defined by
attributes, auditioned from Kokoro's voice packs, optionally blended (Kokoro
supports voice-pack blending, so a persona can be a mix that exists nowhere
else but Focus Reader):

1. **Marlowe** — the storyteller: deep, unhurried, warm-gravel American
   baritone; cinematic gravitas. Audition: `am_michael`, `am_onyx`, blends.
2. **Rowan** — the naturalist: hushed, precise, older British male;
   documentary cadence, intimate rather than boomy. Audition: `bm_george`,
   `bm_fable`, `bm_lewis`, blends.
3. **Hazel** — the lead: warm, expressive, mature American female; theatrical
   range without melodrama. Audition: `af_heart` (Kokoro's top-rated voice),
   `af_bella`, `af_nicole`, blends.

Names chosen 2026-08-22 (settled). Voice keys in manifests and R2 paths are
the lowercase names: `marlowe`, `rowan`, `hazel`. The runbook still includes
the sampler step: synthesize one test paragraph per candidate pack, listen on
the phone, lock which pack (or blend) carries each persona before any
full-book run.

**The line, stated once:** these voices are never cloned from, tuned toward, or
marketed by reference to any real person. Sound-alike imitations of
identifiable people lose in court even when the person is never named (Midler
v. Ford; Waits v. Frito-Lay, $2.6M; Tennessee's ELVIS Act now covers any
"simulation of the voice", and California's AB 1836 covers deceased
performers) — and a paid app is the worst posture for that risk. Archetypes are
genres nobody owns; keep the profiles attribute-defined in every doc, this one
included, and the personas stay clean. Add to the LEGAL.md lawyer-gate list
before payments go live: confirm comfort with the Kokoro voice packs'
provenance for a paid product.

Narration inherits every strip rule in LEGAL.md: synthesis input is the
stripped text only, and no "Project Gutenberg" (or gutenberg.org leftover) may
ever be voiced — enforced by a hard gate (§8), by exclusion rather than
editing, because narrated words must stay one-to-one with reader token ids.

## 8. Lane B pipeline (`scripts/narration/` — BUILT, runs at the desk)

Node orchestrates (repo convention); Python only for synthesis (Kokoro is
Python). Work products live in gitignored `scripts/narration/work/`; only the
manifest and the checklist are committed. Modernity's discipline applies
throughout: hard rails, exit-code failures, a generated `NARRATION-CHECKLIST.md`
ledger, no silent patching. The planner, alignment, timing math, and the audio
door are covered by contract tests that need no Kokoro:
`node scripts/narration/test-narration.mjs` and
`node scripts/test-audio-function.mjs`.

| Script | Role |
| --- | --- |
| `scripts/lib/load-ts.mjs` | Shared TS-transpile loader (the `test-tokenize.mjs` technique from the Android repo) so pipeline scripts import the REAL `src/utils/textProcessing.ts` + `chapterDetection.ts` — the tokenizer is never replicated |
| `narration/plan.mjs` | Per book: read the exact mirror bytes (`public/books/<id>.txt`), run the real `parseText` → tokens + readable bounds; run the leftover gate; emit `work/<id>/plan.json` — synthesis units (paragraphs over the span, long ones split at sentence boundaries to ≤450 words) grouped into ~3,500-word segments starting on paragraph boundaries. Unit TTS text = the unit's tokens joined with single spaces, `_underscores_` stripped — token-space-preserving by construction |
| `narration/synth.py` | Kokoro synthesis per unit at speed ≈1.2 (≈200 WPM natural), writing per-unit WAV + Kokoro token timestamps. Resumable (skips existing outputs); `--device=cuda\|cpu`; `--sample` mode for the §7 persona audition; `--voices=` takes pack names or blend specs |
| `narration/finish.mjs` | Align Kokoro tokens → reader token ids (below); concatenate units per segment; encode Opus (ffmpeg, 24 kbps mono); compute per-word durations (centiseconds), `naturalWpm`, segment index; write `work/<id>/<voice>/out/` mirroring the R2 layout. Any rail failure = book+voice failed, exit 1 |
| `narration/verify.mjs` | Independent re-check of every rail (§11); `--deep` adds whisper spot re-transcription |
| `narration/build-manifest.mjs` | Aggregate verified outputs → `public/narration-v1.json` |
| `narration/build-narration-checklist.mjs` | Regenerates `NARRATION-CHECKLIST.md` (do not edit by hand) |
| `scripts/upload-audio-r2.mjs` | rclone, same `.r2.env`, `work/**/out` → `focus-reader-books` bucket under `audio/` keys; `--ids=` / `--voices=` / `--all` |

**Alignment** is deterministic, not fuzzy: unit input text was built *from*
reader tokens, so the only mapping needed is Kokoro's token list back onto our
word list. Normalize both sides (lowercase, strip non-alphanumerics — the same
`norm` as `build-modernity.mjs`), concatenate into char streams with
char→token maps, and **rail: the two streams must be byte-identical** (Kokoro
rewriting graphemes — numeral expansion, say — trips the rail loudly, per unit,
with the diff position; book 84 validates the assumption first). Two-pointer
walk assigns each reader word its start time; word duration = next word's start
minus its own (last word: segment end), so the narrator's pauses attach to the
preceding word, matching how RSVP treats punctuation. Any mismatch or missing
timestamp = unit failed = book+voice failed. Never patch, never munge.

**Leftover gate** (in `plan.mjs`, hard): scan span tokens for
`/gutenberg/i`, `https?://`, `\bwww\.`, `\be-?text\b`. Any hit excludes the
book from narration and lists it in the checklist with the matched line. The
~50 known dirty texts are simply not narratable until a coordinated re-strip +
re-anchor happens (out of scope here).

**Data shapes.**

`public/narration-v1.json` (Pages static, filename-is-version, fetched on the
deepStarts pattern):

```json
{
  "v": 1,
  "voices": { "marlowe": { "label": "Marlowe" } },
  "books": {
    "84": {
      "voices": {
        "marlowe": { "naturalWpm": 199.2, "segments": 21, "bytes": 63008412, "span": [412, 74911] }
      }
    }
  }
}
```

R2 `audio/<id>/<voice>/timing-v1.json`:

```json
{
  "v": 1, "bookId": "84", "voice": "marlowe", "naturalWpm": 199.2,
  "span": [412, 74911],
  "segments": [ { "file": "seg-000.opus", "startWord": 412, "words": 3496, "durMs": 1052832, "bytes": 3158496 } ],
  "durCs": [20, 26, 15, 79]
}
```

`durCs` = one duration per span word, in centiseconds (10 ms units — sub-frame
precision is meaningless against a 16 ms frame clock; keeps a 127k-word book's
timing file around 450 KB raw / ~120 KB on the wire). The app derives
`delays_narr` and per-segment prefix sums at load. Audio: Ogg/Opus,
24 kbps mono, segments ~3,500 span words ≈ 17–18 min ≈ 3 MB, new segment on a
paragraph boundary. R2 keys: `audio/<id>/<voice>/seg-NNN.opus`.

## 9. Serving

- New Pages Function `functions/audio/[[path]].js`, mirroring the books
  function: GET/HEAD only (405 otherwise), path validated against
  `^\d+/[a-z]+/(seg-\d{3}\.opus|timing-v1\.json)$`, served from the existing
  `BOOKS` R2 binding under the `audio/` prefix (same bucket — no new
  credentials, and `backup-r2.mjs` extends naturally), immutable cache + CORS
  wildcard + correct Content-Type, 404-with-CORS on miss. No Range support
  needed: the app downloads whole segments to disk, then plays locally.
- `public/_headers`: add `/narration-v1.json` stanza (same as modernity's).
- `scripts/deploy-manifest.json`: add `narration-v1.json` to `mustExist` only
  once the manifest first ships (an empty `{v:1, voices:{}, books:{}}` can ship
  immediately to make that safe).
- `scripts/backup-r2.mjs`: sync `audio/` primary → backup and include it in the
  count verification.
- Verify with `node scripts/deploy-pages.mjs --preview` + curl checks (§11)
  before any production deploy.

## 10. Android integration (own branch in the app repo, after pilot audio exists)

The entire engine change is one seam: `useReelEngine` grows an optional
`pacingOverride: number[] | null`; the effect that fills the per-book delay
table (`useReelEngine.ts:209-212`, `delaysSV`) uses the override when present.
Worklet identity, shared values, gestures: untouched — the override rides the
existing shared value, so the playbook invariants hold.

Around it:
- `src/services/narration.ts` — manifest on the deepStarts pattern (post-boot
  silent background fetch, disk cache, sync lookups, never on the open path);
  per-book timing + segments on the library.ts file-cache pattern
  (`narration/<id>/<voice>/` under the document dir; timing first, segments on
  demand, next segment prefetched at ~80% through the current one).
- `src/config.ts` — `AUDIO_BASE` and `NARRATION_URL` from the single
  `SERVING_ORIGIN`.
- Two hooks in `ReaderScreen`: `useNarrationPacing` (book id + parsed →
  override array or null; null falls back to synthetic seamlessly) and
  `useNarrationAudio` (owns the expo-audio player; mirrors engine play/pause;
  segment switching + drift check on the engine's index subscription; reapplies
  rate + reseeks on WPM change; releases on unmount). AppState pause and
  back-nav pause already route through `engine.pause()`, so audio follows for
  free. Stats need no change: sessions are engine play→pause spans and the
  engine still drives.
- Dependency: `expo-audio` + `expo.version` bump + `npm run typecheck && npm
  test` (the tokenizer pin must stay green — this feature adds no tokenizer
  change).
- UI for the pilot: one speaker toggle on the existing playback controls face,
  plus the mute-above-400 indicator. The voice picker waits for the Reading
  style sheet (Michael sketches surfaces first — standing rule). Persona
  selection for the pilot can live behind a long-press or default to
  Marlowe until the sheet exists.
- Background/lock-screen audio: explicitly deferred (new permission surface,
  known Expo bug, conflicts with the screen-on reading model).

## 11. Verification

Pipeline rails (`finish.mjs` enforces, `verify.mjs` re-checks independently):
normalized-stream equality per unit; timestamps monotonic and non-negative;
`durCs` length equals span length exactly; per-segment duration sum matches
ffprobe within ±50 ms; `naturalWpm` within 170–230 per book (per segment the
rail is the looser 150–260 — prosody legitimately varies by passage);
leftover gate clean; the parity identity — Σ(`delays_narr[i]` ×
60000/`naturalWpm`) equals total audio ms — asserted on the exact numbers
shipped, plus a printed "at 300 WPM this book takes X h" sanity line; `--deep`:
whisper-tiny re-transcription of three random 30 s windows per book, ≥85% word
overlap against the source tokens.

Serving: preview deploy, then curl `audit-preview`: a real segment (200,
`audio/ogg`, immutable, CORS), a missing id (404 with CORS), POST (405), and
the existing `/books/84.txt` still 200 (no regression from the second
function).

Android round: `npm run typecheck && npm test`, `qa:web` (narration no-ops on
web like deepStarts), then device verification by Michael via version stamp:
voiced word == displayed word at sentence starts over five minutes at 300 WPM;
scrub/seek/sentence-skip while narrating; WPM step to the mute at 400 and back;
backgrounding stops both; airplane mode plays cached segments and reads
silently past uncached ones.

Lane A spike checklist (if/when): word-boundary callback fidelity per TTS
engine, usable rate range, gap length between queued utterances, behavior when
the engine is missing or muted.

## 12. Cost and storage

Generation: $0 marginal — Kokoro locally (pilot ≈ 63 hours of audio; overnight
on CPU at 2–3× realtime, or well under an hour on a consumer GPU). Storage:
pilot ~700 MB in R2 (~$0.01/month); a future top-100 shelf ≈ 25 GB/persona at
this bitrate — R2 pennies, zero egress. No paid TTS APIs anywhere; if a paid
tier is ever wanted for marketing-grade voices, that's a decision for after the
pilot listen test, not a dependency.

## 13. Desk runbook (next week)

The pipeline, serving door, and tests are BUILT and on this branch
(2026-08-22 session). Already validated without a model: all contract tests
pass; `plan.mjs` ran against the three pilot books' exact bundled bytes (gate
clean, spans tile — 84: 74,975 span words / 21 segments, 1342: 127,278 / 36,
14838: 1,012 / 1 — and the shipped story-start anchors land in-span); the
audio door passed a mocked contract test; `npm run build` and
`check-strip-sync` stay green. Synthesis could not run in the session (the
container's network policy blocks the model download) — it starts at the
desk. In order:

1. Sync this repo. One-time setup in `scripts/narration/`: Python 3.11 venv,
   `pip install -r requirements.txt` (kokoro, soundfile, torch — CUDA build
   first if you want the GPU), `espeak-ng` installed system-wide (§14),
   ffmpeg on PATH. `npm run mirror:books` must have populated `public/books/`
   locally, and `npm ci` the repo once for the TS loader.
2. Audition: `python synth.py --sample` writes every candidate clip to
   `work/_samples/` → listen on your phone → set each persona's `kokoro` pack
   (or blend) in `voices.json`.
3. Pilot: `node plan.mjs --ids=84,1342,14838` →
   `python synth.py --ids=84,1342,14838 --voices=marlowe,rowan,hazel`
   (overnight if CPU; resumable, rerun after any interruption) →
   `node finish.mjs --ids=… --voices=…` → `node verify.mjs --ids=… --voices=…`
   → `node build-manifest.mjs && node build-narration-checklist.mjs`.
4. Listen test: play a chapter of each book/persona from
   `work/<id>/<voice>/out/`. **This is the go/no-go for the whole feature.**
   If the voices aren't good enough, stop here — nothing has shipped and the
   app is untouched.
5. Ship the data plane: `node scripts/upload-audio-r2.mjs --ids=84,1342,14838`,
   `node scripts/backup-r2.mjs`, `node scripts/deploy-pages.mjs --preview`,
   run the §11 curls against audit-preview, then production deploy.
6. App round (own branch in `focus-reader-android`, per §10), device
   verification by version stamp.

## 14. Open questions (for Michael)

1. ~~Persona display names~~ — settled 2026-08-22: **Marlowe, Rowan, Hazel** (§7).
2. OK installing espeak-ng on your machine? (Small system dependency Kokoro
   uses for out-of-vocabulary words.)
3. After the pilot listen test: does Lane A (system TTS for the long tail)
   still earn a spike, or is the flagship shelf the whole feature?
4. Paragraph-break breathing: the narrator will naturally pause between
   paragraphs, which surfaces the playbook's long-open "should a paragraph
   break breathe?" question for the *visual* modes too. Not wired to anything
   here; noting the collision so it gets answered once, deliberately.
