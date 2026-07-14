# Paragraph Display Visual Polish (Native Parity Package 14)

**Done.** Implemented and committed as `269e27b` on `feat/native-ui-web-parity`, 2026-07-13, independent review passed with no unresolved findings. This package brought the native paragraph reading view up to exact visual parity with the web app on five fine details.

## What this fixed

Before this, the native paragraph view read close to the web but felt subtly off in five ways: the active word stayed the same size as its neighbors instead of popping slightly, new paragraphs hesitated at the start of their slide because the easing began slow, word colors cut hard from one to the next instead of crossfading, the highlight pill hugged the glyph box exactly instead of overhanging the word, and the gap between words was a fixed pixel value that ran too wide in hybrid mode. This package matched all five to the web: the active word pops to 105% size, the paragraph slides in with a decelerating ease out curve, word colors crossfade over 100ms, the highlight pill overhangs the word by 4px on each side without moving neighbors, and the word gap scales with the paragraph font size.

## What changed

Files changed: `src/reader/displays.tsx`, `app.json`.

### 1. Active paragraph word scales to 105%

The web (`src/components/Reader/ParagraphDisplay.tsx:229-247`) gives the active word span the classes `bg-focal/20 text-focal scale-105` together with `inline-block`, so the current word renders 5% larger than its neighbors. The scale applies instantly, with no animation, because the span only transitions colors (`transition-colors`), not transform. Because it is an inline block scale, the enlarged word overlaps its neighbors slightly without reflowing the line. Native previously gave the active word the focal color and a `t.focalA(0.2)` background only, with no scale, so the word stayed at normal size.

