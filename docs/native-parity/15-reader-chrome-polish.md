# Reader chrome controls polish

> **Status: implemented and committed 2026-07-13.** Commit `8a14767` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings. Fades use the curve Tailwind actually ships for ease-out, cubic-bezier(0, 0, 0.2, 1), not the CSS keyword value the prompt named.


## Mission

Bring six small pieces of the native reader chrome to exact web parity: stroke outline play/pause glyphs, a 200ms animated visualization pill with no extra haptic, a 75ms eased progress bar fill, CSS `ease-out` easing on the chrome and header fades, Inter typography on the progress labels and scrubber peek, and slider accessibility on both tracks. Every change is small and surgical. Do not refactor beyond what each issue requires.

## Context

Focus Reader is a cozy speed reading app for public domain books. It exists in two repos:

- Web app (READ ONLY source of truth for look and behavior): `C:/Users/Michael/Desktop/Focus Reader`. Never modify anything in this repo. Open its files only to confirm the target behavior.
- Native Android app (ALL changes go here): `C:/Users/Michael/Desktop/Focus Reader Android`. Expo SDK 54, React Native 0.81, reanimated 4, gesture-handler 2.28, zustand, expo-image, expo-haptics, lucide-react-native, react-navigation native-stack.

The native app is a full React Native app. Never introduce a WebView for any purpose.

Relevant native files: `src/reader/ReaderChrome.tsx` (the VisualizationSelector pill row plus the Controls component with the progress bar, labels, playback buttons, and the paragraph scrubber face), `src/screens/ReaderScreen.tsx` (chrome fade), `src/components/InnerPageHeader.tsx` (header collapse), `App.tsx` (font loading), `src/theme.ts` (the `FONTS` map and `useTheme`).

## Before you start

**WARNING, OVERLAPS THE ACTIVE READER FIX SESSION:** another Claude session is actively fixing the reader and holds uncommitted changes in `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, `src/reader/useReelEngine.ts`, and `app.json` (there may also be an untracked `metro.config.js`). Audit the current working tree before touching `ReaderChrome.tsx`, read the current file state before every edit, and never revert or reformat changes you did not make. Keep your edits tightly scoped to the exact lines each issue names.

1. Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect branch `feat/native-ui-web-parity`. Expect the uncommitted files listed above; that is normal, do not clean them up.
2. This package ideally runs after the `typography-and-type-metrics` package. That package is responsible for loading an Inter italic face. Check `src/theme.ts` for an Inter italic entry in `FONTS` before adding one yourself (details in issue 5).
3. Line numbers below were verified on 2026-07-13 against the current working tree (uncommitted edits included). If a listed line number has drifted, trust the described behavior and re-locate the code.

## Issues to fix

### 1. Play/pause glyphs are solid filled, web uses stroke outlines

Web (`src/components/Reader/Controls.tsx:353-364`): the coral play button (`p-5`, `rounded-full`, `shadow-lg shadow-coral-accent/30`) renders lucide `Play`/`Pause` at 32px (`w-8 h-8`) with lucide defaults: `stroke='currentColor'` (white), `fill='none'`, 2px stroke weight. The glyphs are outlined, not filled. `Play` gets `ml-1` (4px) for optical centering.

Native (`src/reader/ReaderChrome.tsx:106-110`, inside `PlaybackButtonRow`): both icons pass `fill="#fff"` (lines 108 and 109), rendering solid filled glyphs. Size 32, color `#fff`, padding 20, `marginLeft: 4` on `Play`, and the shadow already match.

Change: drop the `fill` prop (or set `fill="none"`) on both `Play` and `Pause` so the glyphs render as white 2px outlines like web. `lucide-react-native` defaults to stroke only, so removing the prop is enough. Touch nothing else in the row.

### 2. Visualization pill switches instantly and fires an extra haptic

