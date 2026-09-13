# patches/ — a hand-off, not a home

A change that belongs in the Android repo (`../Focus Reader Android`) but was
made from a session that could only read that repo. Apply it there, then
delete the patch here; nothing in this directory is meant to live long.

```
cd "../Focus Reader Android"
git am "../Focus Reader/patches/0001-android-narration-stutter-fix.patch"
npm run typecheck && npm test
```

`git am` keeps the commit message, which carries the diagnosis and the
on-phone checks. If the Android tree has moved and `git am` refuses, use
`git am -3` (three-way) and resolve; the change touches only
`src/reader/useNarration.ts`, `src/reader/useReelEngine.ts`,
`src/services/narration.ts`, `src/version.ts`, `package.json`, and adds
`src/reader/narrationSync.ts` + `scripts/test-narration-sync.mjs`.