A static `transform: [{ scale: 1.05 }]` was added to the active word's style, applied instantly with no animation, alongside the focal color and the 20% focal background. RN transforms never affect layout, so the pop overlaps neighbors without reflowing the line, matching the web's inline-block scale. It was applied directly on the `Text` element (the prompt's first-choice approach); the `View`-wrapper fallback was not needed for types or layout math, though on-device rendering quality is Michael's to confirm.

### 2. Paragraph slide in uses the CSS ease out curve

The web (`src/index.css:97-106` and `src/components/Reader/ParagraphDisplay.tsx:201-224`) remounts each new paragraph keyed by its first token id and plays `para-enter-up` or `para-enter-down`: opacity 0 to 1 and translateY from plus or minus `enterDist` to 0, declared as `animation: 0.3s ease-out both`. CSS `ease-out` equals `cubic-bezier(0, 0, 0.58, 1)`, which decelerates from the very start. The distance and duration grow with how many paragraphs a flick jumped: `enterDist = 28 + (count - 1) * 42` pixels and `duration = 300 + (count - 1) * 150` ms. The paragraph enters from below when going forward and from above when going back. The animation is effectively disabled under `prefers-reduced-motion` (`src/index.css:150-153` forces `animation-duration` to 0.01ms with `!important`). Native's `EnterPara` previously drove opacity and translateY with `withTiming(1, { duration: dur })`, whose default `Easing.inOut(Easing.quad)` starts slow, so the paragraph appeared to hesitate before sliding in.

`EnterPara`'s `withTiming` now uses `Easing.bezier(0, 0, 0.58, 1)`, the exact CSS ease out, defined as the module constant `EASE_OUT`. `Easing` was added to the reanimated import. The distance and duration jump scaling and the direction flip were left untouched, since they already matched. Reduce motion is honored via `ReduceMotion.System` on the timing config, which snaps to the end state exactly like the web's `prefers-reduced-motion` animation kill.

### 3. Word colors crossfade over 100ms

The web (`src/components/Reader/ParagraphDisplay.tsx:234-242`) carries `transition-colors duration-100` on every word span. As playback advances, each word's text color and highlight background crossfade over 100ms between three states: active is focal text plus `focal/20` background, passed is `mocha/50`, upcoming is `espresso/85`. Native previously changed colors and background instantly on index change, so the highlight jumped with a hard cut.

A new `FadingWord` component was added: an `Animated.Text` whose color and background color run through `interpolateColor`, driven by a 100ms `withTiming` using Tailwind's actual transition curve `cubic-bezier(0.4, 0, 0.2, 1)`. Only the two words that changed state on the last tick render animated, the word gaining the highlight and the word losing it, tracked via a `prevIndex` ref; the rest of the paragraph stays plain `Text`, so a long paragraph never carries hundreds of animated nodes. Distant passed and upcoming flips on multi word jumps cut instantly, which is the prompt's sanctioned cheap approach. The passed and upcoming alpha colors are `t.mutedA(0.5)` and `t.inkA(0.85)`. The crossfade also snaps under system reduce motion, matching the web's transition kill.

### 4. Highlight pill overhangs the word by 4px each side

The web (`src/components/Reader/ParagraphDisplay.tsx:234-242`) gives word spans `rounded px-1 -mx-1 inline-block`: 4px horizontal padding cancelled by a negative 4px margin, so the `focal/20` background pill overhangs the word by 4px on each side, with a 4px corner radius, without shifting neighboring words. Native previously applied `borderRadius: 4` and the `t.focalA(0.2)` background directly to the `Text`, so the pill was exactly the glyph box, visibly tighter than web.

Every word now carries `paddingHorizontal: 4` with `marginHorizontal: -4`, alongside the existing `borderRadius: 4`. The padding and negative margin cancel in Yoga's flexWrap math, so line breaks and effective word spacing are unchanged while the pill extends 4px past the glyphs. Tap targets get 4px wider per side, an improvement, and the `onLayout` y bookkeeping for auto centering was untouched since only horizontal geometry changed.

### 5. Word gap is 0.25em of the paragraph font size, not a fixed 8px

The web (`src/components/Reader/ParagraphDisplay.tsx:220-224` and `205-217`) uses `gap-x-[0.25em]` on the wrap row, so the gap scales with the computed `displaySize` (`Math.max(24, Math.min(fontSize * 0.6, 48))`, line 199). That gives 8.4px in the standalone paragraph view (displaySize 33.6 from the default reader font size 56) and 6px in hybrid mode (hybrid passes fontSize 28, so `28 * 0.6 = 16.8` clamps up to displaySize 24, and `24 * 0.25 = 6`). Container horizontal padding is `px-4 sm:px-8`, meaning 16px, and 32px only at viewports 640px or wider. Native previously used `paraWrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }`, a fixed 8 that roughly matched standalone (8 vs 8.4) but ran 33% too wide in hybrid mode (8 vs 6).

`columnGap` is now computed inline as `displaySize * 0.25` (8.4px standalone at displaySize 33.6, 6px in hybrid at displaySize 24), and the fixed `columnGap: 8` was removed from the `paraWrap` stylesheet entry. Container padding was kept at 16px, since the web's 32px only applies at 640px or wider viewports; that is left for if tablets become a target.

## Judgment calls

- **Crossfade scope.** Implemented the prompt's recommended cheap path, animating only the two words that changed state per tick rather than per-word animated styles, bounding the cost to two animated nodes per paragraph.
- **Reduce motion plumbing.** Used reanimated's `ReduceMotion.System` option on both the slide in and the color fade rather than `AccessibilityInfo` plumbing. The web's `prefers-reduced-motion` block kills both animations and transitions, so both now snap natively too.
- **Easing fidelity.** The color fade uses Tailwind's real transition curve `cubic-bezier(0.4, 0, 0.2, 1)` (what `transition-colors` actually ships), not linear; the slide in uses the exact CSS ease out bezier rather than the `Easing.out(Easing.cubic)` fallback.
- **Transparent pill hue.** The transparent pill state is focal color at alpha 0 (`t.focalA(0)`) instead of the `transparent` keyword, so the background interpolation stays inside the focal hue rather than fading through black.
- **Scale on Text, not a wrapping View.** The 1.05 scale was applied directly on `Text` since the prompt prefers that and nothing forced the fallback; flagged for the device check.
- **Version bump.** The working tree was clean and `app.json` was already committed at 0.7.5, so per the standing rule it was bumped to 0.7.6 for this change round.

## Check on your phone

Open a book in Paragraph mode and press play, then confirm each of these on the real APK:

- [ ] Confirm: the word being read looks about 5% larger than its neighbors, and it pops to that size instantly on each step without pushing the other words around or reflowing the line.
- [ ] Confirm: swiping to a new paragraph glides it in fast then settles softly, with no hesitation at the start; bigger flicks travel farther and take longer, and going backward it enters from the other direction.
- [ ] Confirm: as reading moves word to word, the text colors and the highlight background melt from one to the next over about 100ms instead of blinking.
- [ ] Confirm: the highlight bubble behind the active word sticks out about 4px past the letters on each side with rounded corners, and word spacing looks unchanged.
- [ ] Confirm: in Hybrid mode, the small context paragraph at the bottom has its words sitting a touch closer together than in the standalone paragraph view (about 6px versus 8.4px).

Everything else in this package (the type check staying clean, the two-node animation budget, the tap-target geometry, and the auto-centering `onLayout` bookkeeping) was verified in code and by review.
