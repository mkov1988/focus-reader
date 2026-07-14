# Native Reader Displays: Real Text Measurement and Centering Parity

**Done.** Implemented and committed as `8e27908` on `feat/native-ui-web-parity`, 2026-07-13, independent review passed with no unresolved findings. This package replaced the reader displays' per character width guesses with real Fraunces 400 text measurement and fixed every piece of geometry that depended on those guesses.

## What this fixed

The native reader used to estimate every word's width with a flat 0.58em per character, because React Native has no synchronous canvas measurement like the web's `ctx.measureText`. That single approximation warped the geometry in three displays. The trail view's focal letter drifted off screen centre whenever the two sides had uneven ghosts, the sentence strip floated narrow words in oversized boxes and truncated wide words like CHAPTER with a trailing ellipsis, and long words shrank earlier and harder than they should. The paragraph view had a separate bug where the highlighted word sat about 128px low. This package built a shared measurement utility, rebuilt the trail and strip layouts on real widths, corrected the shrink math and the paragraph centering, and cleaned up four small visual constants, so all five displays now match the web word for word.

## What changed

### Text measurement utility (new `src/reader/measureText.tsx`)

There was no way to measure real text in the native reader, so every display fell back to a flat 0.58em per character estimate. The web caches canvas measurements in a `Map` per word and clears that cache when the font size changes. The new utility is the recommended hybrid: a glyph advance table, warmed once through hidden `onTextLayout` probes, answers synchronously, and exact per string widths overwrite the estimate a frame later. Everything is measured at one 100px reference size and scaled, so a measurement at the base size is a stable fixed point and font size changes need no cache flush. It exposes `measureTextWidth`, `useTextMeasurement` (a re-render subscription), and a hidden `MeasureHost` mounted inside each measuring display. Font is Fraunces 400 (`FONTS.serifRegular`), normal style, normal weight.

### 1. Trail view: focal letter pinned to screen centre

The native trail was one centred flex row containing `[leftGhosts, before, focal, after, rightGhosts]`, so the current word's position depended on the total width of the left versus right ghosts. At book start and end, or anywhere the two sides had lopsided widths, the focal letter sat visibly off centre. Ghost spacing was `marginHorizontal: ghostFontSize * 0.14` (0.28em between ghosts) instead of the web's measured anchor.

The web keeps the focal letter always pinned to the exact horizontal centre of a full width, `overflow: hidden` container of height `fontSize * 4` (224px), using three absolutely positioned `inset-0` layers. Layer A holds the current word: `before` anchored `right: calc(50% + halfFocalpx)`, `focal` at `left: 50%` with `translateX(-50%)` in the focal accent color, `after` at `left: calc(50% + halfFocalpx)`, where `halfFocal` is the measured focal width divided by 2. Layer B is the left ghosts, a `flex items-baseline gap-[0.3em]` row anchored `right: calc(50% + halfFocalpx)` with `marginRight: beforeWidth + 8px` (else `8px`) and `direction: rtl` so the nearest ghost sits 8px past the measured end of the current word. Layer C mirrors it with `marginLeft: afterWidth + 8px`. Ghosts render at `ghostFontSize = renderFontSize * 0.82` in muted ink and clip hard at the container edges.

`TrailDisplay` was rebuilt on that three layer geometry. The current word layer pins the focal box dead centre through equal flex sides, which produces geometry identical to the web's `left: 50%` `translateX(-50%)` pin but needs no measurement, so the pin never drifts while exact widths land. The ghost lanes are anchored at centre plus the measured `halfFocal` plus the measured `before` or `after` width plus 8px (just 8px when that half is empty), with the nearest ghost adjacent to the anchor, a 0.3em `columnGap` at the ghost size, and a hard clip at the container edges via `overflow: hidden`. This holds the user's red line from the RSVP work: the focal letter is always centred on screen.

### 2. Sentence strip: measured widths, even gaps, no ellipsis