Web (`src/components/Reader/VisualizationSelector.tsx:21-41`): each mode button has `transition-all duration-200`, so the coral background, white icon, `shadow-lg`, and `scale-105` of the active pill animate in over 200ms when the mode changes. Order and icons: Focus=`Eye`, Ghost Trail=`ScanLine`, Sentence=`AlignLeft`, Paragraph=`AlignJustify`, Hybrid=`Layers`, all size 20, in an espresso 6% pill with 8px gaps. Web (`src/components/Reader/ReaderView.tsx:78-83`): `onChange` fires `onActivity` then `onChangeVisMode`. No haptic. The web reserves haptics for the surface tap peek, the menu, errors, and commit moments.

Native (`src/reader/ReaderChrome.tsx:36-60`): `onPress` at line 48 fires `haptics.tick()` in addition to `onInteract()` and `setVisMode(key)`, and the active styling (accent background, `scale: 1.05`, elevation/shadow) at lines 49 to 52 applies instantly as a plain conditional style. Icons, order, sizes, and the container already match.

Change: remove `haptics.tick()` from the mode `onPress` (keep `onInteract()` and `setVisMode(key)` in that order), and animate the active pill's background and scale over 200ms using reanimated `withTiming(..., { duration: 200 })`. A clean approach: extract a small per mode button component that holds a shared value driven by `active`, with an animated style interpolating background color (transparent to `t.accent`) and scale (1 to 1.05), wrapped in an `Animated.View` inside or around the `Pressable`. The icon color swap (white when active, `t.textMuted` otherwise) may stay an instant prop; the required animation is background and scale. Keep the shadow appearing with the active state.

### 3. Progress bar fill jumps per word, web eases it over 75ms

Web (`src/components/Reader/Controls.tsx:314-326`): the coral fill inside the 8px rail has `transition-all duration-75` (line 317), so each word advance eases the width over 75ms, giving the bar a subtle glide during playback. The 16px knob (`ring-2 ring-cream`, `shadow-md shadow-coral-accent/40`) has only `transition-transform` (a hover scale), so its left position moves stepwise without easing.

Native (`src/reader/ReaderChrome.tsx`, playback face around lines 315 to 323): the fill width (line 320, `width: `${chapterInfo.progress}%``) and the knob `left` (line 322) are plain style props re-rendered on every index change. Both step instantly. The knob's per step jump already matches web; only the fill differs.

Change: drive the fill width through an animated value with a 75ms timing on change, knob stays instant. For example: a `useSharedValue` holding the progress percent, a `useEffect` (or direct assignment in render logic) setting `sv.value = withTiming(chapterInfo.progress, { duration: 75 })`, and an animated style `{ width: `${sv.value}%` }` on an `Animated.View` replacing the inner fill `View`. Reanimated retargets smoothly when a new timing starts mid flight, which matches the web behavior at high WPM.

Optional note for a later shadow pass, not required here: web's knob shadow is coral tinted (`shadow-coral-accent/40`) while native uses `shadowColor: '#000'` on both knobs (styles `knob` and `bigKnob`, lines 362 to 371).

### 4. Chrome and header fades use the wrong easing curve

Web: the selector and controls fade with `transition-opacity duration-300 ease-out` (`src/components/Reader/ReaderView.tsx:79` and `:168`), and the header collapses `grid-template-rows` 1fr to 0fr plus opacity with the same 300ms `ease-out` (`src/components/InnerPageHeader.tsx:37`). CSS `ease-out` is `cubic-bezier(0, 0, 0.58, 1)`: fast start, soft landing. Timing triggers: fade out 100ms after play starts, back instantly on pause, re-hide 3000ms after the last peek or activity. All of those triggers are already matched on native (both immersive hooks use the 100ms fade delay and 3000ms idle; `PLAY_FADE_DELAY_MS` 100, `IDLE_TIMEOUT_MS` 3000). Do not touch the delays.

