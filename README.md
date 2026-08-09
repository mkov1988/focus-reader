# Focus Reader (infrastructure repo)

**The web app is retired as a product (July 2026). The product is the native
Android app at `../Focus Reader Android`.** Do not build web features here.
All UI and feature work happens in the Android repo; this repo has exactly
three jobs:

1. **Serving infrastructure.** The Cloudflare Pages site
   (focus-reader-48z.pages.dev) is the data plane every installed app reads:
   curated book text and covers as static assets, the 55,863 book long tail
   from R2 behind one Pages Function, and starts-v1.json. See
   [docs/SERVING.md](docs/SERVING.md). Deploys are production pushes for
   shipped apps; the deploy script has a content guard for that reason.
2. **Data pipelines.** Everything under `scripts/` that mirrors books and
   covers, crawls the catalog, and builds vibes, scenes, story starts, and
   the deep pass stores. Map and run order: [scripts/README.md](scripts/README.md).
   The last hop into the Android app is `npm run export:native`.
3. **Archived spec.** The web app's code and docs are the reference the
   native port was built from. [docs/reader-feel-playbook.md](docs/reader-feel-playbook.md)
   and [docs/native-parity/00-INDEX.md](docs/native-parity/00-INDEX.md) are
   the live spec documents; most of the rest of docs/ is history (see
   [docs/INDEX.md](docs/INDEX.md)).

Legal position for charging money: [LEGAL.md](LEGAL.md). Backups and
restore: [docs/BACKUP.md](docs/BACKUP.md).

## Map (what each top level item is)

| Item | Role |
|---|---|
| `functions/`, `wrangler.toml`, `public/_headers` | infra, live serving |
| `scripts/`, `version.json` | pipelines + deploy tooling |
| `public/` | build input: books, covers, starts (books/covers are local artifacts, gitignored) |
| `mirror/` | pipeline output staged for R2 (gitignored, ~19 GB, backed up per docs/BACKUP.md) |
| `src/`, `index.html`, `vite.config.ts`, `tailwind.config.js` | **frozen web app, but deploy load bearing** |
| `docs/`, `data-src/`, `CHANGELOG.md`, `DEEP-PASS-CHECKLIST.md` | spec, sources, history |

**The `src/` trap:** the web app is frozen, but the deployed Pages site is
built from it, and `src/data/` feeds the export to the Android app. Deploy
plumbing and data fixes there are legitimate; feature work is not. If a
change in `src/` is not about serving or data, it does not belong here.

## Working here

- `node scripts/deploy-pages.mjs` deploys (add `--preview` to test off
  production). `npm run build` must stay green; it typechecks the frozen app.
- The Gutenberg boilerplate strip is legally load bearing; read
  [LEGAL.md](LEGAL.md) before touching anything named strip, mirror, or books.
- Old web era agent instructions (RULES.md, .cursorrules, .agents personas)
  are archived under `docs/archive/` and are not in force.