The strip estimated widths with `estWordWidth = Math.max(fontSize * 0.4, word.length * fontSize * 0.58)`, used the wrong gap constant `displaySize * 0.5`, and laid each word into a fixed width `Text` with `numberOfLines={1}` and `textAlign: 'center'`. Narrow words like "ill" and "if" floated in huge boxes, wide words like "CHAPTER" and Roman numerals overran the estimate and truncated to "CHAPT…", and the animated worklet interpolated only between the prev, current, and next centres, extrapolating linearly past one word on a fast fling.

The web measures each word exactly with a canvas context, caches it in a `Map`, and clears the cache when `displaySize` changes. `displaySize = Math.max(32, Math.min(fontSize * 0.8, 64))`, which is 44.8 at the 56 base. Cumulative lefts advance `x += width + gap` with `gap = displaySize * 0.4` (about 17.9px), words are absolutely positioned `whitespace-nowrap` spans with no width box at `top: 50%` `translateY(-50%)`, opacity is `Math.max(0.2, 1 - dist * 0.16)`, and the transform interpolates across the true centres of the whole window of 9 each side through a mids map, `at = m0 + (m1 - m0) * (f - i0)`.

Word positions now come from `measureTextWidth` at `displaySize` with cumulative lefts plus the gap. The gap constant was already `0.4` in the committed tree, so it was verified rather than re-changed. The fixed width, `numberOfLines`, and `textAlign` were removed so nothing can truncate, and the strip carries an explicit width with 4em of slack so no box is ever clamped (`lineHeight: stripH` is kept for vertical centring). The worklet now interpolates across the full window through a plain array of centres plus the window's first index, clamped at the window edges, so a fast fling tracks real geometry the whole way. The playback pin to the committed index and the scrub follow of `pos` are unchanged.

### 3. Long word shrink from real measurement

`fitFontSize` estimated each half as `charCount * 0.58` em plus `0.5 * 0.58` em for the focal. That 0.58em per character constant is generous for Fraunces, so native shrank words the web would leave at full size, shrank earlier and by more, and was blind to glyph shapes, so "illicit" shrank as if it were as wide as "mammoth". The margin and floor constants `FIT_SIDE_MARGIN = 14` and `MIN_SCALE = 0.5` already matched the web.

The web measures `before + halfFocal` and `after + halfFocal` with the element's real computed font at the base size, sets `availableHalf = containerWidth / 2 - 14`, and only if the longer half exceeds it shrinks by the exact ratio `availableHalf / longerHalf`, floored at 0.5. `fitFontSize` now measures the `splitWord` halves plus half the focal in Fraunces 400 at the base size through the utility, cached per string, keeping the `containerW / 2 - 14` threshold, the exact ratio shrink, and the 0.5 floor. This one fix serves the reel, the trail, and the hybrid view. `splitWord` and `effectiveBaseFontSize` were left untouched.

### 4. Paragraph auto centering plus the 128px content padding

The paragraph scroll target was `target = Math.max(0, wordY - layoutH / 2 + lineHeight / 2)`, where `wordY` is the word's `onLayout` y relative to the inner `paraWrap` view. The scroll content begins with `paddingVertical: 128` (`s.paraContent`), so the word's y in content coordinates is `wordY + 128` and every mid paragraph scroll landed 128px short, leaving the active word about two lines low at the 33.6px paragraph type. The web is padding independent: it measures `diff = elementCenter - containerCenter` from real rects and scrolls only when `|diff| > 2` px, instant on the first move then smooth.

A shared `PARA_PAD_V = 128` constant now feeds both the `s.paraContent` style and the scroll target (`wordY + PARA_PAD_V - layoutH / 2 + lineHeight / 2`), so the active word sits at the vertical centre of the card. The web's skip when the correction is 2px or less was added, and the existing instant then smooth behavior was preserved.

### 5. Focus reel "Ready" empty state font size

The reel's empty state rendered "Ready" at a hardcoded `fontSize: 24`. The web keeps the guide frame in a `fontSize * 4` (224px) box and lets the centred "Ready" span inherit the `fontSize` prop (56, wired from `DEFAULT_FONT_SIZE`) in muted ink Fraunces 400. It now renders at the display's `fontSize` prop (56), color `t.textMuted`, `FONTS.serifRegular`, inside the guide frame. This state is nearly unreachable, since both platforms gate the reader behind a successful parse, so it is cosmetic only.

