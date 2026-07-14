# Reel engine playback correctness: match web's useRSVP state machine

**Done.** Implemented and committed as `0bfbcde` on `feat/native-ui-web-parity`, 2026-07-13, independent review passed with no unresolved findings. This package brought the native reader's core playback engine (`src/reader/useReelEngine.ts`) into line with the web app's `useRSVP` hook and kinetic scrubber, closing six behavior gaps in how words advance, dwell, and hand off between playing and scrubbing.

## What this fixed

Before this pack, the native engine merged playback and scrubbing into one worklet but diverged from the web on six behaviors. The headline bug: seeking during playback silently froze word advancement while the button still showed the Pause icon, so the user had to tap play twice to recover. Alongside it, a `dragging` flag could stick true after a tap or failed pan and keep the reel on its heavyweight interacting path, the final readable word got zero dwell time, changing speed mid playback did not restart the current word, the OS reduce motion setting was ignored, and catching a coasting reel re-gripped from a fractional position instead of the committed whole word. All six are now committed, and the deliberate divergence around a controls seek beating a coasting fling is kept and documented in a code comment. Every change lives in the native repo; the web app was the read only source of truth.

## What changed

The feel constants stayed verbatim throughout: FRICTION_K 0.0035, HANDOFF_V 0.004, MAX_V 0.4, SETTLE_MS 260, easeOutCubic, the 64ms frame delta cap, and clamp at bounds with velocity zeroed. Only the six behaviors below changed. All edits landed in `src/reader/useReelEngine.ts`.

### 1. Seek during playback keeps words flowing, Pause icon stays correct

Before, `useReelEngine.seek()` set `mode.value = 0` (idle) but never called `setPlaying(false)`, so if mode was 1 (playing) the frame loop's play branch stopped: words froze, the `playing` React state stayed true, the Controls button kept showing the Pause icon, and `useImmersive` kept treating the reader as playing. The web's `useRSVP.seek(index)` only clamps the index, sets `currentIndex` and `indexRef`, and resets `accumulatedTimeRef` to 0; it never touches `isPlaying`, and its rAF loop is keyed to `isPlaying`, so playback continues seamlessly at the new spot with the new word getting its full delay.

`seek()` now leaves mode 1 alone when playing: it moves `pos.value` to the clamped target and resets `acc.value = 0`, exactly like the web, and still drops fling or settle (mode 2 or 3) to idle. Sentence skips (prev and next sentence buttons wired in `src/reader/ReaderChrome.tsx`), word taps (paragraph words call `onSeek(tok.id)` in `src/reader/displays.tsx`; the sentence strip passes `onWordPress={engine.seek}` in `src/screens/ReaderScreen.tsx`), and swipe skips during playback all now continue reading from the new index. Only explicit pause, `togglePlay`, and the AppState listener ever flip `playing`. The Controls progress bar drag was left alone because it already pauses explicitly before seeking, matching web.

### 2. Stuck `dragging` flag after a tap or failed pan

Before, `pan.onBegin` set `dragging.value = true` at touch down, and only `pan.onEnd` reset it. `onEnd` never fires when a pan is cancelled or fails (a tap wins the Race, or a horizontal move trips `failOffsetX([-24, 24])`), and there was no `onFinalize`, so `dragging` stuck true and the frame loop pinned `interacting` true forever. That kept the reel mounting its whole nine row neighbour window and firing a redundant per word `setReel` state push during playback, a hot path churn that breaks the documented invariant of rendering just the centred word at rest and during playback. The web shows only the centred word whenever the user is not scrubbing: an effect syncs `frac` to `currentIndex` with speed 0, so `motion = min(1, speed / 0.02) = 0` (NEIGHBOR_FULL_SPEED is 0.02) and every neighbour renders at `opacity = distanceFade * motion = 0`.

Added `pan.onFinalize(() => { 'worklet'; dragging.value = false; })` to the scrub gesture. `onFinalize` fires for completed, cancelled, and failed gestures, so a tap or failed pan can no longer leave `dragging` and `interacting` stuck. Verified in `displays.tsx` that `useReelFrame` then mounts only the centred row with no per word `setReel` pushes during playback. The web's own tap quirk (its `onUp` tap path returns without firing `onSettle`, so `RSVPDisplay`'s `scrubbing` ref sticks true) was deliberately not replicated; the parity target is the intended invariant both codebases document, not the web's accidental freeze.

### 3. Final readable word gets its full dwell, and play works at the readable end

Before, the play branch checked `if (i >= endSV.value)` at the top of the frame, so the moment `pos` reached `effectiveEnd` it flipped to paused with zero dwell on the final word (its 3x sentence end pause was never served), and the chrome popped back in while the last word barely flashed. And `togglePlay` refused to start unless `cur < effectiveEnd`, so play did nothing at or past the readable end. The web's tick only ends playback inside the `accumulatedTime >= wordDelay` branch, so the token at `effectiveEnd` is displayed for its full delay (base times multiplier, for example 3x for a closing period, DELAY_SENTENCE_END = 3.0) before `setIsPlaying(false)` and `onComplete` fire; the web's `play()` is guarded by `currentIndex < tokens.length - 1` (the raw last token, not `effectiveEnd`), so at the readable end pressing play shows the word for one delay then auto pauses.

Moved the end check inside the `acc >= wordDelay` branch: the word at (or past) `effectiveEnd` accumulates its full delay, including the 3x sentence end multiplier, before mode drops to 0 and `setPlayingJS(false)` fires. The `togglePlay` guard changed from `cur < effectiveEnd` to `max > 0 && cur < max`, matching the web's `play()` which blocks only at the raw last token; the `max > 0` part mirrors the web's `tokens.length > 0` so play stays blocked while the parse is still empty.