Native: `withTiming(..., { duration: 300 })` with no easing option, which defaults to reanimated's `Easing.inOut(Easing.quad)`, a slower start and a different feel. Two call sites:

- `src/screens/ReaderScreen.tsx:115`: `chromeSV.value = withTiming(chromeVisible ? 1 : 0, { duration: 300 })`
- `src/components/InnerPageHeader.tsx:31`: `shown.value = withTiming(collapsed ? 0 : 1, { duration: 300 })`

Change: pass `easing: Easing.bezier(0, 0, 0.58, 1)` in the options of both `withTiming` calls. Import `Easing` from `react-native-reanimated` in each file. Both sides already retarget smoothly when interrupted mid fade, so the curve is the only difference.

### 5. Progress labels and scrubber peek use the wrong typefaces

Web: the body font is Inter (`src/index.css:42-49`). The progress readout row under the bar ("<Chapter title>: word X of Y" on the left, "NN%" on the right, `src/components/Reader/Controls.tsx:327-330`) is Inter 400 14px in mocha; the left span may wrap rather than truncate on web (native truncates to one line, which was not flagged as a required change, leave it). The scrubber peek snippet (`Controls.tsx:198-208`, first 9 words as a curly quoted string with an ellipsis, or an em dash when empty) is Inter 400 italic 14px mocha with truncate. The peek chapter kicker above it is Inter 500 12px uppercase coral with `tracking-wide`, which is 0.025em, meaning 0.3px letterspacing at 12px.

Native (`src/reader/ReaderChrome.tsx`): the two label `Text`s (lines 326 and 329) set no `fontFamily`, so they render in Android's default Roboto. The snippet (line 260) uses `FONTS.serifItalic`, which maps to `Fraunces_400Regular_Italic` (`src/theme.ts:101`), a serif italic instead of Inter italic. The kicker (line 256) already uses `FONTS.sansMedium` correctly but sets `letterSpacing: 0.6`, double the web's 0.3. `App.tsx` (lines 49 to 52) currently loads only upright Inter weights 400/500/600/700 plus the Fraunces faces; no Inter italic is bundled yet.

Change, three parts:

1. Set `fontFamily: FONTS.sans` on both progress label `Text`s (the "word X of Y" label and the percent label).
2. Render the snippet in Inter 400 italic. First check `src/theme.ts` for an Inter italic entry in `FONTS` (the `typography-and-type-metrics` package may have added one, for example `sansItalic`). If it exists, use it. If not: import `Inter_400Regular_Italic` from `@expo-google-fonts/inter` in `App.tsx`, add it to the `useFonts` map, add `sansItalic: 'Inter_400Regular_Italic'` to `FONTS` in `src/theme.ts`, then use `FONTS.sansItalic` on the snippet `Text` (keep `fontStyle` off, the face itself is italic).
3. Change the kicker's `letterSpacing` from 0.6 to 0.3.

The copy, the 9 word slice, the curly quote characters, and the em dash fallback already match exactly. This issue is purely typeface and spacing.

### 6. Progress bar and paragraph scrubber lack slider accessibility

Web: the main progress track (`src/components/Reader/Controls.tsx:292-300`) is `role='slider'` with `aria-label='Chapter Progress'`, `aria-valuenow={chapterInfo.currentInChap}`, `aria-valuemin={1}`, `aria-valuemax={chapterInfo.totalInChap}`, and `tabIndex={0}`. The scrubber track (`Controls.tsx:222-231`) is `role='slider'` with `aria-label='Scrub by paragraph'`, `aria-valuenow={peek.pIdx}`, `aria-valuemin={0}`, `aria-valuemax={Math.max(0, paragraphs.length - 1)}`, and `tabIndex={0}`.

Native (`src/reader/ReaderChrome.tsx`): both tracks are bare `Animated.View`s inside `GestureDetector`s with no accessibility props. The main track is the `Animated.View` with style `s.mainTrackHit` (around lines 315 to 323); the scrubber track is the one with style `s.scrubTrackHit` (around lines 276 to 290). All the `Pressable` buttons already carry `accessibilityLabel`s matching the web aria labels; only the two tracks are missing. TalkBack users currently cannot perceive or adjust either track.

