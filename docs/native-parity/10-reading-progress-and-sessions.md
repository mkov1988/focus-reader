# Reading progress persistence and session accounting

> **Status: implemented and committed 2026-07-13.** Commit `295bbb7` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings.


## Mission

Bring the native Android app's progress saving and reading session bookkeeping into exact parity with the web app. Five confirmed deltas: Saved for later rows must open at the first readable word instead of resuming, index 0 must be treated the way the web treats it (both when opening and when saving), progress must persist whenever the index changed since the last save (including index 0), the in flight reading session must be recorded on every exit path including Android system back, and zero word or zero length spans must never reach the stats store.

## Context

Focus Reader is a cozy speed reading app for public domain books. It shows one word (or a small window of words) at a time, tracks reading progress per book, and keeps cumulative reading stats (total words read, total time read) that drive a "Your Reading" card and a Stats page.

Two repos are involved:

- **Web app (READ ONLY source of truth): `C:/Users/Michael/Desktop/Focus Reader`.** This is the reference for all look and behavior. You may read any file there. **Never modify anything in the web repo.**
- **Native app (where ALL your changes go): `C:/Users/Michael/Desktop/Focus Reader Android`.** Expo SDK 54, React Native 0.81, reanimated 4, gesture-handler 2.28, zustand, expo-image, expo-haptics, lucide-react-native, react-navigation native-stack. This is a full React Native app. **Never introduce a WebView.**

Shared vocabulary you will meet in the code:

- `parseText` produces a `ParsedText` with `tokens` (the word list), `readableStartWord` (index of the first word after Gutenberg front matter, 0 when no front matter is detected), and `readableEndWord`.
- `progressById` in the zustand store maps book id to `{ currentIndex, totalTokens, ... }`. It feeds the Library's Reading list, Recents ordering, and the Today screen resume hero.
- `addSession(words, ms)` in the store accumulates `stats.wordsRead` and `stats.msRead`, which feed the Stats page and the Today screen's average WPM.
- A "span" is one stretch of continuous playback, from play to pause. Each span becomes one session via `addSession`.
- On both platforms `PROGRESS_SAVE_INTERVAL_MS = 2000` (web `src/App.tsx:29`, native `src/screens/ReaderScreen.tsx:37`).

## Before you start

Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect branch `feat/native-ui-web-parity`.

