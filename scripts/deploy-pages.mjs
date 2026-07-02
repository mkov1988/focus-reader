// One-command (re)deploy of the built app to Cloudflare Pages.
//
//   npm run build            # produce dist/
//   node scripts/deploy-pages.mjs
//
// Copies the password gate into dist/ as _worker.js, then pushes dist/ to the
// Pages project. The public URL (https://<project>.pages.dev) never changes
// between deploys, so you share it once. Run `npx wrangler login` first (once).
import { copyFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const PROJECT = 'focus-reader'

await copyFile('scripts/pages-worker.js', 'dist/_worker.js')
console.log('Copied password gate -> dist/_worker.js')

// shell:true is required on Windows: Node refuses to spawn .cmd files (npx.cmd)
// directly. --branch=main targets the project's production branch so the deploy
// shows at the main *.pages.dev URL regardless of the local git branch name.
const r = spawnSync(
  'npx',
  ['--yes', 'wrangler@latest', 'pages', 'deploy', 'dist', `--project-name=${PROJECT}`, '--branch=main', '--commit-dirty=true'],
  { stdio: 'inherit', shell: true },
)
if (r.error) console.error(r.error)
process.exit(r.status ?? 1)
