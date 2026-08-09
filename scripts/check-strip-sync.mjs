/**
 * Guard for the legally load bearing Gutenberg strip. Verifies that every copy
 * of stripGutenbergBoilerplate behaves identically to the canonical module:
 *
 *   canonical  scripts/lib/strip-gutenberg.mjs   (both mirror scripts import it)
 *   runtime    src/services/library.ts           (retired web app, still deployed)
 *   runtime    ../Focus Reader Android/src/services/gutenberg.ts (tier 3 on device)
 *
 * The TS copies are extracted from source, de-annotated, and executed over a
 * fixture battery; any output difference or surviving trademark reference
 * fails the script. Run after touching ANY copy:  node scripts/check-strip-sync.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripGutenbergBoilerplate as canonical } from './lib/strip-gutenberg.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COPIES = [
    { name: 'web src/services/library.ts', file: path.join(ROOT, 'src', 'services', 'library.ts') },
    { name: 'android src/services/gutenberg.ts', file: path.join(ROOT, '..', 'Focus Reader Android', 'src', 'services', 'gutenberg.ts') },
];

/** Pull the function body out of a TS file and make it plain JS. */
function extractFn(file) {
    const src = readFileSync(file, 'utf8');
    const startIdx = src.indexOf('export function stripGutenbergBoilerplate');
    if (startIdx === -1) throw new Error(`no stripGutenbergBoilerplate in ${file}`);
    // The function ends at the first closing brace in column 0 after its start.
    const endIdx = src.indexOf('\n}', startIdx);
    if (endIdx === -1) throw new Error(`could not find end of function in ${file}`);
    let fn = src.slice(startIdx, endIdx + 2);
    fn = fn
        .replace('export function', 'function')
        .replace(/\(raw: string\): string/, '(raw)')
        .replace(/\(l: string\)/, '(l)');
    return new Function(`${fn}\nreturn stripGutenbergBoilerplate;`)();
}

const BODY = 'It was the best of times.\nA line about a Gutenberg press, the machine itself.\nThe end of the tale.';
const FIXTURES = [
    // Modern markers, credit block, same-line trademark, wrapped trademark.
    `The Title\n*** START OF THE PROJECT GUTENBERG EBOOK THE TITLE ***\nProduced by volunteers\nhttps://example.org/etext\n\n${BODY}\nThis file comes from Project Gutenberg and its mirrors.\nDonated by readers of Project\nGutenberg, with thanks.\n*** END OF THE PROJECT GUTENBERG EBOOK THE TITLE ***\nLicense text.`,
    // Old format: small print header, "End of" footer, wrapped phrase mid-body.
    `*END THE SMALL PRINT! FOR PUBLIC DOMAIN ETEXTS*\n\n${BODY}\nCourtesy of the Project\nGutenberg archive.\n\nEnd of Project Gutenberg's The Title.`,
    // Windows line endings and a wrapped phrase across a blank line.
    `*** START OF THIS PROJECT GUTENBERG EBOOK X ***\r\n\r\n${BODY}\r\nSee Project\r\n\r\nGutenberg for more.\r\n*** END OF THIS PROJECT GUTENBERG EBOOK X ***`,
    // No markers at all (tier 3 sometimes sees these).
    `${BODY}\nProject Gutenberg is not mentioned again.`,
];

let failed = false;
const expected = FIXTURES.map((f) => canonical(f));

// The canonical copy itself must leave no trademark reference behind.
expected.forEach((out, i) => {
    if (/project\s+gutenberg/i.test(out)) {
        console.error(`FAIL canonical leaves a trademark reference on fixture ${i + 1}`);
        failed = true;
    }
});

for (const copy of COPIES) {
    let fn;
    try {
        fn = extractFn(copy.file);
    } catch (err) {
        console.error(`FAIL ${copy.name}: ${err.message}`);
        failed = true;
        continue;
    }
    FIXTURES.forEach((fixture, i) => {
        const got = fn(fixture);
        if (got !== expected[i]) {
            console.error(`FAIL ${copy.name} diverges from canonical on fixture ${i + 1}`);
            failed = true;
        }
    });
    if (!failed) console.log(`ok   ${copy.name} matches canonical on ${FIXTURES.length} fixtures`);
}

if (failed) {
    console.error('\nThe strip copies disagree. Fix them to match scripts/lib/strip-gutenberg.mjs.');
    process.exit(1);
}
console.log('ok   all strip copies agree; no trademark reference survives any fixture');
