/**
 * Narration pipeline, step 4: independent verification.
 *
 * Re-checks every rail from the OUTPUT side (finish.mjs enforced them while
 * writing; this re-derives them from the files as shipped — the Modernity
 * cold-reader idea applied to audio):
 *
 *   - timing shape: span, durCs coverage, non-negative, segment word counts
 *   - per-segment exactness: Σ durCs == durMs (rounding is telescoped)
 *   - encoding truth: ffprobe duration of every .opus within ±300ms of durMs
 *   - naturalWpm plausibility: 130–250 per book, 110–280 per segment (wide
 *     and absolute — each voice pack has its own baseline rate, so these
 *     catch synthesis disasters, not legitimate voice differences)
 *   - leftover gate re-scanned over the text actually voiced (plan units)
 *   - manifest cross-check when public/narration-v1.json already lists the pair
 *
 *   node scripts/narration/verify.mjs --ids=84,1342,14838 --voices=marlowe,rowan,hazel
 *     --bundled=path/to/bundled-books   also assert bundled JSON text == the
 *                                       mirror bytes the plan was built from
 *                                       (…/Focus Reader Android/src/data/bundled-books)
 *     --deep                            whisper-tiny re-transcribes 3 random 30s
 *                                       windows per pair; ≥85% word overlap
 *                                       (needs `whisper` CLI, ffmpeg)
 */
import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { norm } from './finish.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WORK = path.join(HERE, 'work');

const GATE_PATTERNS = [/gutenberg/i, /https?:\/\//i, /\bwww\./i, /\be-?text\b/i];

// Absolute plausibility rails (see finish.mjs): each voice pack has its own
// baseline rate, so a per-persona predicted window is the wrong model. These
// catch synthesis disasters, not legitimate voice differences.
const WPM_LOW = 130;
const WPM_HIGH = 250;
const SEG_WPM_LOW = 110;
const SEG_WPM_HIGH = 280;

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1] || '';
const ids = arg('ids').split(',').map((s) => s.trim()).filter(Boolean);
const personas = arg('voices').split(',').map((s) => s.trim()).filter(Boolean);
const DEEP = process.argv.includes('--deep');
const BUNDLED = arg('bundled');
if (!ids.length || !personas.length) {
    console.error('Pass --ids=84,1342,14838 --voices=marlowe,rowan,hazel [--deep] [--bundled=dir]');
    process.exit(1);
}

let failures = 0;
const fail = (label, msg) => { console.error(`FAIL ${label}: ${msg}`); failures++; };

function ffprobeDurMs(file) {
    const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('ffprobe failed — is ffmpeg installed?');
    return Math.round(parseFloat(JSON.parse(r.stdout).format.duration) * 1000);
}

function whisperWindow(opusPath, startS, durS) {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'narr-verify-'));
    try {
        const wav = path.join(tmp, 'w.wav');
        let r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(startS), '-t', String(durS), '-i', opusPath, '-ar', '16000', '-ac', '1', wav], { stdio: 'ignore' });
        if (r.status !== 0) throw new Error('ffmpeg window extraction failed');
        r = spawnSync('whisper', [wav, '--model', 'tiny.en', '--output_format', 'txt', '--output_dir', tmp, '--fp16', 'False'], { encoding: 'utf8' });
        if (r.status !== 0) throw new Error('whisper CLI failed — pip install openai-whisper in the narration venv for --deep');
        return readFileSync(path.join(tmp, 'w.txt'), 'utf8');
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

// Deterministic per-pair window picks (no RNG: verify must be reproducible).
const windowStarts = (totalMs, n) => Array.from({ length: n }, (_, k) => Math.floor((totalMs * (k + 1)) / (n + 1)));

