# Reading progress persistence and session accounting

**Done.** Implemented and committed as `295bbb7` on `feat/native-ui-web-parity`, 2026-07-13, independent review passed with no unresolved findings. This package brought the native Android app's progress saving and reading session bookkeeping into exact parity with the web app.

## What this fixed

Before this pack, the native reader diverged from the web on five points that touched what shows up in the Library, in Recents, on the Today resume hero, and in the cumulative reading stats. Saved books resumed partway through instead of restarting at the story, an index of 0 was mishandled both when opening and when saving, books with no detected front matter never entered the Reading list, the Android system back gesture silently dropped the reading session that was in flight, and empty playback spans quietly inflated total time read. Each of these now behaves the way the web app behaves.

For reference, both platforms share `PROGRESS_SAVE_INTERVAL_MS = 2000` (web `src/App.tsx:29`, native `src/screens/ReaderScreen.tsx:37`). Files changed in this pack: `src/screens/ReaderScreen.tsx`, `src/reader/useReelEngine.ts`, `app.json`.

## What changed

**1. Saved for later rows now open at the first readable word, not the stored resume point.**

Before, an absent `startIndex` fell through to `?? saved?.currentIndex`, so a saved book that had been read once resumed partway through (or at the end, if finished). The web opens such rows with no `startIndex` at all (`onOpen(book, coverRect)` from `BookRow`), and `App.completePendingOpen` applies the rule at web `src/App.tsx:203-207`: use `pending.startIndex` only when it is truthy and `> 0`, otherwise fall back to `pendingParsed.readableStartWord`. The `?? saved?.currentIndex` fallback was removed from `initialIndex` and from the `lastIndex` ref init in native `ReaderScreen`, and the now-unused `saved` selector was dropped entirely. An absent `startIndex` now always means "open at `readableStartWord`." Library rows pass no `startIndex` and restart at the story, while the Today hero (`progress.currentIndex`), vibe cards, search cards, and recent rows (`progressById[book.id]?.currentIndex`) still pass explicit progress and resume, exactly like the web.

**2. A `startIndex` of 0 now falls through to `readableStartWord`, and index 0 is saveable.**

Before, `startIndex ?? saved?.currentIndex ?? readableStartWord` honored an explicit 0, so a 0-index progress entry opened at token 0, inside the Gutenberg front matter. The opening position is now `startIndex && startIndex > 0 ? startIndex : parsed.readableStartWord`, mirroring the web's `pending.startIndex && pending.startIndex > 0` truthiness rule, so a stored index of 0 never opens inside the front matter. The saveability half of this issue is delivered by the issue 3 change below.

**3. Progress now saves whenever the index changed since the last save, including index 0.**

Before, `saveNow` guarded `if (lastIndex.current > 0 && tokenCount > 0)`, so a fresh book whose parse yields `readableStartWord === 0`, opened and backed out of, wrote nothing and never entered `progressById`, Reading, Recents, or the resume hero, unlike the web where merely opening a book records it at 0%. Scrubbing back to word 0 and exiting also kept the stale higher position. The `lastIndex.current > 0` guard was replaced with the web rule: a `lastSavedIndexRef` seeded to sentinel `-1` (matching web `src/App.tsx:256`), a save fires when `lastIndex.current !== lastSavedIndexRef.current` (plus `tokenCount > 0`), `lastSavedIndex` is updated only on a real save, and the throttle timestamp is bumped only on a real save, gated by `(!isPlaying || sinceSave >= PROGRESS_SAVE_INTERVAL_MS)` at 2000ms. This was applied in both the throttled effect and the AppState/unmount path (web `src/App.tsx:257-277` and `281-294`). The old `> 0` guard existed to avoid clobbering a real resume point with 0 before the engine hydrates; that safety was kept a different way. `lastIndex` is now seeded from the same hydrated `initialIndex` expression, and the engine's hydration effect (`useReelEngine.ts:140-149`, with `onIndexChange` at line 151) runs before `ReaderScreen`'s save effects in the same commit, so a save can never fire before the position lands on the opening word.

