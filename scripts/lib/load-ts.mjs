/**
 * Loads the app's real TypeScript modules into a node pipeline script.
 *
 * The narration pipeline (and anything else that anchors data to token
 * indexes) must tokenize with the EXACT code the reader runs — a replicated
 * tokenizer drifts, and every anchor in the product is a token index. This is
 * the same transpile-on-demand technique the Android repo's
 * scripts/test-tokenize.mjs uses to pin the tokenizer contract.
 *
 * Usage:
 *   import { loadTextProcessing } from './lib/load-ts.mjs';
 *   const tp = loadTextProcessing();          // the real src/utils/textProcessing.ts
 *   const parsed = tp.parseText(text);
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadTsModule(rel, injectedModules = {}) {
    const src = readFileSync(path.join(ROOT, rel), 'utf8');
    let js = ts.transpileModule(src, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    // The web app is built by Vite, so its modules may guard dev-only logging
    // with `import.meta.env.DEV`. That survives transpilation and is illegal
    // inside this CommonJS wrapper — shim it to a plain object (DEV false: a
    // pipeline run is never the dev server).
    js = js.replace(/import\.meta/g, '__importMeta');
    const module = { exports: {} };
    const localRequire = (name) => {
        if (injectedModules[name]) return injectedModules[name];
        return require(name);
    };
    new Function('require', 'module', 'exports', '__importMeta', js)(localRequire, module, module.exports, { env: { DEV: false } });
    return module.exports;
}

export function loadTextProcessing() {
    const chapterDetection = loadTsModule('src/utils/chapterDetection.ts');
    return loadTsModule('src/utils/textProcessing.ts', { './chapterDetection': chapterDetection });
}
