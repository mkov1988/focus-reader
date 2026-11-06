/**
 * Key-idea summaries pipeline, step 1: run the model for each selected title.
 *
 * For every title picked by --ids/--pilot/--all and every run label in RUNS
 * (a, b) one model call returns { about, cards } under CARD_SCHEMA from
 * lib.mjs. Raw results land in the gitignored work area as
 * <work>/<id>/run-<label>.json; verify.mjs reads them next.
 *
 *   node scripts/summaries/generate.mjs --ids=800003,800006
 *   node scripts/summaries/generate.mjs --pilot=5 --runs=2
 *   node scripts/summaries/generate.mjs --all --batch                (submit at half price, exit)
 *   node scripts/summaries/generate.mjs --all --batch --wait         (submit, poll every minute, collect)
 *   node scripts/summaries/generate.mjs --collect=msgbatch_...       (collect a submitted batch; --wait polls first)
 *   node scripts/summaries/generate.mjs --ids=800003 --mock --work=/tmp/x   (tests: deterministic, no network)
 *
 * Flags: --runs=N (default every label in RUNS), --model=… (default MODEL),
 * --force (redo runs that already have output), --mock (mockOutput from
 * lib.mjs, never touches the network), --batch / --wait / --collect=<id>
 * (Message Batches API), and --work= --source= --books-dir= path overrides:
 * every path comes from resolvePaths so the contract test runs in a temp dir.
 *
 * Public-domain titles (rights public_domain_us with a gutenberg_id) get the
 * full stripped book text in the prompt. It is resolved once into
 * <work>/<id>/source.txt: <books-dir>/<gid>.txt, else the served
 * SERVING_ORIGIN/books/<gid> (already stripped), else gutenberg.org passed
 * through stripGutenbergBoilerplate before anything is written (LEGAL.md: an
 * unstripped Gutenberg file is never stored). No source in a non-mock run
 * fails that title's runs with error.type 'no-source': a public-domain book
 * is never summarised from memory.
 *
 * Run file shape:
 *   { v: 1, id, run, model, mode: 'direct' | 'batch' | 'mock', requestedAt,
 *     usage: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens },
 *     stop_reason, output: { about, cards } | null, error: null | { type, message } }
 * Resumable: a run whose file exists with a non-null output is skipped unless
 * --force. Every file is written atomically (<file>.tmp, then rename).
 *
 * Direct mode keeps at most 2 requests in flight and retries rate limits,
 * connection errors and 5xx up to 4 times (2s, 4s, 8s, 16s); the SDK's own
 * retries are off (maxRetries 0) so that ladder is the whole policy. The
 * request sends no thinking/temperature/top_p/top_k (Claude Opus 5.5 rejects
 * them); effort high and the JSON schema go through output_config, and the
 * server-side refusal fallback is on: a run file records the model that
 * served it (message.model), which differs from --model after a fallback.
 * A batch carries the same params minus betas/fallbacks (the Batches API
 * rejects them).
 *
 * Exit 1 if any run failed, else 0. A plain --batch submit exits 0 once the
 * ledger <work>/_batches/<batchId>.json is written; nothing has run yet.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import {
    resolvePaths, arg, flag, loadSource, selectEntries, CARD_SCHEMA, buildPrompt,
    mockOutput, readJson, PRICE_PER_MTOK, SERVING_ORIGIN, MODEL, RUNS,
} from './lib.mjs';
import { stripGutenbergBoilerplate } from '../lib/strip-gutenberg.mjs';

const MAX_TOKENS = 16000;
const EFFORT = 'high';
const IN_FLIGHT = 2;
const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000];
const POLL_MS = 60_000;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const paths = resolvePaths(process.argv);
const model = arg('model', MODEL);
const runsWanted = Number(arg('runs', RUNS.length));
const force = flag('force');
const mock = flag('mock');
const batch = flag('batch');
const wait = flag('wait');
const collect = arg('collect');
const mode = mock ? 'mock' : batch ? 'batch' : 'direct';

if (!Number.isInteger(runsWanted) || runsWanted < 1 || runsWanted > RUNS.length) {
    console.error(`--runs must be an integer from 1 to ${RUNS.length} (RUNS = ${RUNS.join(', ')})`);
    process.exit(1);
}
if (mock && (batch || collect)) {
    console.error('--mock never touches the network; drop --batch / --collect');
    process.exit(1);
}
if (wait && !batch && !collect) console.log('--wait does nothing without --batch or --collect; ignored');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runFile = (id, run) => path.join(paths.work, String(id), `run-${run}.json`);
const ledgerFile = (batchId) => path.join(paths.work, '_batches', `${batchId}.json`);
const customId = (id, run) => `${id}-${run}`;
const isPublicDomain = (entry) => entry.rights === 'public_domain_us' && Boolean(entry.gutenberg_id);

function writeAtomic(file, data) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, data);
    renameSync(`${file}.tmp`, file);
}
const writeJson = (file, obj) => writeAtomic(file, JSON.stringify(obj, null, 2) + '\n');

/** The SDK is loaded only when a network mode needs it, so --mock runs without a key or a client. */
let Anthropic = null;
let client = null;
async function getClient() {
    if (!client) {
        ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
        client = new Anthropic({ maxRetries: 0 });   // callDirect's ladder is the only retry policy
    }
    return client;
}