**4. Android system back while playing now records the in-flight session.**

Before, header back and the menu button called `engine.pause()` first (so the session recorded), but the Android hardware or gesture back popped the screen directly and the unmount cleanup only called `sub.remove()` and `saveNow()` for progress. Nothing called `pause()` or `endSpan()`, so the pending play span was discarded and stats lost that session's words and time. The web routes every exit through `handleBack`, which calls `rsvp.pause()`, and the `isPlaying` effect then fires `addSession(words, ms)` (web `src/App.tsx:228-231` and `296-314`). Two layers now cover the native path: a navigation `beforeRemove` listener calls `engine.pause()` the moment the pop starts, so the span ends at exit time rather than after the pop animation, and the unmount cleanup calls `engineRef.current.pause()` before `saveNow()` as a safety net for any other unmount. `pause()` is a no-op when not playing (`useReelEngine.ts:321-326` early-returns on `!playing`), so header back and menu exits are unaffected and the pause runs before the progress save so both the session and the final position land.

**5. Zero-word or zero-length spans no longer reach the stats store.**

Before, `useReelEngine.endSpan` called `onSession(Math.max(0, i - span.i), Date.now() - span.t)` unconditionally, and the store's `addSession` clamped negatives but happily added `words = 0` with positive ms. Tapping play then pause in place, or play followed immediately by a scrub (the scrub `onBegin` ends the span before any words advance), accumulated `msRead` with 0 words, permanently drifting the Stats page time up and the derived `avgWpm = wordsRead / minutes` down. `endSpan` now computes `words` and `ms` and only calls `onSession` when both are `> 0`, matching the web's `if (ms > 0 && words > 0)` at web `src/App.tsx:309`. Placing the guard inside `endSpan` covers every pause path at once: `togglePlay`, `pause`, the end-of-book stop, the scrub touch-down, AppState backgrounding, and the new exit paths.

## Judgment calls

- The state note expected an uncommitted `app.json` bump from 0.7.2 to 0.7.3, but the tree was clean at 0.7.7 with all prior sessions committed. Per the standing rule to bump every change round, `expo.version` was set to 0.7.8.
- For issue 4, both suggested mechanisms were implemented rather than one: `beforeRemove` ends the span at the instant the pop starts for a more accurate span length, and a `pause()` in the effect cleanup before `saveNow()` covers non-navigation unmounts. Both are safe because `pause()` no-ops when idle.
- The zero-span guard lives inside `endSpan`, the prompt's preferred spot, so every pause route is covered by one check.
- Cold mounts (deep link or state restore) can briefly persist the pre-hydration index for one commit before the corrected index is written in the same synchronous flush. The web has the identical one-commit transient (its persist effect runs before `rsvp.seek`'s state commits), so the web behavior was matched rather than adding extra gating.
- The `tokenCount > 0` guard was kept inside `saveNow`, mirroring the web's `total === 0` early return.

## Check on your phone

- [ ] Confirm: a Saved for later book you have already read partway opens from the beginning of the actual story, not where you left off.
- [ ] Confirm: a book whose stored position is at the very start opens at the first readable word, never inside the Gutenberg front matter.
- [ ] Confirm: opening a brand new book and backing out right away makes it appear under Reading in the Library at 0 percent, and on the Today resume hero.
- [ ] Confirm: scrubbing back to the very start of a book and then exiting keeps the position at the start, not at the further-along spot you left earlier.
- [ ] Confirm: leaving the reader with the phone's own back gesture while a book is playing counts that stretch, so the time and words on the Stats page grow.
- [ ] Confirm: tapping play then pause a few times without reading adds nothing to total time read, and the average WPM on Today and the Stats page does not drift down.

Everything else in this package was verified in code and by review, including the type check (`npx tsc --noEmit` clean at commit time) and an independent adversarial review that re-checked every acceptance item against the native code and the cited web sources with zero fix rounds.
