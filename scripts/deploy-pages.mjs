// One-command deploy of the app to Cloudflare Pages. It bumps the version,
// rebuilds (baking the new version into the bundle), then pushes dist/ to the
// Pages project. The public URL (https://<project>.pages.dev) never changes
// between deploys, so you share it once. Run `npx wrangler login` first (once).
//
//   node scripts/deploy-pages.mjs
//
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const PROJECT = 'focus-reader'
const versionFile = new URL('../version.json', import.meta.url)

// Bump 0.1.1 -> 0.1.2 -> ... -> 0.1.9 -> 0.2.0 -> ... , each part rolling over at 9.
function bump(v) {
  let [maj, min, pat] = v.split('.').map(Number)
  pat += 1
  if (pat > 9) { pat = 0; min += 1 }
  if (min > 9) { min = 0; maj += 1 }
  return `${maj}.${min}.${pat}`
}

const current = JSON.parse(readFileSync(versionFile, 'utf8')).version
const next = bump(current)
writeFileSync(versionFile, JSON.stringify({ version: next }, null, 2) + '\n')
console.log(`Version ${current} -> ${next}`)

// shell:true is required on Windows: Node won't spawn npm.cmd / npx.cmd directly.
const sh = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: true })

// Build with the bumped version baked in. If it fails, roll the version back so
// a broken build doesn't burn a number.
const build = sh('npm', ['run', 'build'])
if (build.status !== 0) {
  writeFileSync(versionFile, JSON.stringify({ version: current }, null, 2) + '\n')
  console.error(`Build failed — version reverted to ${current}`)
  process.exit(build.status ?? 1)
}

// --branch=main targets the production branch so it lands on the main
// *.pages.dev URL regardless of the local git branch name.
const r = sh('npx', ['--yes', 'wrangler@latest', 'pages', 'deploy', 'dist', `--project-name=${PROJECT}`, '--branch=main', '--commit-dirty=true'])
if (r.error) console.error(r.error)
process.exit(r.status ?? 1)
