# Paragraph Display Visual Polish (Native Parity Package 14)

> **Status: implemented and committed 2026-07-13.** Commit `269e27b` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings.


## Mission

Bring the paragraph reading view in the native Android app up to exact visual parity with the web app on five fine details: the active word pops to 105% size, the paragraph slides in with a decelerating ease out curve, word colors crossfade over 100ms instead of snapping, the highlight pill overhangs the word by 4px on each side without moving neighbors, and the gap between words scales with the paragraph font size instead of being a fixed 8px.

## Context

Focus Reader is a cozy speed reading app for public domain books. It exists in two repos:

- Web app (READ ONLY source of truth for look and behavior): `C:/Users/Michael/Desktop/Focus Reader`. Read it freely to check constants, copy, and timings. Never modify anything in this repo.
- Native app (where ALL your changes go): `C:/Users/Michael/Desktop/Focus Reader Android`. Expo SDK 54, React Native 0.81, reanimated 4, gesture-handler 2.28, zustand, expo-image, expo-haptics, lucide-react-native, react-navigation native-stack.

This is a full React Native app. Never introduce a WebView.

The paragraph view shows the whole current paragraph on a sunken card. The active word is highlighted, tapping any word jumps to it, and overscrolling an edge advances to the next paragraph. It also appears in hybrid mode, where a smaller faded paragraph sits under the single word reel.

## Before you start

1. Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect to be on branch `feat/native-ui-web-parity`.
2. **WARNING, THIS PACKAGE OVERLAPS THE ACTIVE READER FIX SESSION.** Another session may hold uncommitted changes in `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, `src/reader/useReelEngine.ts`, and `app.json`. This package edits `src/reader/displays.tsx`, which is one of those files. Always read the current state of a file before editing it, and never revert changes you did not make. If `git status` shows those files as modified, that is expected, work on top of what is there.
3. This package should ideally run after the `display-text-measurement` package, which also edits `src/reader/displays.tsx`. Sequencing after it avoids conflicting edits in the same file. If that package has already landed, some line numbers below will have drifted.
4. Line numbers throughout this file are anchors from an audit snapshot. If a listed line number has drifted, trust the described behavior and re-locate the code by searching for the identifiers and constants quoted here.

## Issues to fix

### 1. Active paragraph word should scale to 105%

Delta id: `displays-paragraph-active-word-scale`. Severity: medium.

**What the web does** (`src/components/Reader/ParagraphDisplay.tsx:229-247`): the active word span gets the classes `bg-focal/20 text-focal scale-105` together with `inline-block` (needed for the transform to apply). The current word renders 5% larger than its neighbors. The scale is applied instantly, with no animation, because the span only transitions colors (`transition-colors`), not transform. This gives each word a small pop as the highlight lands on it. Because it is an inline block scale, the enlarged word overlaps its neighbors slightly without reflowing the line.

**What native does** (`C:/Users/Michael/Desktop/Focus Reader Android/src/reader/displays.tsx:537-559`): the active word gets the focal color and a `t.focalA(0.2)` background only. No scale transform. The word stays at normal size.

**Change for parity**: apply `transform: [{ scale: 1.05 }]` to the active word's element, instantly, with no animation, while keeping the focal color and the 20% focal background. RN `Text` supports the `transform` style prop directly, so this can go straight into the existing inline style object (currently at lines 547-554). If Android renders it poorly on `Text` inside the wrapped row, wrap each word in a `View` and put the transform there instead. Either way, RN transforms do not affect layout, matching the web's behavior where the scale renders as overlap without reflow. Verify the scale does not shift line layout.

### 2. Paragraph slide in should use the CSS ease out curve

Delta id: `displays-paragraph-enter-easing`. Severity: low.

**What the web does** (`src/index.css:97-106` and `src/components/Reader/ParagraphDisplay.tsx:201-224`): each new paragraph remounts (keyed by its first token id) and plays `para-enter-up` or `para-enter-down`: opacity 0 to 1 and translateY from plus or minus `enterDist` to 0, declared as `animation: 0.3s ease-out both`. CSS `ease-out` equals `cubic-bezier(0, 0, 0.58, 1)`, which decelerates from the very start. The distance and duration grow with how many paragraphs a flick jumped: `enterDist = 28 + (count - 1) * 42` pixels and `duration = 300 + (count - 1) * 150` ms (the duration is an inline `animationDuration` override). Direction: the paragraph enters from below when going forward and from above when going back. The whole animation is effectively disabled under `prefers-reduced-motion` (`src/index.css:150-153` forces `animation-duration` to 0.01ms with `!important`).

**What native does** (`C:/Users/Michael/Desktop/Focus Reader Android/src/reader/displays.tsx:567-579`): the `EnterPara` component drives opacity and translateY from a single progress shared value using `withTiming(1, { duration: dur })`. Reanimated's default easing is `Easing.inOut(Easing.quad)`, which starts slow, so the paragraph appears to hesitate before sliding in. The distances, durations, and direction already match the web.

**Change for parity**: pass an ease out curve: `withTiming(1, { duration: dur, easing: Easing.bezier(0, 0, 0.58, 1) })`. `Easing.out(Easing.cubic)` is an acceptable closest feel if the bezier misbehaves. Note that `Easing` is not currently in the reanimated import at the top of `displays.tsx` (line 27), so add it there. Also consider honoring the system reduce motion setting via `AccessibilityInfo.isReduceMotionEnabled` (or reanimated's `useReducedMotion`), since the web disables this animation under `prefers-reduced-motion`.

### 3. Word colors should crossfade over 100ms

Delta id: `displays-paragraph-word-color-transition`. Severity: low.

**What the web does** (`src/components/Reader/ParagraphDisplay.tsx:234-242`): every word span carries `transition-colors duration-100`. As playback advances, each word's text color and highlight background crossfade over 100ms between the three states: active is focal text plus `focal/20` background, passed is `mocha/50`, upcoming is `espresso/85`. This softens the highlight hopping from word to word.

**What native does** (`C:/Users/Michael/Desktop/Focus Reader Android/src/reader/displays.tsx:541-558`): colors and background change instantly when the index changes. The highlight jumps with a hard cut.

**Change for parity**: animate `color` and `backgroundColor` over 100ms on state change for each word, for example `Animated.Text` with `useAnimatedStyle` plus `withTiming` at 100ms, or a small crossfade. At minimum, cover the words entering and leaving the active and passed states. Performance note: per word animated styles for a whole paragraph may be costly; a cheap approach is animating only the two words that changed state on each tick (the word becoming active and the word it just left). Reanimated interpolates colors, so `withTiming` on a color style works, but confirm the passed and upcoming alpha colors (`t.mutedA(0.5)`, `t.inkA(0.85)`) interpolate cleanly.

### 4. Highlight pill should overhang the word by 4px each side

Delta id: `displays-paragraph-highlight-padding`. Severity: low.

**What the web does** (`src/components/Reader/ParagraphDisplay.tsx:234-242`): word spans carry `rounded px-1 -mx-1 inline-block`. That is 4px horizontal padding cancelled by a negative 4px margin, so the `focal/20` background pill overhangs the word by 4px on each side, with a 4px corner radius, without shifting neighboring words.

**What native does** (`C:/Users/Michael/Desktop/Focus Reader Android/src/reader/displays.tsx:547-554`): `borderRadius: 4` and the `t.focalA(0.2)` background are applied directly to the `Text`, so the pill is exactly the glyph box, visibly tighter than web.

**Change for parity**: give each word 4px horizontal padding compensated by a negative 4px margin (`paddingHorizontal: 4, marginHorizontal: -4`) so the pill overhangs identically without changing effective word spacing. This works together with the 0.25em gap fix in issue 5. Test that the negative margins do not upset the `flexWrap` row (`s.paraWrap`) on Android, and that tap targets (`onPress` per word) and the active word `onLayout` autoscroll bookkeeping still behave.

### 5. Word gap should be 0.25em of the paragraph font size, not a fixed 8px

Delta id: `displays-paragraph-word-gap-em`. Severity: low.

**What the web does** (`src/components/Reader/ParagraphDisplay.tsx:220-224` and `205-217`): the wrap row uses `gap-x-[0.25em]`, so the gap scales with the computed `displaySize` (`Math.max(24, Math.min(fontSize * 0.6, 48))`, line 199). That gives 8.4px in the standalone paragraph view (displaySize 33.6 from the default reader font size 56) and 6px in hybrid mode (hybrid passes fontSize 28, so `28 * 0.6 = 16.8` clamps up to displaySize 24, and `24 * 0.25 = 6`). Container horizontal padding is `px-4 sm:px-8`, meaning 16px, and 32px only at viewports 640px or wider.

**What native does** (`C:/Users/Michael/Desktop/Focus Reader Android/src/reader/displays.tsx:593-594`): the stylesheet has `paraWrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }`, a fixed 8. That roughly matches standalone (8 vs 8.4) but is 33% too wide in hybrid mode (8 vs 6). Container padding is fixed at 16 (`paraContent`, line 593), which is correct for phones.

**Change for parity**: compute the gap as `displaySize * 0.25` inside the `ParagraphDisplay` component (its `displaySize` is at line 413, the same formula as web) and apply it as an inline `columnGap` on the wrap row instead of relying on the stylesheet constant. Keep the 16px container padding, since the web's 32px only applies at widths of 640px or more; consider it only if tablets become a target. This is pure polish, visible mainly in hybrid mode's denser context paragraph.

## Acceptance checklist

- [ ] The currently highlighted word in the paragraph view renders 5% larger than its neighbors, instantly on each step, without pushing surrounding words or reflowing the line.
- [ ] A new paragraph slides in fast at first and settles gently (ease out), instead of hesitating at the start; distance and duration still grow when a flick jumps several paragraphs, and direction still flips when going backward.
- [ ] As playback moves word to word, text colors and the highlight background fade over roughly 100ms instead of cutting hard.
- [ ] The highlight pill behind the active word extends about 4px past the glyphs on each side with rounded corners, and word spacing is unchanged from before the fix.
- [ ] The space between words equals a quarter of the paragraph font size: about 8.4px in the standalone paragraph view and 6px for the context paragraph in hybrid mode.

## Verification

1. Type check the native repo: run `npx tsc --noEmit` in `C:/Users/Michael/Desktop/Focus Reader Android` and fix any errors you introduced.
2. Reason through the running behavior carefully: the active word transform must not affect layout, the color animation must not create hundreds of animated nodes per paragraph, the negative margins must not break wrapping or taps, and the enter animation must still respect the jump count scaling.
3. Do NOT use the Expo web build to verify anything. Its dev server opens blank localhost tabs in the real browser and the web bundle breaks on zustand's `import.meta`. It proves nothing about the app.
4. On device checking is done by Michael on his Android phone. End your session by telling him exactly what to look at, in plain everyday English without jargon. For this package, that is roughly: open a book in Paragraph mode and press play. The word being read should look slightly bigger than the rest and its little highlight bubble should stick out a bit past the letters on each side. As reading moves along, the colors should melt from one word to the next instead of blinking. Swipe to a new paragraph and it should glide in quickly then settle softly, with no pause before it starts moving. Then switch to Hybrid mode and check the small paragraph at the bottom, the words there should sit a touch closer together than before.

## Final note

When summarizing your work for Michael, use plain everyday language and avoid dashes in prose. Explain what changed the way you would to a friend, not a compiler.

---

## Outcome, recorded 2026-07-13

Implemented in commit `269e27b` on `feat/native-ui-web-parity` in the native repo.

Files changed: `src/reader/displays.tsx`, `app.json`.

### Issue by issue

**1. Active paragraph word scales to 105%** (done)

Static transform [{ scale: 1.05 }] added to the active word's style, applied instantly with no animation. RN transforms never affect layout, so the pop overlaps neighbors without reflowing the line, matching the web's inline-block scale. Applied directly on the Text element as the prompt suggested first; the View-wrapper fallback was not needed for types or layout math, but rendering quality on device is Michael's to confirm.

**2. Paragraph slide-in uses CSS ease-out curve** (done)

EnterPara's withTiming now uses Easing.bezier(0, 0, 0.58, 1) (exact CSS ease-out), defined as module constant EASE_OUT. Easing added to the reanimated import. Distance/duration jump scaling and direction flip untouched. Reduce motion honored via ReduceMotion.System on the timing config, which snaps to the end state exactly like the web's prefers-reduced-motion animation kill.

**3. Word colors crossfade over 100ms** (done)

New FadingWord component: Animated.Text whose color and backgroundColor run through interpolateColor driven by a 100ms withTiming, using Tailwind's actual transition curve cubic-bezier(0.4, 0, 0.2, 1). Only the two words that changed state on the last tick render animated (the word gaining the highlight and the word losing it, tracked via a prevIndex ref); the rest of the paragraph stays plain Text, so a long paragraph never carries hundreds of animated nodes. Distant passed/upcoming flips on multi-word jumps cut instantly, which is the prompt's sanctioned cheap approach. Crossfade also snaps under system reduce motion, matching the web's transition kill.

**4. Highlight pill overhangs word by 4px each side** (done)

paddingHorizontal: 4 with marginHorizontal: -4 on every word (plus the existing borderRadius: 4). The padding and negative margin cancel in Yoga's flexWrap math, so line breaks and effective word spacing are unchanged while the pill extends 4px past the glyphs. Tap targets get 4px wider per side (an improvement) and the onLayout y bookkeeping for auto-centering is untouched since only horizontal geometry changed.

**5. Word gap is 0.25em of paragraph font size** (done)

columnGap now computed inline as displaySize * 0.25 (8.4px standalone at displaySize 33.6, 6px in hybrid at displaySize 24); the fixed columnGap: 8 was removed from the paraWrap stylesheet entry. Container padding kept at 16px since the web's 32px only applies at 640px+ viewports.

### Judgment calls made during implementation

1) Crossfade scope: implemented the prompt's recommended cheap path, animating only the two words that changed state per tick instead of per-word animated styles, bounding the cost to two animated nodes per paragraph. 2) Reduce motion: used reanimated's ReduceMotion.System option on both the slide-in and the color fade rather than AccessibilityInfo plumbing; the web's prefers-reduced-motion block kills both animations AND transitions, so both now snap natively too. 3) Easing fidelity: the color fade uses Tailwind's real transition curve cubic-bezier(0.4, 0, 0.2, 1) (what transition-colors actually ships), not linear; the slide-in uses the exact CSS ease-out bezier rather than the Easing.out(Easing.cubic) fallback. 4) The transparent pill state is focal color at alpha 0 (t.focalA(0)) instead of the 'transparent' keyword so the background interpolation stays inside the focal hue rather than fading through black. 5) Scale applied directly on Text, not a wrapping View, since the prompt prefers that and nothing forced the fallback; flagged for device check. 6) Version bump: the working tree was clean and app.json was already committed at 0.7.5 (the 0.7.3 bump mentioned in the run instructions had long since landed), so per the standing rule I bumped it to 0.7.6 for this change round. 7) Ignored the preview-server verification hook: the prompt forbids using the Expo web build for verification and this package is native-only.

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
