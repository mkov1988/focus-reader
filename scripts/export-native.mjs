/**
 * The LAST HOP of every data pipeline: writes the four data files the Android
 * app bundles (src/data/) from this repo's build outputs, applying the native
 * schema in the process. This replaces the old hand-copy step that let the
 * copies drift (the vibes schema rename was applied by hand once and the
 * regeneration path forgot it — never again).
 *
 *   npm run export:native        after ANY of build:vibes, build:scenes,
 *                                build:starts, or a curated refresh
 *
 * Native schema transform (per book object, everywhere books appear):
 *   downloadCount -> downloads, coverUrl dropped (native resolves covers by
 *   id from the mirror; see Android src/services/library.ts coverUrl()).
 *
 * Also writes src/data/_provenance.json in the Android repo: which script
 * generated each file, from what source, when, with counts and hashes. The
 * app never imports it (Metro bundles only imported files); it exists so
 * drift is diagnosable at a glance. Never hand edit any of these files.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NATIVE_DATA = path.join(ROOT, '..', 'Focus Reader Android', 'src', 'data');
if (!existsSync(NATIVE_DATA)) {
    console.error(`Android repo not found at ${NATIVE_DATA}`);
    process.exit(1);
}

const md5 = (s) => createHash('md5').update(s).digest('hex');

/** Web book object -> native book object (order: downloads before textUrl). */
function toNativeBook(b) {
    const { coverUrl, downloadCount, textUrl, words, ...rest } = b;
    return {
        ...rest,
        ...(downloadCount !== undefined ? { downloads: downloadCount } : {}),
        ...(textUrl !== undefined ? { textUrl } : {}),
        ...(words !== undefined ? { words } : {}),
    };
}

const provenance = { generatedBy: 'Focus Reader (web repo) scripts/export-native.mjs', generatedAt: new Date().toISOString(), files: {} };
let changed = 0;

function emit(name, content, source, count) {
    const dest = path.join(NATIVE_DATA, name);
    const before = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
    const isSame = before === content;
    if (!isSame) {
        writeFileSync(dest, content);
        changed++;
    }
    provenance.files[name] = { source, count, md5: md5(content) };
    console.log(`${isSame ? 'same   ' : 'WROTE  '} ${name}  (${count} entries, ${(content.length / 1024).toFixed(0)} KB)`);
}

// catalog.json <- curated.json (native schema)
const curated = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'curated.json'), 'utf8'));
emit('catalog.json', JSON.stringify(curated.map(toNativeBook)), 'src/data/curated.json', curated.length);

// vibes.json <- vibes.json (native schema on hero AND shelf books)
const vibes = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'vibes.json'), 'utf8'));
const nativeVibes = vibes.map((v) => ({
    ...v,
    hero: (v.hero ?? []).map(toNativeBook),
    shelves: (v.shelves ?? []).map((s) => ({ ...s, books: s.books.map(toNativeBook) })),
}));
emit('vibes.json', JSON.stringify(nativeVibes), 'src/data/vibes.json (build:vibes)', vibes.length);

// scenes.json and story-starts.json <- verbatim copies
const scenes = readFileSync(path.join(ROOT, 'src', 'data', 'scenes.json'), 'utf8');
emit('scenes.json', scenes, 'src/data/scenes.json (build:scenes)', Object.keys(JSON.parse(scenes)).length);
const starts = readFileSync(path.join(ROOT, 'src', 'data', 'story-starts.json'), 'utf8');
emit('story-starts.json', starts, 'src/data/story-starts.json (build:starts)', Object.keys(JSON.parse(starts)).length);

writeFileSync(path.join(NATIVE_DATA, '_provenance.json'), JSON.stringify(provenance, null, 2) + '\n');

if (changed) {
    console.log(`\n${changed} file(s) changed in the Android repo. Remember: bump expo.version and commit there.`);
    const scenesKB = Buffer.byteLength(scenes) / 1024;
    if (scenesKB > 2048) console.warn(`WARNING: scenes.json is ${(scenesKB / 1024).toFixed(1)} MB of eagerly parsed bundle data — time to move overflow scenes to a fetched starts-v1-style file (audit D21).`);
} else {
    console.log('\nNative data already up to date.');
}