### 6. Trail "Ready" empty state font size

The trail's empty state had the same hardcoded `fontSize: 24`. It now renders "Ready" at the display's `fontSize` prop (56) in Fraunces 400, color `t.textMuted`, inside the guide frame, the same fix as issue 5.

### 7. Farthest ghost opacity floor

Native's ghost opacity floor was `Math.max(0.06, 1 - i * 0.2)`, so the fifth ghost sat at 6 percent. The web uses `Math.max(0.04, 1 - i * 0.2)` for i = 1 to 5, giving 0.8, 0.6, 0.4, 0.2, 0.04. The native floor is now `0.04`, so the fifth ghost sits at 4 percent. `TRAIL_COUNT = 5` and the 0.2 falloff already matched.

### 8. Trail rows ride 4px above the guide frame centre

The single native trail row was centred exactly through `justifyContent: 'center'` with no offset, so the text sat 4px lower than on the web. The web wraps all three layers in `inset-0 flex items-center` boxes with `marginTop: '-8px'`, which stretches each box from y = -8 to y = 224 (resolved height 232) so the centred text line lands at y = 108, a net 4px above the geometric centre (112) of the 224px frame. All three rebuilt trail layers (the word layer and both ghost lanes) now carry `translateY(-4)` so they share one baseline. The Focus reel intentionally does not get the nudge, since the web reel is exactly centred (`top: '50%'`, `translateY(calc(-50% + offsetY))`, no margin), so the trail alone rides 4px high. This is strict parity with the web, and it is flagged below in case Michael prefers cross mode consistency instead.

## Judgment calls

- **Version bump.** `app.json` was clean and already committed at 0.7.4, with no uncommitted 0.7.3 bump to preserve, so per the standing rule to bump every change round it was moved from 0.7.4 to 0.7.5.
- **Sentence gap already fixed.** The `displaySize * 0.4` gap was already in the committed tree from another session, so it was verified rather than re-changed.
- **Focal pin construction.** The current word keeps the equal flex `FocalWord` construction instead of measured absolute spans, because it produces geometry identical to the web pin without depending on measurements, so the pin cannot shift while exact widths land. Measurements only position the ghost lanes.
- **Ghost lanes.** The ghost rows live in 4000px wide invisible lanes anchored by inset with the row packed against the anchor edge, sized so Yoga can never clamp the row below its content (which would spill ghosts past the anchor). This also means the ghost words themselves never need measuring.
- **Reference size scaling.** Measurement happens at one 100px reference size and scales linearly, so the base size fixed point holds by construction and no cache flush is needed on font size changes.
- **MeasureHost placement.** `MeasureHost` is mounted inside each measuring display, since only one display is ever mounted at a time, to keep displays self contained instead of editing `ReaderScreen`.
- **Worklet fallback.** The worklet fallback beyond the rendered window clamps to the window edge centre, the natural extension of the web's mids map fallback.
- **2px scroll skip.** The optional 2px scroll skip was added to the paragraph view, since the prompt called it harmless and it matches the web.
- **Trail 4px nudge is trail only.** Matching the web means the trail rides 4px high relative to the reel (issue 8); flagged so Michael can decide whether he prefers cross mode consistency.

## Check on your phone

- [ ] Confirm: in trail view at the very first word of a book, the big word sits exactly in the middle of the screen with the faded words trailing off to the right only.
- [ ] Confirm: in trail view, scrub to a spot where one side has much longer words than the other, and the bright focal letter stays glued to the middle.
- [ ] Confirm: in sentence view, find a chapter heading like CHAPTER I and the whole word is visible with no dots at the end, with even spacing between words.
- [ ] Confirm: in paragraph view, read a few lines into a long paragraph and the highlighted word stays in the middle of the card instead of drifting toward the bottom.
- [ ] Confirm: very long words shrink only when they truly need to, and about as much as on the web version.
- [ ] Confirm: in trail view, scrub through and the ghost spacing looks even with the words never overlapping.

Everything else in this package (the measurement utility internals, the two nearly unreachable "Ready" empty states, the 0.04 ghost opacity floor, and the 4px trail row offset) was verified in code and by review.