// ── Selection ──────────────────────────────────────────────────────────────
/** Every (entry, run) still to do: no file, a file without output, or --force. */
function pendingRuns(entries) {
    const labels = RUNS.slice(0, runsWanted);
    const pending = [];
    let skipped = 0;
    for (const entry of entries) {
        for (const run of labels) {
            let existing = null;
            if (!force) {
                try { existing = readJson(runFile(entry.id, run)); } catch { existing = null; }
            }
            if (existing && existing.output) { skipped++; continue; }
            pending.push({ entry, run });
        }
    }
    return { pending, skipped };
}

// ── Source text for public-domain titles ───────────────────────────────────
/** Body text of a URL, or null when the response is a miss (non-200, or the SPA's text/html fallback). */
async function fetchText(url) {
    const res = await fetch(url);
    const type = res.headers.get('content-type') || '';
    if (!res.ok || type.includes('text/html')) return null;
    return res.text();
}

/** The stripped text for one public-domain title, cached at <work>/<id>/source.txt; null when none can be found. */
async function resolveSource(entry) {
    const file = path.join(paths.work, String(entry.id), 'source.txt');
    if (existsSync(file)) return readFileSync(file, 'utf8');
    if (mock) return null;
    const gid = entry.gutenberg_id;
    let text = null;
    let from = null;
    const local = path.join(paths.booksDir, `${gid}.txt`);
    if (existsSync(local)) {
        text = readFileSync(local, 'utf8');
        from = local;
    }
    if (text === null) {
        const url = `${SERVING_ORIGIN}/books/${gid}`;
        try { text = await fetchText(url); from = url; } catch (err) { console.log(`${entry.id}: ${url}: ${err.message}`); }
    }
    if (text === null) {
        const url = `https://www.gutenberg.org/ebooks/${gid}.txt.utf-8`;
        try {
            const raw = await fetchText(url);
            if (raw !== null) {
                text = stripGutenbergBoilerplate(raw);   // never store an unstripped Gutenberg file (LEGAL.md)
                from = `${url} (stripped)`;
            }
        } catch (err) { console.log(`${entry.id}: ${url}: ${err.message}`); }
    }
    if (text === null || !text.trim()) return null;
    writeAtomic(file, text);
    console.log(`${entry.id}: source ${text.length} chars from ${from} → ${file}`);
    return text;
}

// ── Run records ────────────────────────────────────────────────────────────
function usageOf(u) {
    return {
        input_tokens: u?.input_tokens ?? 0,
        output_tokens: u?.output_tokens ?? 0,
        cache_read_input_tokens: u?.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: u?.cache_creation_input_tokens ?? 0,
    };
}

