/**
 * Split a planned chunk (deep-queue.mjs's JSON) into N groups of about equal
 * reading, one per workflow run: a workflow runs only a few agents at a time,
 * so a chunk goes out as several runs side by side.
 *
 *   node scripts/deep-starts/deep-queue.mjs --count 50 | node scripts/deep-starts/split-chunk.mjs 8
 *
 * Prints one group per line as "id:segments,..." (the `books` arg of each
 * wf-listed-deep run; `r` marks a reference work).
 */
const n = Number(process.argv[2] ?? 8);
let input = '';
process.stdin.on('data', (d) => { input += d; }).on('end', () => {
    const books = JSON.parse(input).slice().sort((a, b) => b.segments - a.segments);
    const groups = Array.from({ length: n }, () => ({ load: 0, books: [] }));
    for (const b of books) {
        const g = groups.reduce((min, x) => (x.load < min.load ? x : min));
        g.books.push(b);
        g.load += b.segments + 1;
    }
    // One group a line, in the workflow's compact form: "id:segments,...", `r` for a reference work.
    for (const g of groups) if (g.books.length) console.log(g.books.map((b) => `${b.id}:${b.reference ? 'r' : b.segments}`).join(','));
});
