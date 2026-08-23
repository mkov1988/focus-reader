/**
 * Narration pipeline, step 3: align, time, and encode.
 *
 * Takes synth.py's per-unit WAVs + Kokoro token timings and produces, per
 * book × persona, the shippable artifacts under work/<id>/<persona>/out/:
 *
 *   seg-NNN.opus      24 kbps mono Opus, one per planned segment
 *   timing-v1.json    per-word durations (centiseconds) over the whole span,
 *                     segment index, naturalWpm — the file the app turns into
 *                     pacing multipliers (docs/narration-plan.md §5, §8)
 *
 *   node scripts/narration/finish.mjs --ids=84,1342,14838 --voices=marlowe,rowan,hazel
 *
 * Alignment is deterministic, never fuzzy: the unit text was BUILT from
 * reader tokens, so the normalized character streams of (reader words) and
 * (Kokoro tokens) must be byte-identical — any difference is a hard, loud,
 * per-unit failure (Modernity's rails discipline). No silent patching.
 *
 * Requires ffmpeg on PATH. WAVs are kept for verify.mjs --deep; delete the
 * work dir when a book has shipped.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, 'work');

// Same normalization as build-modernity.mjs uses for anchor matching: the
// spelling of a word is compared, never its punctuation or casing.
export const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Map each reader word to its start time (seconds, unit-relative).
 * readerWords: string[] (raw token text). kokoroTokens: [{text, start, end}].
 * Returns number[] of starts, one per reader word (null → resolved to the
 * next word's start, i.e. a zero-duration word; only empty-norm words may do
 * that). Throws with a position diff when the streams disagree.
 */
export function alignUnit(readerWords, kokoroTokens) {
    const readerNorms = readerWords.map(norm);
    const readerStream = readerNorms.join('');
    let kokoroStream = '';
    const charStart = []; // per char of kokoroStream: that token's start time
    for (const t of kokoroTokens) {
        const n = norm(t.text);
        for (let c = 0; c < n.length; c++) charStart.push(t.start);
        kokoroStream += n;
    }
    if (readerStream !== kokoroStream) {
        let p = 0;
        while (p < Math.min(readerStream.length, kokoroStream.length) && readerStream[p] === kokoroStream[p]) p++;
        throw new Error(
            `alignment stream mismatch at char ${p}: `
            + `reader "…${readerStream.slice(Math.max(0, p - 20), p + 20)}…" vs `
            + `kokoro "…${kokoroStream.slice(Math.max(0, p - 20), p + 20)}…" `
            + `(reader ${readerStream.length} chars, kokoro ${kokoroStream.length})`,
        );
    }
    const starts = [];
    let p = 0;
    for (let w = 0; w < readerWords.length; w++) {
        const len = readerNorms[w].length;
        starts.push(len === 0 ? null : charStart[p]);
        p += len;
    }
    // A punctuation-only token ("--", a "*" in a scene-break row) has no
    // voiced chars: give it zero width at the next word's start, so the
    // silence stays with the preceding word. Resolve the LAST position first
    // (to the audio's final voiced moment, or 0 for an all-silent unit), then
    // propagate backwards — order matters: a trailing RUN of silent words
    // must all collapse onto that same edge.
    if (starts.length && starts[starts.length - 1] === null) {
        starts[starts.length - 1] = kokoroTokens.length ? kokoroTokens[kokoroTokens.length - 1].end : 0;
    }
    for (let w = starts.length - 2; w >= 0; w--) {
        if (starts[w] === null) starts[w] = starts[w + 1];
    }
    for (let w = 0; w < starts.length; w++) {
        if (starts[w] === null || !Number.isFinite(starts[w])) throw new Error(`unresolved start at word ${w} — alignment bug`);
        if (w > 0 && starts[w] < starts[w - 1]) throw new Error(`non-monotonic word starts at word ${w} (${starts[w - 1]} -> ${starts[w]})`);
    }
    return starts;
}

/**
 * Turn per-unit alignments into the shipped timing numbers.
 * plan: plan.json. unitData: per unit index {starts: number[] (unit-relative
 * seconds), durS: number}. Returns {durCs, segments, naturalWpm, totalDurMs}.
 *
 * Centisecond starts telescope per segment (durCs[i] = nextStartCs − startCs),
 * so per-segment sums are EXACT against the rounded segment duration — the
 * ±50ms rail in verify.mjs then measures encoding truth, not rounding noise.
 */