function runRecord(job, runMode, fields) {
    return {
        v: 1,
        id: job.entry.id,
        run: job.run,
        model: fields.model ?? model,
        mode: runMode,
        requestedAt: fields.requestedAt,
        usage: usageOf(fields.usage),
        stop_reason: fields.stop_reason ?? null,
        output: fields.output ?? null,
        error: fields.error ?? null,
    };
}

/** What one API message means for the run: usage always, output or error. Shared by direct and batch collection. */
function interpret(message) {
    const usage = usageOf(message.usage);
    const stop_reason = message.stop_reason ?? null;
    const fail = (type, detail) => ({ usage, stop_reason, output: null, error: { type, message: detail } });
    if (stop_reason === 'refusal') return fail('refusal', `model refused: ${JSON.stringify(message.stop_details ?? null)}`);
    if (stop_reason === 'max_tokens') return fail('max_tokens', `output cut off at max_tokens ${MAX_TOKENS}`);
    if (stop_reason === 'model_context_window_exceeded') return fail('context-window', `output cut off: input plus output exceeded the model context window (stop_reason ${stop_reason})`);
    const block = (message.content ?? []).find((b) => b.type === 'text');
    if (!block) return fail('no-text', `response has no text block (stop_reason ${stop_reason})`);
    let output;
    try { output = JSON.parse(block.text); } catch (err) { return fail('parse', `JSON.parse: ${err.message}`); }
    if (!output || typeof output !== 'object' || typeof output.about !== 'string' || !Array.isArray(output.cards)) {
        return fail('shape', 'parsed JSON is not { about, cards }');
    }
    return { usage, stop_reason, output, error: null };
}

const requestParams = ({ system, user }, withModel) => ({
    model: withModel,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema: CARD_SCHEMA } },
});

// ── Direct mode ────────────────────────────────────────────────────────────
function isRetryable(err) {
    if (!Anthropic) return false;
    return err instanceof Anthropic.RateLimitError
        || err instanceof Anthropic.APIConnectionError
        || (err instanceof Anthropic.APIError && typeof err.status === 'number' && err.status >= 500);
}

async function callDirect(prompt) {
    const api = await getClient();
    for (let attempt = 0; ; attempt++) {
        try {
            return await api.beta.messages.create({
                ...requestParams(prompt, model),
                betas: [FALLBACK_BETA],
                fallbacks: 'default',
            });
        } catch (err) {
            if (!isRetryable(err) || attempt >= RETRY_DELAYS_MS.length) throw err;
            const delay = RETRY_DELAYS_MS[attempt];
            console.log(`  retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${delay / 1000}s: ${err.constructor.name}: ${err.message}`);
            await sleep(delay);
        }
    }
}

async function runDirect(job) {
    const requestedAt = new Date().toISOString();
    let fields;
    try {
        const message = await callDirect(buildPrompt(job.entry, { sourceText: job.sourceText }));
        if (message.model && message.model !== model) console.log(`${job.entry.id} run ${job.run}: served by ${message.model} (fallback)`);
        fields = { ...interpret(message), model: message.model ?? model };
    } catch (err) {
        fields = { error: { type: err?.constructor?.name || 'error', message: String(err?.message ?? err) } };
    }
    const record = runRecord(job, 'direct', { requestedAt, ...fields });
    writeJson(runFile(job.entry.id, job.run), record);
    return record;
}

/** Run worker over items with at most `limit` in flight. */
async function runPool(items, limit, worker) {
    let next = 0;
    const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) await worker(items[next++]);
    });
    await Promise.all(lanes);
}

// ── Batch mode ─────────────────────────────────────────────────────────────
/** Path overrides to echo into the --collect command so it reads the same ledger. */
const overrideFlags = () => process.argv
    .filter((a) => /^--(work|source|books-dir)=/.test(a))
    .map((a) => ` ${a}`).join('');

