// One-command deploy of the app to Cloudflare Pages. It bumps the version,
// rebuilds (baking the new version into the bundle), verifies the build carries
// the full data plane (books, covers, starts), then pushes dist/ to the Pages
// project. The public URL (https://<project>.pages.dev) never changes between
// deploys, so you share it once. Run `npx wrangler login` first (once).
//
//   node scripts/deploy-pages.mjs             deploy to production (main)
//   node scripts/deploy-pages.mjs --preview   deploy to a preview URL instead:
//                                             no version bump, lands on the
//                                             audit-preview.*.pages.dev alias,
//                                             production stays untouched. Use it
//                                             to test functions/ and header
//                                             changes against real R2 bindings.
//
// The content guard exists because public/books and public/covers are
// gitignored local artifacts: a deploy from a fresh clone would build fine and
// silently replace the live site every installed native app reads with one
// missing all book text and covers. Counts live in scripts/deploy-manifest.json.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const PROJECT = 'focus-reader'
const PREVIEW = process.argv.includes('--preview')
const versionFile = new URL('../version.json', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('./deploy-manifest.json', import.meta.url), 'utf8'))

// Bump 0.1.1 -> 0.1.2 -> ... -> 0.1.9 -> 0.2.0 -> ... , each part rolling over at 9.
function bump(v) {
  let [maj, min, pat] = v.split('.').map(Number)
  pat += 1
  if (pat > 9) { pat = 0; min += 1 }
  if (min > 9) { min = 0; maj += 1 }
  return `${maj}.${min}.${pat}`
}

const current = JSON.parse(readFileSync(versionFile, 'utf8')).version
const next = PREVIEW ? current : bump(current)
if (!PREVIEW) {
  writeFileSync(versionFile, JSON.stringify({ version: next }, null, 2) + '\n')
  console.log(`Version ${current} -> ${next}`)
} else {
  console.log(`Preview deploy at version ${current} (no bump)`)
}

// shell:true is required on Windows: Node won't spawn npm.cmd / npx.cmd directly.
const sh = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: true })

const revert = () => {
  if (!PREVIEW) writeFileSync(versionFile, JSON.stringify({ version: current }, null, 2) + '\n')
}

// Build with the bumped version baked in. If it fails, roll the version back so
// a broken build doesn't burn a number.
const build = sh('npm', ['run', 'build'])
if (build.status !== 0) {
  revert()
  console.error(`Build failed — version reverted to ${current}`)
  process.exit(build.status ?? 1)
}

// Content guard: refuse to push a build missing the data plane.
const countFiles = (dir, ext) => {
  try { return readdirSync(dir).filter((f) => f.endsWith(ext)).length } catch { return 0 }
}
const books = countFiles('dist/books', '.txt')
const covers = countFiles('dist/covers', '.webp')
const missing = (manifest.mustExist ?? []).filter((f) => !existsSync(`dist/${f}`))
if (books < manifest.minBooks || covers < manifest.minCovers || missing.length) {
  revert()
  console.error('DEPLOY REFUSED — the build is missing live content:')
  console.error(`  dist/books:  ${books} .txt files (need >= ${manifest.minBooks})`)
  console.error(`  dist/covers: ${covers} .webp files (need >= ${manifest.minCovers})`)
  if (missing.length) console.error(`  missing: ${missing.join(', ')}`)
  console.error('Run `npm run mirror:books` / `npm run mirror:covers` on this machine first,')
  console.error('or deploy from the machine that has public/books and public/covers.')
  process.exit(1)
}
console.log(`Content guard OK: ${books} books, ${covers} covers, ${(manifest.mustExist ?? []).join(', ')} present`)

// --branch=main targets the production branch so it lands on the main
// *.pages.dev URL regardless of the local git branch name. Any other branch
// name gets its own preview alias and leaves production alone.
const branch = PREVIEW ? 'audit-preview' : 'main'
const r = sh('npx', ['--yes', 'wrangler@latest', 'pages', 'deploy', 'dist', `--project-name=${PROJECT}`, `--branch=${branch}`, '--commit-dirty=true'])
if (r.error) console.error(r.error)
process.exit(r.status ?? 1)