export function buildTiming(plan, unitData, bounds = { low: 170, high: 230 }) {
    const durCs = [];
    const segments = [];
    for (const seg of plan.segments) {
        let offset = 0; // seconds into the segment
        const startsCs = [];
        for (const u of seg.units) {
            const unit = plan.units[u];
            const data = unitData[u];
            if (!data) throw new Error(`missing unit data for unit ${u}`);
            if (data.starts.length !== unit.count) throw new Error(`unit ${u}: ${data.starts.length} starts for ${unit.count} words`);
            for (const s of data.starts) startsCs.push(Math.round((offset + s) * 100));
            offset += data.durS;
        }
        // Kokoro leaves onset silence before the first voiced word of nearly
        // every unit; the segment's opening silence belongs to its first word
        // (there is no earlier word to carry it), so clamp the first start to
        // zero. Without this the opening silence falls out of Σdur and the
        // parity rail below fails on every real book.
        if (startsCs.length) startsCs[0] = 0;
        const segDurCs = Math.round(offset * 100);
        for (let i = 0; i < startsCs.length; i++) {
            const next = i + 1 < startsCs.length ? startsCs[i + 1] : segDurCs;
            const d = next - startsCs[i];
            if (d < 0) throw new Error(`segment ${seg.i}: negative duration at span word ${durCs.length}`);
            durCs.push(d);
        }
        segments.push({ file: `seg-${String(seg.i).padStart(3, '0')}.opus`, startWord: seg.startWord, words: seg.words, durMs: segDurCs * 10 });
    }
    if (durCs.length !== plan.spanWords) throw new Error(`durCs covers ${durCs.length} words, span is ${plan.spanWords}`);
    const totalDurMs = segments.reduce((n, s) => n + s.durMs, 0);
    const naturalWpm = (60000 * plan.spanWords) / totalDurMs;
    if (naturalWpm < bounds.low || naturalWpm > bounds.high) {
        throw new Error(`naturalWpm ${naturalWpm.toFixed(1)} outside the ${bounds.low.toFixed(0)}–${bounds.high.toFixed(0)} master range for this voice — wrong speed, or a synthesis problem`);
    }
    // The shipped identity the app depends on: pacing multipliers derived from
    // these exact numbers must sum back to the audio length (§5). This checks
    // our own float handling, on the numbers as shipped.
    const sumMs = durCs.reduce((n, d) => n + d * 10, 0);
    if (Math.abs(sumMs - totalDurMs) > 1) throw new Error(`parity identity broke: Σdur ${sumMs}ms vs audio ${totalDurMs}ms`);
    return { durCs, segments, naturalWpm: Math.round(naturalWpm * 10) / 10, totalDurMs };
}

function ffmpegConcatToOpus(wavPaths, outPath) {
    // The list file must NOT live in out/ — everything in out/ ships to R2.
    const list = path.join(os.tmpdir(), `narr-concat-${process.pid}-${path.basename(outPath)}.txt`);
    writeFileSync(list, wavPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
    try {
        const r = spawnSync('ffmpeg', [
            '-hide_banner', '-loglevel', 'error', '-y',
            '-f', 'concat', '-safe', '0', '-i', list,
            '-c:a', 'libopus', '-b:a', '24k', '-ac', '1', '-ar', '24000', '-application', 'voip',
            outPath,
        ], { stdio: ['ignore', 'inherit', 'inherit'] });
        if (r.status !== 0) throw new Error(`ffmpeg failed for ${path.basename(outPath)} (is ffmpeg on PATH?)`);
    } finally {
        rmSync(list, { force: true });
    }
}

// The 170–230 rail was calibrated for the global master speed (1.2). A
// persona reading at its own slower speed (Marlowe) shifts the whole
// window proportionally — the rail checks the voice's intended pace, not
// one universal number.
function wpmBoundsFor(persona) {
    const voices = JSON.parse(readFileSync(path.join(HERE, 'voices.json'), 'utf8'));
    const scale = (voices.personas[persona]?.speed ?? voices.speed) / voices.speed;
    return { low: 170 * scale, high: 230 * scale };
}

function finishBookVoice(id, persona) {
    const plan = JSON.parse(readFileSync(path.join(WORK, id, 'plan.json'), 'utf8'));
    const dir = path.join(WORK, id, persona);
    const outDir = path.join(dir, 'out');
    mkdirSync(outDir, { recursive: true });

    const unitData = {};
    for (const unit of plan.units) {
        const base = path.join(dir, `unit-${String(unit.i).padStart(5, '0')}`);
        if (!existsSync(base + '.wav') || !existsSync(base + '.tokens.json')) {
            throw new Error(`unit ${unit.i} not synthesized yet — run synth.py to completion first`);
        }
        const rec = JSON.parse(readFileSync(base + '.tokens.json', 'utf8'));
        const readerWords = unit.text.split(' ');
        const starts = alignUnit(readerWords, rec.tokens);
        unitData[unit.i] = { starts, durS: rec.durS };
    }

    const timing = buildTiming(plan, unitData, wpmBoundsFor(persona));
    for (const seg of plan.segments) {
        const outPath = path.join(outDir, timing.segments[seg.i].file);
        const wavs = seg.units.map((u) => path.join(dir, `unit-${String(u).padStart(5, '0')}.wav`));
        ffmpegConcatToOpus(wavs, outPath);
        timing.segments[seg.i].bytes = statSync(outPath).size;
    }

    writeFileSync(path.join(outDir, 'timing-v1.json'), JSON.stringify({
        v: 1,
        bookId: plan.bookId,
        voice: persona,
        naturalWpm: timing.naturalWpm,
        span: plan.span,
        segments: timing.segments,
        durCs: timing.durCs,
    }) + '\n');
    writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ v: 1, ok: true, finishedAt: new Date().toISOString() }) + '\n');

    const hours = timing.totalDurMs / 3600000;
    const at300 = plan.spanWords / 300 / 60;
    console.log(`${id}/${persona}: ok — ${plan.segments.length} segments, ${hours.toFixed(1)}h audio, naturalWpm ${timing.naturalWpm} (at 300 WPM this book takes ${at300.toFixed(1)}h)`);
}

function main() {
    const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1] || '';
    const ids = arg('ids').split(',').map((s) => s.trim()).filter(Boolean);
    const personas = arg('voices').split(',').map((s) => s.trim()).filter(Boolean);
    if (!ids.length || !personas.length) {
        console.error('Pass --ids=84,1342,14838 --voices=marlowe,rowan,hazel');
        process.exit(1);
    }
    let failures = 0;
    for (const id of ids) {
        for (const persona of personas) {
            try {
                finishBookVoice(id, persona);
            } catch (e) {
                console.error(`${id}/${persona}: FAILED — ${e.message}`);
                try {
                    writeFileSync(path.join(WORK, id, persona, 'status.json'), JSON.stringify({ v: 1, ok: false, error: e.message }) + '\n');
                } catch { /* work dir may not exist for this pair */ }
                failures++;
            }
        }
    }
    process.exit(failures ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