async function submitBatch(jobs) {
    const api = await getClient();
    const requests = jobs.map((job) => ({
        custom_id: customId(job.entry.id, job.run),
        params: requestParams(buildPrompt(job.entry, { sourceText: job.sourceText }), model),
    }));
    const created = await api.messages.batches.create({ requests });
    const ledger = {
        batchId: created.id,
        createdAt: new Date().toISOString(),
        model,
        requests: jobs.map((job) => ({ custom_id: customId(job.entry.id, job.run), id: job.entry.id, run: job.run })),
    };
    // The batch is accepted (and billed) from here on: print its id before anything that can throw.
    console.log(`batch ${created.id}: ${requests.length} request(s) submitted, status ${created.processing_status}`);
    console.log(`collect with: node scripts/summaries/generate.mjs --collect=${created.id}${overrideFlags()}`);
    try {
        writeJson(ledgerFile(created.id), ledger);
    } catch (err) {
        console.error(`batch ${created.id} is submitted but its ledger could not be written to ${ledgerFile(created.id)}: ${err.message}`);
        console.error(`save this as the ledger before collecting:\n${JSON.stringify(ledger)}`);
        throw err;
    }
    console.log(`ledger ${ledgerFile(created.id)}`);
    return ledger;
}

async function waitForBatch(batchId) {
    const api = await getClient();
    for (;;) {
        const b = await api.messages.batches.retrieve(batchId);
        const c = b.request_counts;
        console.log(`${new Date().toISOString()} batch ${batchId}: ${b.processing_status} (processing ${c.processing}, succeeded ${c.succeeded}, errored ${c.errored}, expired ${c.expired}, canceled ${c.canceled})`);
        if (b.processing_status === 'ended') return b;
        await sleep(POLL_MS);
    }
}

/** Write a run file per batch result, exactly as direct mode would. Returns { records, missing }. */
async function collectBatch(batchId, ledger = readJson(ledgerFile(batchId))) {
    if (!ledger) throw new Error(`no ledger for ${batchId} at ${ledgerFile(batchId)} (submitted with a different --work=?)`);
    const api = await getClient();
    const byCustomId = new Map(ledger.requests.map((r) => [r.custom_id, r]));
    const seen = new Set();
    const records = [];
    for await (const r of await api.messages.batches.results(batchId)) {
        const req = byCustomId.get(r.custom_id);
        if (!req) { console.error(`batch ${batchId}: result for unknown custom_id ${r.custom_id}, skipped`); continue; }
        seen.add(r.custom_id);
        const job = { entry: { id: req.id }, run: req.run };
        let fields;
        if (r.result.type === 'succeeded') {
            fields = interpret(r.result.message);
        } else if (r.result.type === 'errored') {
            const e = r.result.error?.error;
            fields = { error: { type: 'errored', message: e ? `${e.type}: ${e.message}` : JSON.stringify(r.result.error) } };
        } else {
            fields = { error: { type: r.result.type, message: `batch request ${r.result.type}` } };
        }
        const record = runRecord(job, 'batch', { requestedAt: ledger.createdAt, model: ledger.model, ...fields });
        writeJson(runFile(req.id, req.run), record);
        records.push(record);
    }
    const missing = ledger.requests.filter((req) => !seen.has(req.custom_id));
    for (const req of missing) console.error(`batch ${batchId}: no result for ${req.custom_id} (no run file written)`);
    return { records, missing: missing.length, model: ledger.model };
}

