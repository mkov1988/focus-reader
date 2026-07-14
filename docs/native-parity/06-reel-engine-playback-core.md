# Reel engine playback correctness: match web's useRSVP state machine

> **Status: implemented and committed 2026-07-13.** Commit `0bfbcde` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings. Deliberate divergence kept: a controls seek beats a coasting fling (the web fling swallowing the seek was judged accidental).


## Mission

Fix six behavior gaps in the native reader's core playback engine (`src/reader/useReelEngine.ts` in the native repo) so it behaves exactly like the web app's `useRSVP` hook and kinetic scrubber. The headline bug: seeking during playback silently freezes word advancement while the button still shows the Pause icon. The rest: a stuck dragging flag after taps, the final word getting zero dwell time, speed changes not restarting the current word, no reduce motion support, and two small differences in how a fling gets interrupted. Every fix goes in the native repo only.

## Context

Focus Reader is a cozy speed reading app for public domain books. Words are shown one at a time (or in sentence, trail, paragraph, and hybrid views) at a chosen speed, and the reader can scrub through the text with a finger like an iOS date picker.

Two repos are involved:

- **Web app (READ ONLY source of truth): `C:/Users/Michael/Desktop/Focus Reader`**. A React web app. It defines the correct look and behavior. You will read its files to understand what "correct" means. Never modify anything in this repo.
- **Native app (ALL changes go here): `C:/Users/Michael/Desktop/Focus Reader Android`**. Expo SDK 54, React Native 0.81, reanimated 4, gesture-handler 2.28, zustand, expo-image, expo-haptics, lucide-react-native, react-navigation native-stack. This is a full React Native app. Never introduce a WebView.

All file references below are relative to their repo root. Web refs point into `C:/Users/Michael/Desktop/Focus Reader`, native refs into `C:/Users/Michael/Desktop/Focus Reader Android`.

Key architecture facts you need:

- Web: `src/hooks/useRSVP.ts` is the playback engine (a requestAnimationFrame loop keyed to `isPlaying` React state, with an accumulated time ref per word). `src/hooks/useKineticScrub.ts` is the pointer driven scrubber (drag, fling with exponential friction, ease onto a whole word). `src/components/Reader/RSVPDisplay.tsx` is the single word Focus reel.
- Native: `src/reader/useReelEngine.ts` merges both jobs into one shared engine. A single `useFrameCallback` worklet runs every frame on the UI thread with a `mode` shared value: 0 idle, 1 play, 2 fling, 3 settle. `pos` is the continuous fractional reading position, `acc` is the per word accumulated time, `dragging` and `interacting` are shared flags, and React `playing` state drives the play/pause icon and chrome behavior. `src/reader/displays.tsx` renders the views (its `useReelFrame` mirrors `pos` into React state only while `interacting` is true). `src/reader/ReaderChrome.tsx` holds the controls. `src/screens/ReaderScreen.tsx` wires it all together.
- The feel constants already match the web verbatim: FRICTION_K 0.0035, HANDOFF_V 0.004, MAX_V 0.4, SETTLE_MS 260, easeOutCubic, a 64ms frame delta cap, and clamp at bounds with velocity zeroed. Do not touch them.

## Before you start