Change: on the main track `Animated.View` add `accessibilityRole="adjustable"`, `accessibilityLabel="Chapter Progress"`, and `accessibilityValue={{ min: 1, max: chapterInfo.totalInChap, now: chapterInfo.currentInChap }}`. On the scrubber track `Animated.View` add `accessibilityRole="adjustable"`, `accessibilityLabel="Scrub by paragraph"`, and `accessibilityValue={{ min: 0, max: Math.max(0, paragraphs.length - 1), now: peek.pIdx }}`.

## Acceptance checklist

- [ ] The play and pause glyphs in the big coral button render as white outlines (2px stroke, hollow inside), not solid white shapes.
- [ ] Tapping a visualization mode animates the coral background and the 1.05 scale onto the new pill over 200ms, and mode switching produces no haptic tick.
- [ ] During playback the chapter progress fill glides between word positions over 75ms instead of stepping, while the knob still steps instantly.
- [ ] The chrome fade (selector and controls) and the header collapse both start fast and land soft (CSS `ease-out` curve, `Easing.bezier(0, 0, 0.58, 1)`), still 300ms with the 100ms play delay and 3000ms idle re-hide untouched.
- [ ] The "Chapter: word X of Y" and percent labels render in Inter, the scrubber peek snippet renders in Inter italic (not Fraunces italic), and the peek kicker letterspacing is 0.3.
- [ ] With TalkBack, both the chapter progress bar and the paragraph scrubber announce as adjustable sliders named "Chapter Progress" and "Scrub by paragraph" with correct min, max, and current values.

## Verification

- Run `npx tsc --noEmit` in `C:/Users/Michael/Desktop/Focus Reader Android` and fix any errors you introduced.
- Reason through the running behavior carefully: the 75ms fill timing retargeting per word at high WPM, the 200ms pill animation when switching modes rapidly, the easing change not altering durations or delays, and the font entries actually existing in the `useFonts` map before `FONTS` references them.
- Do NOT use the Expo web build to verify anything. Its dev server opens blank localhost tabs in the real browser and the web bundle breaks on zustand's `import.meta`. Do not start it.
- On-device checking is done by Michael on his Android phone. End your summary by telling him exactly what to look at, in plain everyday English, for example: open any book in the reader. The big coral button should now show a hollow play triangle and hollow pause bars instead of solid white shapes. Tap the little eye and lines icons at the top; the coral highlight should slide onto the new one smoothly and your phone should not buzz. Press play and watch the progress bar; the coral line should flow along instead of ticking. Let the controls fade out after you press play; the fade should feel like it starts quick and settles gently, same as the top bar shrinking away. Open the scrubber (the list button); the quoted sentence preview should look like the app's normal clean text in italics, not the fancy book typeface. If you use TalkBack, the progress bar and the scrubber should now announce themselves and their position.

## Final note

When summarizing your work for Michael, use plain everyday language, no jargon, and avoid dashes in prose sentences; use commas or periods instead.

---

## Outcome, recorded 2026-07-13

Implemented in commit `8a14767` on `feat/native-ui-web-parity` in the native repo.

Files changed: `src/reader/ReaderChrome.tsx`, `src/screens/ReaderScreen.tsx`, `app.json`.

### Issue by issue

**1. Play/pause glyphs render as stroke outlines, not solid fills** (done)

Removed fill="#fff" from both Pause and Play in PlaybackButtonRow; lucide-react-native defaults to stroke only. Size, color, marginLeft and shadow untouched.

**2. Visualization pill animates over 200ms and drops the extra haptic** (done)