for (const id of ids) {
    const planPath = path.join(WORK, id, 'plan.json');
    if (!existsSync(planPath)) { fail(id, 'no plan.json (excluded or never planned)'); continue; }
    const plan = JSON.parse(readFileSync(planPath, 'utf8'));

    for (const unit of plan.units) {
        for (const re of GATE_PATTERNS) {
            if (re.test(unit.text)) fail(`${id} unit ${unit.i}`, `voiced text matches leftover gate ${re}`);
        }
    }

    if (BUNDLED) {
        const bPath = path.join(BUNDLED, `${id}.json`);
        if (!existsSync(bPath)) fail(id, `--bundled: ${bPath} not found`);
        else {
            const bundled = JSON.parse(readFileSync(bPath, 'utf8'));
            const sha = createHash('sha256').update(bundled.text).digest('hex');
            if (sha !== plan.sourceSha256) fail(id, 'bundled JSON text differs from the mirror bytes the plan used — regenerate one of them');
        }
    }

    for (const persona of personas) {
        const label = `${id}/${persona}`;
        const failuresBefore = failures;
        const outDir = path.join(WORK, id, persona, 'out');
        const tPath = path.join(outDir, 'timing-v1.json');
        if (!existsSync(tPath)) { fail(label, 'no out/timing-v1.json'); continue; }
        const t = JSON.parse(readFileSync(tPath, 'utf8'));

        if (t.v !== 1 || t.bookId !== plan.bookId || t.voice !== persona) fail(label, 'timing header mismatch');
        if (t.span[0] !== plan.span[0] || t.span[1] !== plan.span[1]) fail(label, `span ${t.span} != plan ${plan.span}`);
        if (t.durCs.length !== plan.spanWords) fail(label, `durCs ${t.durCs.length} != span ${plan.spanWords}`);
        if (t.durCs.some((d) => d < 0 || !Number.isInteger(d))) fail(label, 'durCs has negative or non-integer entries');
        if (t.segments.length !== plan.segments.length) {
            // Stale timing against a re-run plan: a recorded failure, not a crash.
            fail(label, `segment count ${t.segments.length} != plan ${plan.segments.length} — stale out/? re-run finish.mjs`);
            continue;
        }

        let cursor = 0;
        let totalMs = 0;
        for (const [i, seg] of t.segments.entries()) {
            const planSeg = plan.segments[i];
            if (seg.words !== planSeg.words || seg.startWord !== planSeg.startWord) fail(label, `segment ${i} words/startWord mismatch`);
            const sum = t.durCs.slice(cursor, cursor + seg.words).reduce((n, d) => n + d * 10, 0);
            if (sum !== seg.durMs) fail(label, `segment ${i}: Σdur ${sum}ms != durMs ${seg.durMs}ms`);
            cursor += seg.words;
            totalMs += seg.durMs;
            const file = path.join(outDir, seg.file);
            if (!existsSync(file)) { fail(label, `${seg.file} missing`); continue; }
            if (statSync(file).size !== seg.bytes) fail(label, `${seg.file} bytes drifted`);
            const probed = ffprobeDurMs(file);
            if (Math.abs(probed - seg.durMs) > 300) fail(label, `${seg.file}: ffprobe ${probed}ms vs timing ${seg.durMs}ms (>300ms)`);
            const segWpm = (60000 * seg.words) / seg.durMs;
            if (segWpm < SEG_WPM_LOW || segWpm > SEG_WPM_HIGH) fail(label, `segment ${i} wpm ${segWpm.toFixed(0)} outside ${SEG_WPM_LOW}–${SEG_WPM_HIGH}`);
        }
        const wpm = (60000 * plan.spanWords) / totalMs;
        if (Math.abs(wpm - t.naturalWpm) > 0.2) fail(label, `naturalWpm ${t.naturalWpm} != recomputed ${wpm.toFixed(1)}`);
        if (wpm < WPM_LOW || wpm > WPM_HIGH) fail(label, `naturalWpm ${wpm.toFixed(1)} outside ${WPM_LOW}–${WPM_HIGH}`);

        const manifestPath = path.join(ROOT, 'public', 'narration-v1.json');
        if (existsSync(manifestPath)) {
            const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
            const entry = m.books?.[id]?.voices?.[persona];
            if (entry) {
                const bytes = t.segments.reduce((n, s) => n + s.bytes, 0);
                if (entry.naturalWpm !== t.naturalWpm || entry.segments !== t.segments.length
                    || entry.bytes !== bytes || entry.span[0] !== t.span[0] || entry.span[1] !== t.span[1]) {
                    fail(label, 'public/narration-v1.json disagrees with out/ — rerun build-manifest.mjs');
                }
            }
        }

        if (DEEP && failures === failuresBefore) {
            // Three 30s windows spread across the WHOLE book (§11), each
            // mapped to its segment. Deterministic positions — verify must be
            // reproducible. A window whose segment is too short is skipped.
            for (const targetMs of windowStarts(totalMs, 3)) {
                let segIdx = 0;
                let before = 0;
                while (segIdx < t.segments.length - 1 && before + t.segments[segIdx].durMs <= targetMs) before += t.segments[segIdx++].durMs;
                const seg = t.segments[segIdx];
                if (seg.durMs < 40000) continue;
                const startMs = Math.max(0, Math.min(seg.durMs - 31000, targetMs - before));
                const heard = whisperWindow(path.join(outDir, seg.file), startMs / 1000, 30);
                // Overlap is measured on normalized word sets, not order — a
                // cheap "is this the right audio for this text" tripwire, not
                // a transcription benchmark. Walk durCs to find the window's
                // words (durCs index of the segment's first word = cumulative
                // word count of prior segments).
                let wordBase = 0;
                for (let s = 0; s < segIdx; s++) wordBase += t.segments[s].words;
                const expected = new Set();
                let at = 0;
                for (let w = 0; w < seg.words; w++) {
                    if (at >= startMs && at <= startMs + 30000) {
                        const tokenId = seg.startWord + w;
                        const unit = plan.units.find((u) => tokenId >= u.start && tokenId < u.start + u.count);
                        if (unit) expected.add(norm(unit.text.split(' ')[tokenId - unit.start]));
                    }
                    at += t.durCs[wordBase + w] * 10;
                }
                expected.delete('');
                const heardSet = new Set(heard.split(/\s+/).map(norm).filter(Boolean));
                let hitCount = 0;
                for (const wrd of expected) if (heardSet.has(wrd)) hitCount++;
                const overlap = expected.size ? hitCount / expected.size : 0;
                if (overlap < 0.85) fail(label, `--deep ${seg.file} @${Math.round(startMs / 1000)}s: ${(overlap * 100).toFixed(0)}% word overlap (<85%)`);
            }
        }

        // Stamp the verdict where upload-audio-r2.mjs gates on it: a pair may
        // only ship after a clean verify (and a re-verify clears a stale stamp).
        const statusPath = path.join(WORK, id, persona, 'status.json');
        if (existsSync(statusPath)) {
            const status = JSON.parse(readFileSync(statusPath, 'utf8'));
            status.verified = failures === failuresBefore;
            writeFileSync(statusPath, JSON.stringify(status) + '\n');
        }

        if (failures === failuresBefore) console.log(`ok  ${label} — ${t.segments.length} segments, ${(totalMs / 3600000).toFixed(1)}h, naturalWpm ${t.naturalWpm}`);
    }
}

if (failures) {
    console.error(`\n${failures} failure(s). Nothing from a failing pair may be uploaded.`);
    process.exit(1);
}
console.log('\nAll verified.');