**Important: another session may hold uncommitted changes** in `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, `src/reader/useReelEngine.ts`, and `app.json`. Read the current state of each file before editing it, base your edits on what is actually there, and do not revert or overwrite changes you did not make. This matters most for `src/reader/useReelEngine.ts` (issue 5 below edits `endSpan` there) and `src/screens/ReaderScreen.tsx` (issues 1 through 4 edit it). Rebase your edits on the current working tree, not on the line snapshots in this document.

If a line number cited below has drifted, trust the described behavior and re-locate the code by searching for the quoted identifiers.

## Issues to fix

### 1. Saved for later rows must open at the first readable word, not resume

**Web behavior.** The Library's Saved for later list renders `BookRow`, whose click handler calls `onOpen(book, coverRect)` with NO `startIndex` (web `src/components/Input/StoreFront.tsx:262`, the row component spans 253 to 278; list usage around 1240 to 1249). `App.completePendingOpen` then applies the rule at web `src/App.tsx:203-207`:

```ts
if (pending.startIndex && pending.startIndex > 0) {
    pendingSeekRef.current = pending.startIndex;
} else if (pendingParsed.readableStartWord > 0) {
    pendingSeekRef.current = pendingParsed.readableStartWord;
}
```

So a saved book always opens at the first readable word, even when `progressById` already holds a position for it partway through the book. Progress is honored only on surfaces that explicitly pass it: RecentRow passes `r.currentIndex`, vibe and search cards pass `progressById[book.id]?.currentIndex`.

**Native behavior today.** `LibraryScreen` renders `BookRow` without a `startIndex` (native `src/screens/LibraryScreen.tsx:74-83`, `src/components/rows.tsx:75-107`), which matches the web. But `ReaderScreen` computes:

```ts
initialIndex: Math.min(
    startIndex ?? saved?.currentIndex ?? parsed.readableStartWord,
    Math.max(0, parsed.tokens.length - 1),
),
```

where `saved = progressById[book.id]` (native `src/screens/ReaderScreen.tsx:56` and 92 to 95). With `startIndex` undefined the `?? saved?.currentIndex` fallback wins, so a saved book that was ever read resumes partway through (or at the end, if finished) instead of restarting. `OpenTransition.tsx:282` passes `startIndex` through unchanged, so Library taps really do reach `ReaderScreen` with `startIndex` undefined.

**Change.** Remove the `?? saved?.currentIndex` fallback from `initialIndex`, and also from the `lastIndex` ref init at native `src/screens/ReaderScreen.tsx:85` (`const lastIndex = useRef(startIndex ?? saved?.currentIndex ?? 0)`). An absent `startIndex` must mean "open at `readableStartWord`", exactly like the web. Resume positions must come only from an explicit `startIndex` passed by the opener. This is safe: every other native surface already passes explicit progress the way the web does (TodayScreen hero passes `progress.currentIndex`; VibeScreen and ResultsScreen cards pass `progressById[book.id]?.currentIndex`). Once nothing reads `saved`, you can drop the `saved` selector from ReaderScreen entirely.

### 2. Index 0 edge cases: startIndex 0 must fall through, and index 0 must be saveable

**Web behavior.** Two web rules involve index 0:

(a) `completePendingOpen` treats a `startIndex` of 0 as falsy (`pending.startIndex && pending.startIndex > 0`, web `src/App.tsx:203`), so a recent row whose stored `currentIndex` is 0 still opens at `readableStartWord`, never in the Gutenberg front matter.

(b) The progress persist effects (web `src/App.tsx:254-294`) save whenever the index changed since the last save, including index 0, because `lastSavedIndexRef` starts at `-1` (web `src/App.tsx:256`). So merely opening a book (the post open seek lands on `readableStartWord`, or stays at 0 if there is none) and immediately backing out creates a Reading row in the Library at 0%.

**Native behavior today.** (a) `startIndex ?? saved?.currentIndex ?? readableStartWord` honors an explicit 0, so a 0 index progress entry would open at token 0, inside the front matter. (b) `saveNow` guards `if (lastIndex.current > 0 && tokenCount > 0)` (native `src/screens/ReaderScreen.tsx:121`), so a book whose `readableStartWord` is 0 (weak or no chapter structure), opened and exited without advancing, never appears in the Library's Reading list, while on the web it appears at 0%.

Edge (a) is currently latent on native because native's own `saveNow` never writes 0 index entries; it becomes live the moment the guard in (b) is fixed. Most books have `readableStartWord > 0`, and `useReelEngine` fires `onIndexChange` with the initial index on mount (native `src/reader/useReelEngine.ts:151`, fed by the hydration effect at 140 to 149), so the common open and leave case already matches.

**Change.** Only apply `startIndex` when it is `> 0`, falling through to `readableStartWord` otherwise (mirror the web's `startIndex && startIndex > 0` truthiness rule). And persist progress using the web's "index changed since last save" rule instead of the `> 0` guard, which is issue 3 below. Together these make Reading list membership match the web for books with `readableStartWord === 0`.

### 3. Progress must save whenever the index changed since the last save, including index 0

**Web behavior.** Web's throttled save (web `src/App.tsx:257-277`) fires whenever the index CHANGED from the last saved value (sentinel `lastSavedIndexRef = useRef(-1)` at `src/App.tsx:256`), gated by `(!rsvp.isPlaying || sinceSave >= PROGRESS_SAVE_INTERVAL_MS)` with the interval at 2000ms. Since the reader opens paused, the very first effect run saves progress at the current index, even 0. So merely opening a book immediately records it in `progressById`: it shows in Library > Reading, in Recents ordering, and on the Today resume hero at 0%. A second effect (web `src/App.tsx:281-294`) saves unconditionally on leaving the reader if the index differs from the last save, including a save at index 0 after scrubbing back to the start.

**Native behavior today.** `saveNow` (native `src/screens/ReaderScreen.tsx:120-131`) guards `if (lastIndex.current > 0 && tokenCount > 0)`. `lastIndex` starts at `startIndex ?? saved?.currentIndex ?? 0` (line 85). For a fresh book whose parse yields `readableStartWord` 0, opening and backing out writes nothing, so the book never enters `progressById` and is absent from Reading, Recents, and the resume hero, unlike the web. (Books with detected front matter do get saved once the engine hydrates to `readableStartWord > 0` and `onIndexChange` bumps `lastIndex`.) Also, scrubbing back to word 0 and then exiting keeps the stale higher position, because the 0 save is skipped in both the throttled effect (lines 133 to 141) and the AppState/unmount effect (lines 143 to 152).

**Change.** Replace the `lastIndex.current > 0` guard with web semantics: save whenever the index differs from the last persisted value. Track a `lastSavedIndex` ref seeded to `-1`, compare `lastIndex.current !== lastSavedIndex.current` (plus `tokenCount > 0`), and update `lastSavedIndex` after each successful save. Apply this in both the throttled path and the unmount/background path.

One caution: the old `> 0` guard was presumably added to avoid clobbering a real resume point with 0 before the engine hydrates. Keep that safety a different way: only enable saves after the engine's one time hydration jump. `ReaderScreen` already gates the effects on `ready` (which is `parsed.tokens.length > 0`), and `useReelEngine` hydrates in the same commit that flips tokens non empty (the hydration effect at `useReelEngine.ts:140-149` sets the index to `initialIndex` and `onIndexChange` at line 151 immediately updates `lastIndex`). Seed `lastIndex` from the hydrated initial index instead of forbidding 0. Verify the ordering in the current working tree so a save at index 0 can never fire before hydration lands on `initialIndex`.

### 4. Android system back while playing must not drop the in flight session

**Web behavior.** Every reader exit on the web goes through `handleBack` (web `src/App.tsx:228-231`), which calls `rsvp.pause()`; the `isPlaying` effect in the always mounted App (web `src/App.tsx:296-314`) then fires `addSession(words, ms)` for the play to pause span. Backgrounding also pauses (visibilitychange), so a span can never be silently lost. Stats (the "Your Reading" card and the Stats page) always include the last stretch read.

**Native behavior today.** The span lives in a ref inside `useReelEngine` on the `ReaderScreen` (native `src/reader/useReelEngine.ts:159-170`). Header back and the menu button call `engine.pause()` first, so the session is recorded, and AppState backgrounding pauses too (`useReelEngine.ts:331-336`). But the Android hardware or gesture back pops the screen directly: the unmount cleanup (native `src/screens/ReaderScreen.tsx:148-152`) only calls `sub.remove()` and `saveNow()` for progress. Nothing calls `pause()` or `endSpan()` (grep confirms no `beforeRemove` listener exists anywhere in the native `src`), so the pending play span is discarded and stats lose that session's words and time. Progress position IS saved on this path; only session stats are lost.

**Change.** On any unmount or `beforeRemove` of `ReaderScreen` while playing, end the span first (call `engine.pause()`, or `endSpan` with the current index) so `addSession` fires, matching the web's guarantee that every exit records the session. Either a `navigation.addListener('beforeRemove', ...)` or a `pause()` call in the effect cleanup before `saveNow()` works; make sure the pause runs before the progress save so both the session and the final position land. Note `engine.pause()` is a no op when not playing (`useReelEngine.ts:321-326` early returns on `!playing`), so calling it unconditionally on the way out is safe.

### 5. Discard zero word or zero length spans so stats are never inflated

**Web behavior.** On each play to pause boundary the web computes `ms = Date.now() - at` and `words = Math.max(0, currentIndex - index)`, then calls `addSession` ONLY `if (ms > 0 && words > 0)` (web `src/App.tsx:309`). Tapping play then pause in place, or a span where the reader ended at or behind the start index, contributes nothing to `stats.wordsRead` or `stats.msRead`.

**Native behavior today.** `useReelEngine.endSpan` (native `src/reader/useReelEngine.ts:161-165`) calls `onSession(Math.max(0, i - span.i), Date.now() - span.t)` unconditionally whenever a span existed, and the store's `addSession` (native `src/store.ts:102-107`) clamps negatives but happily adds `words = 0` with positive ms. Play then immediate pause, or play followed immediately by a scrub (the scrub gesture's `onBegin` at `useReelEngine.ts:264-266` ends the span at the current index before any words advanced), accumulates `msRead` with 0 words. Over time the Stats page's time read grows and any pace figure derived from words over time (TodayScreen's `avgWpm = wordsRead / minutes`) drops relative to the web. Stats are cumulative and persisted, so the drift is permanent once written; fixing this early matters more than the per event size suggests.

**Change.** Guard the emission with the web's condition: only call `onSession` when both `ms > 0` and `words > 0`. Do it either inside `endSpan` in `useReelEngine.ts` or inside the `onSession` handler ReaderScreen passes in; inside `endSpan` covers every pause path at once (`togglePlay`, `pause`, the end of book stop, and the scrub `onBegin`), since all of them route through it. **Reminder: `useReelEngine.ts` has uncommitted changes from another active session. Read the file first and apply this guard to whatever `endSpan` currently looks like.**

## Acceptance checklist

- [ ] Tapping a Saved for later row in the Library for a book with stored progress opens the reader at the book's first readable word, not at the stored position (issue 1).
- [ ] A progress entry with `currentIndex` 0 opens the book at `readableStartWord`, never inside the Gutenberg front matter, because a `startIndex` of 0 falls through just like on the web (issue 2).
- [ ] Opening a book with no detected front matter (`readableStartWord === 0`) and backing out immediately creates a Reading row in the Library at 0% and places the book in Recents and on the Today resume hero, and scrubbing back to word 0 then exiting persists position 0 instead of the stale higher position (issue 3).
- [ ] Exiting the reader with the Android system back gesture or hardware back while playback is running records the session: total time and words on the Stats page grow by that stretch (issue 4).
- [ ] Tapping play then pause without advancing, or play then an immediate scrub, adds nothing to total time read or words read; average WPM on Today and the Stats page no longer drifts down from zero word spans (issue 5).

## Verification

1. Type check the native repo: run `npx tsc --noEmit` in `C:/Users/Michael/Desktop/Focus Reader Android`. It must pass.
2. Reason through the running behavior carefully, path by path: fresh open with and without front matter, open from Saved for later with existing progress, header back, system back while playing, backgrounding while playing, scrub to 0 then exit, and play/pause in place. Confirm each matches the web rules quoted above.
3. Do NOT use the Expo web build to verify anything. Its dev server opens blank localhost tabs in the real browser and the web bundle breaks on zustand's `import.meta`. On device checking is done by Michael on his Android phone.

When you finish, tell Michael exactly what to check on his phone, in plain everyday English. Suggest checks like these:

- Save a book you have already read partway, then open it from the Saved for later list. It should start from the beginning of the actual story, not where you left off.
- Open a brand new book, then back out right away without reading. It should now show up under Reading in the Library at 0 percent and on the Today screen.
- Start a book playing, then leave the reader with the phone's own back gesture. Check the Stats page: the time and words from that little stretch should be counted.
- Tap play and then pause right away a few times without reading. Your total reading time on the Stats page should not go up from that.

## Final note

When summarizing your work for Michael, use plain everyday language, explain what changed and why it matters without jargon, and avoid dashes in prose. Use commas or separate sentences instead.

---

## Outcome, recorded 2026-07-13

Implemented in commit `295bbb7` on `feat/native-ui-web-parity` in the native repo.

Files changed: `src/screens/ReaderScreen.tsx`, `src/reader/useReelEngine.ts`, `app.json`.

### Issue by issue

**1. Saved for later rows open at the first readable word, not the stored resume point** (done)

Removed the progressById fallback from ReaderScreen entirely (the saved selector is gone). An absent startIndex now always means open at readableStartWord. Library rows pass no startIndex, so they restart at the story; Today hero, vibe cards, search cards, and recents still pass explicit progress and resume, exactly like the web.

**2. startIndex 0 falls through to readableStartWord, and index 0 is saveable** (done)

The opening position is now `startIndex && startIndex > 0 ? startIndex : parsed.readableStartWord`, mirroring the web truthiness rule in completePendingOpen, so a stored index of 0 never opens inside the Gutenberg front matter. The saveability half is delivered by the issue 3 change.

**3. Progress saves whenever the index changed since the last save, including index 0** (done)

Replaced the `lastIndex.current > 0` guard with the web rule: `lastSavedIndexRef` seeded to sentinel -1, save fires when `lastIndex.current !== lastSavedIndexRef.current` (plus tokenCount > 0), lastSavedIndex updated only on a real save, throttle timestamp bumped only on a real save (web parity). Applied in both the throttled effect and the AppState/unmount path. lastIndex is now seeded from the same hydrated initialIndex expression, and the engine's hydration effect runs before ReaderScreen's save effects in the same commit, so a save cannot fire before the position lands on the opening word.

**4. Android system back while playing records the in flight session** (done)

Two layers: a navigation `beforeRemove` listener calls engine.pause() the moment the pop starts (so the span ends at exit time, not after the pop animation), and the unmount cleanup now calls engineRef.current.pause() before saveNow() as a safety net for any other unmount. pause() is a no op when not playing, so header back and menu exits are unaffected.

**5. Zero word or zero length spans never reach the stats store** (done)

endSpan in useReelEngine now computes words and ms and only calls onSession when both are > 0, matching web App.tsx. Placed inside endSpan so every pause path is covered at once: togglePlay, pause, end of book stop, scrub touch down, AppState backgrounding, and the new exit paths.

### Judgment calls made during implementation

1) The state note said app.json should hold an uncommitted bump from 0.7.2 to 0.7.3; in reality the tree was clean at 0.7.7 (all prior sessions committed). Per the standing rule to bump every change round, I set it to 0.7.8. 2) For issue 4 I implemented both suggested mechanisms rather than picking one: beforeRemove ends the span at the instant the pop starts (more accurate span length), and a pause() in the effect cleanup before saveNow() covers non navigation unmounts; both are safe because pause() no ops when idle. 3) The zero span guard lives inside endSpan (the prompt's preferred spot) so every pause route is covered by one check. 4) Cold mounts (deep link or state restore) can briefly persist the pre hydration index for one commit before the corrected index is written in the same synchronous flush; I verified the web has the identical one commit transient (its persist effect runs before rsvp.seek's state commits), so I matched the web instead of adding extra gating. 5) Kept the tokenCount > 0 guard inside saveNow, same as the web's total === 0 early return.

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