// ── Summary ────────────────────────────────────────────────────────────────
const clip = (s, n = 200) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** One line per run plus the cost line. Returns the number of failed runs. */
function summarize(records, { halfPrice, priceModel }) {
    let failed = 0;
    const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    for (const r of records) {
        const ok = Boolean(r.output) && !r.error;
        if (!ok) failed++;
        t.input += r.usage.input_tokens;
        t.output += r.usage.output_tokens;
        t.cacheRead += r.usage.cache_read_input_tokens;
        t.cacheWrite += r.usage.cache_creation_input_tokens;
        const status = ok ? 'ok' : `FAILED (${r.error?.type ?? 'unknown'}: ${clip(r.error?.message ?? '')})`;
        console.log(`${r.id} run ${r.run}: ${status} — ${r.usage.input_tokens} in, ${r.usage.output_tokens} out`);
    }
    const price = PRICE_PER_MTOK[priceModel];
    const factor = halfPrice ? 0.5 : 1;
    const cached = t.cacheRead || t.cacheWrite ? ` (plus ${t.cacheRead} cache-read, ${t.cacheWrite} cache-write tokens, not priced)` : '';
    if (price) {
        const cost = (t.input * price.input + t.output * price.output) / 1e6 * factor;
        console.log(`cost: $${cost.toFixed(2)} for ${t.input} input + ${t.output} output tokens at $${price.input * factor}/$${price.output * factor} per MTok${halfPrice ? ' (batch, half price)' : ''}${cached}`);
    } else {
        console.log(`cost: no price in PRICE_PER_MTOK for ${priceModel}; ${t.input} input + ${t.output} output tokens${cached}`);
    }
    const fallback = records.filter((r) => r.model && r.model !== priceModel).length;
    if (fallback) console.log(`${fallback} run(s) served by a fallback model (see each run file's model), priced at the ${priceModel} rate`);
    console.log(`${records.length} run(s), ${records.length - failed} ok, ${failed} failed`);
    return failed;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
    if (collect) {
        const ledger = readJson(ledgerFile(collect));   // before any polling: a wrong --work= fails at once, not after the batch ends
        if (!ledger) throw new Error(`no ledger for ${collect} at ${ledgerFile(collect)} (submitted with a different --work=?)`);
        if (wait) await waitForBatch(collect);
        const { records, missing, model: ledgerModel } = await collectBatch(collect, ledger);
        const failed = summarize(records, { halfPrice: true, priceModel: ledgerModel }) + missing;
        return failed ? 1 : 0;
    }

    const src = loadSource(paths.source);
    let entries;
    try { entries = selectEntries(src, process.argv); } catch (err) { console.error(err.message); return 1; }
    const { pending, skipped } = pendingRuns(entries);
    console.log(`${entries.length} title(s) × ${runsWanted} run(s): ${pending.length} pending, ${skipped} already done${force ? ' (--force)' : ''}; mode ${mode}, model ${model}`);

    const records = [];
    const jobs = [];
    const sources = new Map();
    for (const job of pending) {
        if (!isPublicDomain(job.entry)) { jobs.push({ ...job, sourceText: null }); continue; }
        if (!sources.has(job.entry.id)) sources.set(job.entry.id, await resolveSource(job.entry));
        const sourceText = sources.get(job.entry.id);
        if (sourceText === null && !mock) {
            const record = runRecord(job, mode, {
                requestedAt: new Date().toISOString(),
                error: { type: 'no-source', message: `no text for Gutenberg #${job.entry.gutenberg_id}: not in ${paths.booksDir}, not served at ${SERVING_ORIGIN}/books/, not on gutenberg.org` },
            });
            writeJson(runFile(job.entry.id, job.run), record);
            records.push(record);
            continue;
        }
        jobs.push({ ...job, sourceText });
    }

    if (mock) {
        for (const job of jobs) {
            const record = runRecord(job, 'mock', {
                requestedAt: new Date().toISOString(),
                stop_reason: 'end_turn',
                output: mockOutput(job.entry, job.run),
            });
            writeJson(runFile(job.entry.id, job.run), record);
            records.push(record);
        }
    } else if (batch) {
        if (!jobs.length) {
            console.log('nothing to submit');
        } else {
            const ledger = await submitBatch(jobs);
            if (wait) {
                await waitForBatch(ledger.batchId);
                const collected = await collectBatch(ledger.batchId);
                records.push(...collected.records);
                if (collected.missing) {
                    summarize(records, { halfPrice: true, priceModel: model });
                    return 1;
                }
            }
        }
    } else {
        let done = 0;
        await runPool(jobs, IN_FLIGHT, async (job) => {
            const record = await runDirect(job);
            done++;
            console.log(`[${done}/${jobs.length}] ${job.entry.id} run ${job.run}: ${record.error ? `failed (${record.error.type})` : `ok, ${record.output.cards.length} cards`}`);
            records.push(record);
        });
    }

    const failed = summarize(records, { halfPrice: batch, priceModel: model });
    return failed ? 1 : 0;
}

main().then(
    (code) => process.exit(code),
    (err) => { console.error(err?.stack ?? String(err)); process.exit(1); },
);