### 4. WPM change during playback restarts the current word's dwell

Before, a WPM change only wrote `baseDelay.value` (`useEffect(() => { baseDelay.value = wpmToDelay(wpm); }, [wpm, baseDelay])`); `acc.value` kept its accumulated time, so the current word's remaining dwell became the new delay minus `acc` and words kept flowing while the user tapped plus or minus. The web makes `wpm` a dependency of the tick callback, and the start and stop effect re-runs on a WPM change (cancelAnimationFrame, `lastTimeRef = 0`, `accumulatedTimeRef = 0`, new rAF), so the word on screen gets a fresh full delay at the new rate.

The existing wpm effect now also resets `acc.value = 0` when `mode.value === 1`, so each plus or minus tap gives the on screen word a fresh full delay at the new rate, like the web's loop restart. Only observable while playing and adjusting speed.

### 5. OS reduce motion setting honored

Before, the fling (mode 2, exponential friction) and the 260ms easeOutCubic settle (mode 3) always ran regardless of Android's Remove animations accessibility setting; the pan's `onEnd` always routed into mode 2 or 3. The web's `prefersReducedMotion()` checks `matchMedia('(prefers-reduced-motion: reduce)')`, and on release, if reduced motion is on, `startSettle` finalizes instantly with no 260ms ease, so the reel snaps to the nearest whole word with no coast and no animation.

Added a `reduceMotion` shared value fed by `AccessibilityInfo.isReduceMotionEnabled` plus a live `reduceMotionChanged` listener. On pan release, when enabled, mode 2 and mode 3 are skipped and the position finalizes instantly (`pos.value = Math.round(pos.value)` clamped, `vel` zeroed, `mode.value = 0`); the mode 3 settle branch is guarded the same way so any settle already in flight also lands instantly. This applies to every consumer of the shared engine (Focus, Sentence, and Trail) but the change lives entirely in this engine.

### 6. Fling interruption semantics: re-grip, controls seek, play

Three sub behaviors when the reel is coasting (mode 2):

(a) **Catching the reel.** Before, `pan.onBegin` set `dragBase.value = pos.value`, the exact fractional position, so catching was seamless with no snap. The web seeds the new drag from `getIndex()`, the committed integer, so the reel visibly snaps up to half a row the moment you catch it. `dragBase` now seeds from the clamped `Math.round(pos.value)`, matching web; at rest and during playback `pos` is already an integer, so this only changes the catch during a fling or settle.

(b) **Controls seek during a coast.** On the web, a controls seek (progress slider, skip buttons) during a coast does not stop the coast: the inertia loop keeps emitting `onCommit(round(frac))` every frame and overrides the seek until the fling settles. Native's `engine.seek()` sets mode 0, killing any in flight fling, so the seek wins immediately. Because the web behavior reads like an accident (a fling silently swallowing an explicit seek), native's seek wins behavior was kept, the deliberate divergence was documented in a code comment, and the question was put to Michael (see Judgment calls).

(c) **Play during a fling.** The web stops the fling and finalizes onto the nearest word instantly; native's `togglePlay` zeroes `vel`, resets `acc`, and enters play mode. These already matched, and it was confirmed that none of the other edits changed that path.

## Judgment calls

1. **Reduce motion uses `AccessibilityInfo` with the `reduceMotionChanged` listener** rather than reanimated's `useReducedMotion` hook, because that hook only samples the setting at app launch while the web's media query check is live; the listener keeps the shared value current if the setting is flipped mid session.
2. **A controls seek immediately beats a coasting fling on native (issue 6b), kept as is.** The web's fling swallowing an explicit seek reads like an accident, so native honors the press. Documented in a code comment and flagged to Michael: does he want exact web parity here (the fling overrides a controls seek until it settles), or should native's behavior be treated as correct and the web fixed to match later?
3. **`togglePlay`'s new guard is `max > 0 && cur < max`** rather than just `cur < max`, mirroring the web's `tokens.length > 0` check so play cannot start on an empty or still loading parse (where the delay tables are empty and the worklet would compute NaN delays).
4. **Version untouched.** The uncommitted 0.7.3 bump in `app.json` was left as is and not bumped further, reading this parity round as sharing that one bump since a separate step commits the round.
5. **`ReaderChrome`'s progress bar and the `onBegin` pause at touch down were left alone.** The progress bar already pauses explicitly before seeking (matching web), and the over eager tap zone pause at touch down is owned by another session's package.

## Check on your phone

- [ ] Confirm: in Paragraph view, hit play, then tap the next sentence arrow. Reading keeps going from the new sentence instead of freezing, and one tap on the button pauses.
- [ ] Confirm: tap the middle of a spinning word reel to peek the chrome, then hit play again. The reel shows just one word while it reads, with no faded neighbour words hanging around.
- [ ] Confirm: let a book run to the very last word. The last word lingers for its full beat (a closing period holds about three times as long) before the controls come back.
- [ ] Confirm: while a book reads, tap the speed plus button a few times fast. The current word holds still until you stop tapping.
- [ ] Confirm: turn on Remove animations in Android's accessibility settings, then flick the reel. It lands instantly on the nearest word with no glide, in Focus, Sentence, and Trail views.
- [ ] Confirm: flick the reel into a coast, then catch it. It snaps up to about half a row at the moment you grab it, matching the web.

Everything else in this package was verified in code and by review.