Removed haptics.tick() from the mode onPress (order kept: onInteract() then setVisMode(key); the haptics import is no longer used in ReaderChrome.tsx and was removed). Extracted a ModeButton component: a shared value driven by active tweens backgroundColor (accent at alpha 0 to accent, via interpolateColor) and scale (1 to 1.05) over 200ms with the reused PRESS_EASE curve (Tailwind's default transition curve, which is what the web's transition-all uses). Icon color and the active shadow stay instant per the prompt.

**3. Progress bar fill glides 75ms per word, knob steps instantly** (done)

Added a progress shared value in Controls retargeted with withTiming(progress, { duration: 75, easing: PRESS_EASE }) on every change; the inner fill is now an Animated.View with an animated percent width. The knob's left stays a plain style prop, stepping instantly like the web.

**4. Chrome fade and header collapse use the web's ease-out curve** (done)

ReaderScreen.tsx chrome fade now passes easing: Easing.bezier(0, 0, 0.2, 1) at 300ms; durations and the 100ms/3000ms triggers untouched. InnerPageHeader.tsx already had this exact easing from a previously committed pack, so no edit was needed there. Note the curve differs from the prompt's stated 0.58 value; see decisions.

**5. Progress labels in Inter, peek snippet in Inter italic, kicker letterspacing 0.3** (done)

Both progress label Texts got fontFamily: FONTS.sans; the peek snippet switched from FONTS.serifItalic to FONTS.sansItalic (entry already existed in src/theme.ts and Inter_400Regular_Italic was already in App.tsx's useFonts map, so no font loading changes); kicker letterSpacing changed 0.6 to 0.3.

**6. Both tracks announce as adjustable sliders to TalkBack** (done)

Main track: accessibilityRole adjustable, label Chapter Progress, value min 1 / max totalInChap / now currentInChap. Scrub track: label Scrub by paragraph, value min 0 / max paragraphs.length - 1 (floored at 0) / now peek.pIdx. Also added the accessible prop on both so TalkBack can actually focus them (web parity with tabIndex 0).

**Extra folded-in item: scrub peek snippet must be FONTS.sansItalic, not serifItalic** (done)

Verified against web Controls.tsx: the snippet span is text-sm text-mocha italic with no font-serif class, so it renders in Inter italic. Covered by the issue 5 change.

### Judgment calls made during implementation

1. Easing curve value: the prompt says to use Easing.bezier(0, 0, 0.58, 1), calling that CSS ease-out. But the web's classes are Tailwind utilities, and Tailwind 3.4 (confirmed in the web repo's package.json, with no transitionTimingFunction override in tailwind.config.js) maps ease-out to cubic-bezier(0, 0, 0.2, 1). The already committed InnerPageHeader fix uses exactly that curve with a comment explaining the same reasoning. So I used Easing.bezier(0, 0, 0.2, 1) in ReaderScreen.tsx to match the real web behavior and keep both fade sites consistent, rather than the prompt's stale value. 2. For the 200ms pill and 75ms fill animations I passed the repo's existing PRESS_EASE constant (cubic-bezier(0.4, 0, 0.2, 1), Tailwind's default transition curve) instead of leaving reanimated's default easing, because the web's transition-all utilities use that curve; the prompt's examples simply omitted easing. 3. The pill background interpolates from t.accentA(0) (the accent color at zero alpha) to t.accent instead of the literal 'transparent', so the tween keeps the coral hue while fading in rather than passing through a grey tint. 4. I added the accessible prop to both tracks beyond the exact props listed, because on Android a View with only accessibilityRole is not focusable by TalkBack; without it the required announcement never happens. 5. The state update said to preserve an uncommitted app.json bump from 0.7.2 to 0.7.3, but the working tree was actually clean at version 0.7.6, so there was nothing to preserve; per Michael's standing rule I bumped expo.version to 0.7.7 for this change round. 6. No changes to App.tsx or src/theme.ts were needed: the typography pack had already landed sansItalic in FONTS and Inter_400Regular_Italic in the useFonts map.

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