**IMPORTANT: this work overlaps an active reader fix session.** Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect branch `feat/native-ui-web-parity` with uncommitted changes in `src/reader/useReelEngine.ts`, `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, and `app.json` left by another session that is actively fixing the reader. Read the current state of each file before editing it, build on what is there, and do not revert changes you did not make. Do not commit, stash, or discard anything without being asked.

The line numbers below were verified against the working tree on 2026-07-13. If a line has drifted by the time you read it, trust the described behavior and re-locate the code.

## Issues to fix

### 1. Seek during playback freezes word advancement while the Pause icon stays up (high)

**What web does.** `useRSVP.seek(index)` (web `src/hooks/useRSVP.ts:177-182`) only clamps the index, sets `currentIndex` and `indexRef`, and resets `accumulatedTimeRef` to 0. It never touches `isPlaying`. The rAF loop is keyed to `isPlaying`, so while playing, pressing prev or next sentence (`skipToSentence` at lines 184 to 205 routes through `seek`) or tapping a word in Paragraph view (`onWordClick={rsvp.seek}`, web `src/components/Reader/ReaderView.tsx:119`) jumps position and playback continues seamlessly at the new spot, with the new word getting its full delay. The Controls get `onSkipSentence={rsvp.skipToSentence}` and `onSeek={rsvp.seek}` at ReaderView.tsx:179-182.

**What native does.** `useReelEngine.seek()` (native `src/reader/useReelEngine.ts:338-343`) sets `mode.value = 0` (idle) but does NOT call `setPlaying(false)`. If mode was 1 (playing), the frame loop's play branch stops running: words freeze, but the `playing` React state stays true, so the Controls button still shows the Pause icon, `useImmersive` keeps treating the reader as playing (chrome re-hides after the peek), and the user must tap the play button twice to recover (the first tap only clears the stale state). `skipSentence()` (lines 345 to 356) routes through `seek()`, and the chrome wires the prev and next sentence buttons straight to it (native `src/reader/ReaderChrome.tsx:103-112`). Word taps also hit `seek` directly: paragraph words call `onSeek(tok.id)` (native `src/reader/displays.tsx:543`) and the sentence strip passes `onWordPress={engine.seek}` (native `src/screens/ReaderScreen.tsx:286`).

Reachability today: the bug reproduces mainly in Paragraph mode (prev and next sentence buttons, word taps, horizontal swipe skip) because its surface gesture has no scrub pan, so nothing pauses first. In Focus, Hybrid, Trail, and Sentence the bug is currently masked, not absent: the whole stage scrub pan's `onBegin` pauses cleanly at touch down before any tap or swipe resolves (that over eager pause is a separate delta, `focusreel-tap-zone-pauses-everywhere`, owned by another session). Fixing that tap zone immediately exposes this freeze in Focus. Fix this engine bug regardless of where it currently reproduces; the tap zone parity fix depends on `seek()` keeping playback alive through a swipe skip.

**The fix.** `seek()` must preserve playback: if `mode.value` was 1, keep it 1 (set `pos.value` to the clamped target and reset `acc.value = 0`) instead of dropping to idle. If mode was 2 or 3 (fling or settle), keep the current behavior of dropping to 0 for now (see issue 6 for the open question there). Only explicit pause, `togglePlay`, and the AppState listener should ever flip `playing`. After the fix, sentence skips and word taps during playback must continue reading from the new index exactly like web. Note the Controls progress bar drag already pauses explicitly before seeking (its own pan `onBegin` calls `onPause`), matching web, so this fix does not change that path.

### 2. Stuck `dragging` flag after a tap or failed pan keeps the reel on its heavyweight interacting path (medium)

**What web does.** During playback and at rest the web reel shows ONLY the centred word: whenever the user is not scrubbing, an effect syncs `frac` to `currentIndex` with speed 0 (web `src/components/Reader/RSVPDisplay.tsx:61-66`), so `motion = min(1, speed / 0.02) = 0` (line 86, NEIGHBOR_FULL_SPEED is 0.02) and every neighbour renders at `opacity = distanceFade * motion = 0` (lines 136 to 146). Neighbours are visible only while the finger is actually moving the reel.

**What native does.** `pan.onBegin` (native `src/reader/useReelEngine.ts:264-271`, fires at touch down, before activation) sets `dragging.value = true`. Only `pan.onEnd` (lines 278 to 293) resets it, and `onEnd` never fires when the pan is cancelled or fails (a tap wins the Race, or a horizontal move trips `failOffsetX([-24, 24])`, line 297). There is no `onFinalize`. After any tap to peek or swipe, `dragging` stays true, so the frame loop (lines 196 to 202) pins `interacting` true forever and `useReelFrame` (native `src/reader/displays.tsx:117-135`) stays active.

What actually goes wrong: (1) the reel mounts and lays out the whole nine row neighbour window (displays.tsx lines 176 to 183) and fires a redundant `runOnJS` setState on every word during playback, hot path churn that breaches the documented invariant "render just the centred word at rest and during playback". Note the neighbours are usually invisible during this churn: reanimated mappers run via queueMicrotask in the same UI frame as the `pos` write, before the next frame recomputes `speed`, so each per word `setReel` push captures speed 0 and neighbours render at opacity 0. (2) A tap that interrupts a fling leaves the LAST nonzero pushed speed in React state, so frozen half faded neighbours stay visible at rest until the next scrub or word advance. The web exhibits the same frozen neighbour wart after a tap that interrupts a fling, so that sub case is parity, not a delta. (3) The stuck `interacting` flag leaks into SentenceDisplay's playback pinning, making the strip follow the UI thread `pos` instead of the committed index, the per word lurch the engine's own comment warns against (another session owns that symptom, same root cause).

**The fix.** Add `pan.onFinalize(() => { 'worklet'; dragging.value = false; })` to the scrub gesture. `onFinalize` fires for completed, cancelled, AND failed gestures, so a tap or failed pan can no longer leave `dragging` and `interacting` stuck. After the fix, playback after a tap must go back to mounting only the centred row with no per word `setReel` pushes.

One warning: the web has its own tap quirk in the same area. `useKineticScrub.ts:188-197`, the tap path in `onUp`, returns without firing `onSettle`, so RSVPDisplay's `scrubbing` ref also sticks true after a tap on the reel band. Do NOT replicate that web freeze. The parity target here is the intended invariant that both codebases document, not the web's accidental behavior.

### 3. Final readable word gets zero dwell time, and play refuses to start at the readable end (low)

**What web does.** The tick (web `src/hooks/useRSVP.ts:113-125`) only ends playback inside the `accumulatedTime >= wordDelay` branch: the token AT `effectiveEnd` (the readable end word) is displayed for its full delay (base times multiplier, for example 3x for a closing period, DELAY_SENTENCE_END = 3.0 at web `src/utils/textProcessing.ts:39`), and only then do `setIsPlaying(false)` and `onComplete` fire. `play()` (lines 152 to 156) is guarded by `currentIndex < tokens.length - 1` (the raw last token, not `effectiveEnd`), so with the index scrubbed to or past the readable end but before the raw end, pressing play starts, shows that word for one delay, then auto pauses.

**What native does.** The play branch checks `if (i >= endSV.value)` at the top of the frame (native `src/reader/useReelEngine.ts:204-210`), so the moment `pos` reaches `effectiveEnd` it flips to paused with zero dwell on the final word (its 3x sentence end pause is never served). The user sees the book ending one word delay early, the chrome pops back in while the last word barely flashed. And `togglePlay` (lines 306 to 319) refuses to start unless `cur < effectiveEnd`, so play does nothing at or past the readable end instead of web's one dwell then complete.

**The fix.** Serve the final word's full delay before stopping: in the play branch, accumulate `acc` for the word at `effectiveEnd` too, and end playback (mode 0 plus `setPlayingJS(false, i)`) only when its delay elapses, instead of advancing. In other words, move the end check inside the `acc.value >= wordDelay` branch: if `i < endSV.value` advance to `i + 1`, otherwise stop. Also align the start guard in `togglePlay` to the web's: block only at `tokens.length - 1` (the engine's `max`), not at `effectiveEnd`, so play at or past the readable end dwells once then completes.

### 4. Changing WPM during playback does not restart the current word's dwell (low)

**What web does.** `wpm` is a dependency of the tick callback (web `src/hooks/useRSVP.ts:94-132`); a WPM change creates a new tick, and the start and stop effect (lines 135 to 150, deps `[isPlaying, tick, tokens.length]`) re-runs: cancelAnimationFrame, `lastTimeRef = 0`, `accumulatedTimeRef = 0`, new rAF. Net effect: the word on screen gets a fresh, full delay at the new rate. Tapping plus or minus repeatedly during playback visibly holds the current word until you stop adjusting.

**What native does.** A WPM change only writes `baseDelay.value` (native `src/reader/useReelEngine.ts:115`, the effect `useEffect(() => { baseDelay.value = wpmToDelay(wpm); }, [wpm, baseDelay])`); `acc.value` keeps its accumulated time, so the current word's remaining dwell is the new delay minus `acc` and words keep flowing while the user taps plus or minus.

**The fix.** One line in that existing effect: when `wpm` changes while `mode.value === 1`, also reset `acc.value = 0`, so the current word restarts its dwell at the new rate exactly like web. Only observable while playing and adjusting speed.

### 5. The OS reduce motion setting is ignored (low)

**What web does.** `prefersReducedMotion()` (web `src/hooks/useKineticScrub.ts:41-43`) checks `matchMedia('(prefers-reduced-motion: reduce)')`. On release (line 207): `if (Math.abs(v) < HANDOFF_V || prefersReducedMotion()) startSettle()`, and `startSettle` itself finalizes instantly with no 260ms ease when reduced motion is on (line 116). So the reel snaps to the nearest whole word with no coast and no animation.

**What native does.** Nothing. The fling (mode 2, exponential friction, native `src/reader/useReelEngine.ts:221-234`) and the 260ms easeOutCubic settle (mode 3, lines 235 to 244) always run regardless of the OS "Remove animations" accessibility setting. The pan's `onEnd` (lines 278 to 293) always routes into mode 2 or 3.

**The fix.** Read the platform setting (reanimated's `useReducedMotion()` hook, or `AccessibilityInfo.isReduceMotionEnabled`), mirror it into a shared value so worklets can read it, and when enabled: on pan release skip mode 2 and mode 3 entirely and finalize instantly (`pos.value = ` the clamped `Math.round(pos.value)`, `mode.value = 0`). Guard the mode 3 branch the same way for safety so any settle in flight also finalizes instantly. Android maps the web's prefers-reduced-motion media query to its Remove animations setting via that API. This applies to every consumer of the shared engine (the trail and sentence scrubs too) but the change lives entirely in this engine.

### 6. Interrupting a fling: re-grip position and controls seek semantics differ (low)

Three sub behaviors when the reel is coasting (mode 2):

(a) **Catching the reel.** Web: touching the reel cancels the rAF and seeds the new drag from `getIndex()`, the committed integer (web `src/hooks/useKineticScrub.ts:139-166`, the seed is at line 155; `RSVPDisplay.tsx` passes `getIndex: () => currentIndex`), so the reel visibly snaps up to half a row the moment you catch it (the snap lands on the first move event). Native: `pan.onBegin` sets `dragBase.value = pos.value`, the exact fractional position (native `src/reader/useReelEngine.ts:264-271`), so catching is seamless with no snap. For exact parity, seed the drag from the committed integer: `dragBase.value = Math.round(pos.value)` (clamped). At rest and during playback `pos` is already an integer, so this only changes the catch during a fling or settle.

(b) **Controls seek during a coast.** Web: `rsvp.seek` from the controls (progress slider, skip buttons) during a coast does NOT stop the coast. The inertia loop keeps emitting `onCommit(round(frac))` every frame (web `src/hooks/useKineticScrub.ts:214-234`, commit at line 79) and overrides the seek until the fling settles; `scrub.stop()` is only invoked when playback starts (web `src/components/Reader/RSVPDisplay.tsx:83`, `stop` at `useKineticScrub.ts:102-108`). Native: `engine.seek()` sets mode 0, killing any in flight fling; the seek wins immediately. The web behavior reads like an accident (a fling silently swallowing an explicit seek), so do NOT blindly replicate it. Keep native's seek wins behavior, and flag the question to Michael in your final summary: does he want exact web parity here (the fling overrides a controls seek until it settles), or should the native behavior be treated as correct and the web fixed to match later?

(c) **Play during a fling.** Web stops the fling and finalizes onto the nearest word instantly. Native `togglePlay` (native `src/reader/useReelEngine.ts:306-319`) zeroes `vel` and enters play mode. These already match; just confirm your other edits keep it true.

All the feel constants involved (FRICTION_K 0.0035, HANDOFF_V 0.004, MAX_V 0.4, SETTLE_MS 260, easeOutCubic, the 64ms frame delta cap, clamp at bounds with velocity zeroed) already match verbatim; the only code change for this issue is the one line in (a).

## Acceptance checklist

- [ ] 1. While playing in Paragraph mode, tapping prev or next sentence or tapping a word jumps to the new spot and the words keep flowing; the Pause icon stays correct and one tap on the button pauses. The same holds in Focus once the tap zone fix from the other session lands.
- [ ] 2. After tapping the Focus reel to peek the chrome, resumed playback renders only the centred word (no neighbour rows mounted, no per word `setReel` state pushes), because `pan.onFinalize` clears `dragging`.
- [ ] 3. The last readable word of a book stays on screen for its full delay (3x base for a closing period) before playback flips to paused, and pressing play while sitting at or past the readable end shows that word for one delay then completes instead of doing nothing.
- [ ] 4. Tapping plus or minus on the WPM pill during playback restarts the current word's dwell each tap, so holding the buttons visibly holds the current word, like web.
- [ ] 5. With Android's Remove animations accessibility setting on, releasing a scrub snaps the reel instantly to the nearest word with no coast and no 260ms ease, in Focus, Sentence, and Trail views.
- [ ] 6. Catching the reel during a fling re-grips at the committed whole word (a visible snap of up to half a row on the first move), matching web; a controls seek during a fling still wins on native, and the summary asks Michael which behavior he wants long term.

## Verification

- Type check the native repo: run `npx tsc --noEmit` in `C:/Users/Michael/Desktop/Focus Reader Android`. It must pass.
- Reason through the running behavior carefully, especially the frame worklet's mode transitions: idle to play, play to idle at the end, drag to fling to settle, and every interruption path (tap during fling, seek during play, WPM change during play, app going to background). Confirm no path can leave `playing` true with `mode` at 0, and no path can leave `dragging` or `interacting` stuck true.
- Do NOT use the Expo web build to verify anything. Its dev server opens blank localhost tabs in Michael's real browser and the web bundle breaks on zustand's import.meta. It proves nothing about the app.
- On device checking is done by Michael on his Android phone. End your summary by telling him exactly what to try, in plain everyday English, for example: "Open a book in Paragraph view, hit play, then tap the next sentence arrow. Reading should keep going from the new sentence instead of freezing. Tap the middle of the screen while a word reel is spinning, then hit play again and watch that the reel shows just one word while it reads. Let a book run to the very last word and check the last word lingers a beat before the controls come back. While it reads, tap the speed plus button a few times fast and notice the current word holds still until you stop tapping. Then turn on Remove animations in Android's accessibility settings and check that flicking the reel lands instantly with no glide."

## Final note

When summarizing your work for Michael, use plain everyday language, no jargon, and avoid dashes in prose. Also put the issue 6(b) question to him plainly: on the web, dragging the progress bar while the reel is still gliding gets ignored until the glide ends, which looks like a bug; the phone app lets the drag win right away. Ask which one he wants everywhere.

---

## Outcome, recorded 2026-07-13

Implemented in commit `0bfbcde` on `feat/native-ui-web-parity` in the native repo.

Files changed: `src/reader/useReelEngine.ts`.

### Issue by issue

**1. Seek during playback keeps words flowing (Pause icon stays correct)** (done)

seek() now leaves mode 1 alone when playing (only resets acc and moves pos, like web useRSVP.seek); it still drops fling/settle (mode 2/3) to idle. Sentence skips, word taps, and swipe skips during playback now continue reading from the new spot with the new word getting a full dwell. Only pause, togglePlay, and the AppState listener flip playing.

**2. Stuck dragging flag after tap or failed pan** (done)

Added pan.onFinalize worklet that clears dragging; it fires for completed, cancelled, and failed gestures, so interacting can no longer pin true after a tap wins the Race or a horizontal move trips failOffsetX. Verified in displays.tsx that useReelFrame then mounts only the centred row with no per word setReel pushes during playback. Did not replicate the web's stuck scrubbing tap quirk.

**3. Final readable word gets full dwell; play works at readable end** (done)

Moved the end check inside the acc >= wordDelay branch: the word at (or past) effectiveEnd accumulates its full delay (including the 3x sentence end multiplier) before mode drops to 0 and setPlayingJS(false) fires. togglePlay guard changed from cur < effectiveEnd to max > 0 && cur < max, matching web play() which blocks only at the raw last token; the max > 0 part mirrors web's tokens.length > 0 so play stays blocked while the parse is still empty.

**4. WPM change during playback restarts current word's dwell** (done)

The existing wpm effect now also resets acc.value = 0 when mode.value === 1, so each plus/minus tap gives the on screen word a fresh full delay at the new rate, like the web's loop restart.

**5. OS reduce motion honored** (done)

New reduceMotion shared value fed by AccessibilityInfo.isReduceMotionEnabled plus a live reduceMotionChanged listener (chose this over reanimated's useReducedMotion because that hook only reads the value at app start; the web matchMedia check is live). Pan onEnd finalizes instantly (round, clamp, vel 0, mode 0) when enabled, and the mode 3 settle branch also lands instantly for any settle already in flight. Applies to Focus, Sentence, and Trail since all share the engine.

**6. Fling interruption semantics (re-grip, controls seek, play)** (done)

(a) dragBase now seeds from the clamped Math.round(pos.value) (the committed integer, like web getIndex()), so catching a coasting reel snaps up to half a row on the first move; at rest and during playback pos is already an integer so nothing else changes. (b) Kept native's seek wins behavior over an in flight fling as instructed, documented the deliberate divergence in a comment, and put the question to Michael in the summary. (c) Confirmed togglePlay during a fling still zeroes vel, resets acc, and enters mode 1; none of my edits touched that path.

### Judgment calls made during implementation

1) Reduce motion uses AccessibilityInfo with the reduceMotionChanged event listener instead of reanimated's useReducedMotion hook, because the reanimated hook only samples the setting at app launch while the web's media query check is live; the listener keeps the shared value current if Michael flips the setting mid session. 2) Issue 6(b): kept the native behavior where a controls seek immediately beats a coasting fling, since the web's fling swallowing an explicit seek reads like an accident; flagged the question for Michael below. 3) togglePlay's new guard is max > 0 && cur < max rather than just cur < max, mirroring the web's tokens.length > 0 check so play cannot start on an empty or still loading parse (where delay tables are empty and the worklet would compute NaN delays). 4) Version: preserved the uncommitted 0.7.3 bump in app.json untouched and did not bump further, reading this parity round (the nine storefront packs plus the reader packages) as sharing that one bump since a separate step commits the round. 5) Did not touch ReaderChrome's progress bar (it already pauses explicitly before seeking, matching web) or the pan onBegin pause at touch down (the over eager tap zone pause is owned by another session's package).

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
