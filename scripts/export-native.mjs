/**
 * The LAST HOP of every data pipeline: writes the data files the Android app
 * bundles (src/data/) from this repo's build outputs, applying the native
 * schema in the process. This replaces the old hand-copy step that let the
 * copies drift (the vibes schema rename was applied by hand once and the
 * regeneration path forgot it — never again).
 *
 *   npm run export:native        after ANY of build:vibes, build:scenes,
 *                                build:starts, a curated refresh, or an edit
 *                                to src/data/rush-covers.json
 *
 * Native schema transform (per book object, everywhere books appear):
 *   downloadCount -> downloads, coverUrl dropped (native resolves covers by
 *   id from the mirror; see Android src/services/library.ts coverUrl()).
 *
 * Also copies the paywall rush's covers (src/data/rush-covers.json) into the
 * Android app as bundled assets and writes the require() list for them.
 *
 * Also writes src/data/_provenance.json in the Android repo: which script
 * generated each file, from what source, when, with counts and hashes. The
 * app never imports it (Metro bundles only imported files); it exists so
 * drift is diagnosable at a glance. Never hand edit any of these files.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NATIVE_ROOT = path.join(ROOT, '..', 'Focus Reader Android');
const NATIVE_DATA = path.join(NATIVE_ROOT, 'src', 'data');
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

// The paywall rush's bundled covers <- rush-covers.json + public/covers/.
// The webp files go to Android assets/covers/ (Metro assets, so they ride the
// over-the-air update like the narration files do), and src/data/rushCovers.ts
// gets a require() per cover: Metro cannot require a computed path, so the
// list is generated, like bundledBooks.ts. Covers dropped from the list are
// deleted from assets/covers/. Titles and authors ride along from curated.json
// for the generated fallback cover and the accessibility label.
{
    const rush = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'rush-covers.json'), 'utf8'));
    const byId = new Map(curated.map((b) => [String(b.id), b]));
    const ids = [...rush.slam, ...rush.pool];
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) {
        console.error(`rush-covers.json repeats ${dup.join(', ')}`);
        process.exit(1);
    }
    const assetDir = path.join(NATIVE_ROOT, 'assets', 'covers');
    mkdirSync(assetDir, { recursive: true });
    let bytes = 0;
    for (const id of ids) {
        const src = path.join(ROOT, 'public', 'covers', `${id}.webp`);
        if (!existsSync(src)) {
            console.error(`rush cover ${id} has no file at public/covers/`);
            process.exit(1);
        }
        if (!byId.has(id)) {
            console.error(`rush cover ${id} is not in curated.json`);
            process.exit(1);
        }
        const dest = path.join(assetDir, `${id}.webp`);
        const same = existsSync(dest) && readFileSync(dest).equals(readFileSync(src));
        if (!same) {
            copyFileSync(src, dest);
            changed++;
        }
        bytes += statSync(src).size;
    }
    for (const f of readdirSync(assetDir)) {
        if (f.endsWith('.webp') && !ids.includes(f.slice(0, -5))) {
            unlinkSync(path.join(assetDir, f));
            changed++;
        }
    }
    const quote = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    const row = (id) => {
        const b = byId.get(id);
        return `    { id: '${id}', title: ${quote(b.title)}, author: ${quote(b.author)}, source: require('../../assets/covers/${id}.webp') as number },`;
    };
    const ts = [
        '/**',
        " * GENERATED by the web repo's scripts/export-native.mjs from src/data/rush-covers.json.",
        " * Never hand edit. The paywall rush's bundled covers (plans/build-paywall.md):",
        ' * RUSH_SLAM is the sixteen the blur stops on, in order; RUSH_POOL is the rest',
        ' * of the stream. Every file is in assets/covers/ and ships inside the bundle.',
        ' * No cover here has "Project Gutenberg" printed on it (checked by eye over',
        " * the list, 28 October 2026); the web repo's LEGAL.md rule extends to this art.",
        ' */',
        '',
        'export interface RushCover {',
        '    id: string;',
        '    title: string;',
        '    author: string;',
        '    /** Metro asset id (require()). */',
        '    source: number;',
        '}',
        '',
        '/* eslint-disable @typescript-eslint/no-require-imports */',
        'export const RUSH_SLAM: RushCover[] = [',
        ...rush.slam.map(row),
        '];',
        '',
        'export const RUSH_POOL: RushCover[] = [',
        ...rush.pool.map(row),
        '];',
        '',
    ].join('\n');
    emit('rushCovers.ts', ts, 'src/data/rush-covers.json + public/covers/', ids.length);
    console.log(`        rush covers: ${rush.slam.length} slam + ${rush.pool.length} pool, ${(bytes / 1024).toFixed(0)} KB in assets/covers/`);
}

writeFileSync(path.join(NATIVE_DATA, '_provenance.json'), JSON.stringify(provenance, null, 2) + '\n');

if (changed) {
    console.log(`\n${changed} file(s) changed in the Android repo. Remember: bump APP_VERSION in src/version.ts and commit there.`);
    const scenesKB = Buffer.byteLength(scenes) / 1024;
    if (scenesKB > 2048) console.warn(`WARNING: scenes.json is ${(scenesKB / 1024).toFixed(1)} MB of eagerly parsed bundle data — time to move overflow scenes to a fetched starts-v1-style file (audit D21).`);
} else {
    console.log('\nNative data already up to date.');
}
