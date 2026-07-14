# Native Reader Displays: Real Text Measurement and Centering Parity

> **Status: implemented and committed 2026-07-13.** Commit `8e27908` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings.


## Mission

Replace the per character width guesses in the native reader displays with real text measurement, then fix every piece of geometry that depends on them. Concretely: build a Fraunces 400 measurement utility, use it for the long word shrink logic and the sentence strip layout, rebuild the ghost trail display with the web's three layer absolute geometry so the focal letter is pinned to the exact centre of the screen, add the missing 128px padding term to paragraph auto centering, and fix four small visual constants (two "Ready" font sizes, a ghost opacity floor, a 4px row nudge).

**WARNING, read this first: another session is actively fixing the reader and may hold uncommitted changes in `src/reader/displays.tsx`, the main file you will edit. Audit the current working tree state of that file before touching it and coordinate your edits around whatever is already there. Never revert or blindly rewrite changes you did not make.**

## Context

Focus Reader is a cozy speed reading app for public domain books. There are two repos:

- **Web app, the READ ONLY source of truth for look and behavior:** `C:/Users/Michael/Desktop/Focus Reader`. Open its files to confirm behavior and constants. Never modify anything in this repo.
- **Native app, where ALL changes go:** `C:/Users/Michael/Desktop/Focus Reader Android`. Expo SDK 54, React Native 0.81, reanimated 4, gesture-handler 2.28, zustand, expo-image, expo-haptics, lucide-react-native, react-navigation native-stack.

This is a full React Native app. Never introduce a WebView.

Native files you will work with:

- `src/reader/displays.tsx` holds all five display modes (Focus reel, ghost trail, sentence strip, paragraph, hybrid) plus the shared `GuideFrame`, `estWordWidth`, and `fitFontSize` helpers.
- `src/theme.ts` exports `FONTS`; `FONTS.serifRegular` is `'Fraunces_400Regular'`, the reading serif used by every display.
- `src/textProcessing.ts` exports `splitWord(word, fitMode)` and `effectiveBaseFontSize(fontSize, fitMode)`, both of which already match the web exactly.

Shared facts: the reader base font size is 56 (`READER_FONT_SIZE` in native `displays.tsx`, `DEFAULT_FONT_SIZE` in web `src/App.tsx`). The reel and trail stage containers are `fontSize * 4` = 224px tall. The web measures text with a canvas 2D context (`ctx.measureText`), which React Native lacks; the absence of synchronous measurement is the root cause of every issue below.

## Before you start

1. Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect branch `feat/native-ui-web-parity`.
2. Expect uncommitted changes from another session in `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, `src/reader/useReelEngine.ts`, and `app.json` (a new `metro.config.js` may also be present). Read the current state of each file before editing, build on what is there, and do not revert changes you did not make.
3. Line numbers below were verified on 2026-07-13 but the overlapping session may shift them. If a listed line does not match, trust the described behavior and find the code again.

## Step zero: build the measurement utility

Create one shared Fraunces 400 text measurement utility (suggested new file: `src/reader/measureText.ts`) and consume it from issues 1, 2, and 3 below. Two workable designs; a hybrid of both is best:

1. **Per glyph advance table.** Render each glyph you care about (upper and lower case ASCII letters, digits, common punctuation, plus an average fallback for anything else) once at a reference size in hidden `Text` elements, capture widths via `onTextLayout`, and estimate any word's width as the sum of its glyph advances scaled by `fontSize / referenceSize`. Synchronous after warmup. It ignores kerning so it is approximate, but far closer to truth than the current flat 0.58em per character.
2. **Per word `onTextLayout` cache.** Render the words you currently need inside a hidden offscreen `View` (absolutely positioned, `opacity: 0`, non interactive), capture exact rendered widths via `onTextLayout` into a `Map` keyed by word plus size, and trigger one state bump when new widths land. Exact, converging one frame after a new word first appears; fall back to an estimate until then.

The hybrid: answer synchronously from the glyph table, and let exact per word measurements overwrite cache entries as they arrive. Whichever you build:

- Cache aggressively. The web caches canvas measurements in a `Map` per word and clears the cache when the font size changes.
- Always measure at the BASE font size, never the shrunk size, so the shrink math in issue 3 remains a stable fixed point (measuring again after a shrink must give the same answer).
- Font is Fraunces 400 (`FONTS.serifRegular`), normal style, normal weight, matching the web's canvas font string `${fontStyle} ${fontWeight} ${sizePx}px ${fontFamily}`.

## Issues to fix

### 1. Trail view: focal letter is not pinned to screen centre

Delta id: `displays-trail-focal-not-pinned-center`. Severity: high.

**Web** (`src/components/Reader/GhostTrailDisplay.tsx:121-216`, measurement at `71-77`): the focal letter of the current word is ALWAYS pinned to the exact horizontal centre of the container. The container is full width, `overflow: hidden`, height `fontSize * 4` (224px), with `fontSize` set to the fit shrunk `renderFontSize`. Inside it, three absolutely positioned layers each fill the container (`inset-0`), each a flex row with vertical centring and `marginTop: '-8px'` (see issue 8):

- **Layer A, current word:** three absolute spans in Fraunces serif, `whitespace-nowrap`. `before` is anchored `right: calc(50% + halfFocalpx)` so its right edge ends exactly where the focal half begins. `focal` sits at `left: 50%` with `translateX(-50%)`, in the focal accent color. `after` is anchored `left: calc(50% + halfFocalpx)`. `halfFocal` is the MEASURED pixel width of the rendered focal span divided by 2 (`getBoundingClientRect` in a `useLayoutEffect` that reruns whenever `before`, `focal`, `after`, or `renderFontSize` change). The same effect also measures `beforeWidth` and `afterWidth`.
- **Layer B, left ghosts:** an absolute row `flex items-baseline gap-[0.3em]` anchored `right: calc(50% + halfFocalpx)` with `marginRight: beforeWidth + 8px` when `before` is nonempty, else just `8px`, and `direction: rtl` so words flow right to left from the anchor. The ghost array is reversed so the nearest ghost sits closest to centre, exactly 8px past the measured end of the current word. Each ghost span sets `direction: ltr` so its own text reads normally.
- **Layer C, right ghosts:** the mirror. `left: calc(50% + halfFocalpx)`, `marginLeft: afterWidth + 8px` when `after` is nonempty else `8px`, normal flow, same 0.3em gaps.

Ghost styling: `fontSize` is `ghostFontSize = renderFontSize * 0.82`, muted ink color, opacity per issue 7. Ghosts overflow and clip hard at the container edges (`overflow: hidden`, no fade mask). Consequence: at the first word of a book (no left ghosts) the current word stays dead centre with ghosts extending right only. The focal letter never moves off centre regardless of ghost balance.

**Native** (`Focus Reader Android: src/reader/displays.tsx:276-290`, style `s.trailRow` at `:589`, ghost helper at `:262-270`): one centred flex row (`flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', paddingHorizontal: 8`) containing `[leftGhosts, before, focal, after, rightGhosts]` in document order. The whole ROW is centred, so the current word's position depends on the total width of left versus right ghosts; with unbalanced ghost widths, or at book start and end where one side has fewer or no ghosts, the current word and its focal letter sit visibly off centre. Ghost spacing is `marginHorizontal: ghostFontSize * 0.14` per ghost (0.28em between ghosts, roughly 0.14em from word to ghost) instead of 0.3em gaps plus the measured 8px anchor.

**Fix for parity:** rebuild `TrailDisplay` with the web's three layer absolute geometry. Measure the rendered pixel widths of the `focal`, `before`, and `after` runs at `renderFontSize` using the step zero utility (cache per word, the way the web caches via refs). Pin the focal letter's centre at container centre. Anchor `before` with its right edge at centre plus `halfFocal`. Left ghost row: right edge anchored at centre plus `halfFocal`, offset further left by `beforeWidth + 8` (just `8` when `before` is empty), nearest ghost adjacent to the anchor, gaps of 0.3em of `ghostFontSize` (React Native has no CSS `gap` with `direction: rtl`; use `flexDirection: 'row-reverse'` with margins, or compute absolute positions from the measured ghost widths). Mirror for `after` and the right ghosts with `afterWidth + 8`. Keep the hard clip at container edges.

This is the user's explicit red line from the RSVP work: the focal letter is always centred on screen; never reintroduce an off centre pin. The existing native comment ("sits at or very near screen centre") admits the approximation you are removing.

### 2. Sentence strip: estimated widths, uneven gaps, ellipsis truncation

Delta id: `displays-sentence-word-widths-estimated-and-truncating`. Severity: high.

**Web** (`src/components/Reader/SentenceDisplay.tsx:26-33, 77-114, 145-162, 186-201`): word widths are EXACT. Each word is measured once with a canvas 2D context using the strip's computed font (`${fontStyle} ${fontWeight} ${displaySize}px ${fontFamily}`), cached in a `Map`, cache cleared and remeasured when `displaySize` changes. `displaySize = Math.max(32, Math.min(fontSize * 0.8, 64))`, which is 44.8 at the 56 base. Cumulative lefts advance `x += width + gap` with `gap = displaySize * 0.4` (about 17.9px), so the visible gap between every pair of words is identical. Words are absolutely positioned spans with `whitespace-nowrap` and NO width box, at `top: 50%` with `translateY(-50%)`; nothing can ever truncate. Opacity is `Math.max(0.2, 1 - dist * 0.16)`, current word in the focal color. The imperative transform interpolates between the true centres of adjacent words across the whole window of 9 each side: a mids map from index to centre x, `at = m0 + (m1 - m0) * (f - i0)` where `m0`/`m1` are the centres of `floor(f)` and `floor(f) + 1`, so a fast fling tracks real geometry the whole way.

**Native** (`Focus Reader Android: src/reader/displays.tsx:47-49, 306-345, 357-384`): `estWordWidth = Math.max(fontSize * 0.4, word.length * fontSize * 0.58)`, a flat 0.58em per character regardless of glyph shapes. The gap is also wrong: `gap = displaySize * 0.5` at line 307 versus the web's 0.4. Each word is a fixed width `Text` with `numberOfLines={1}` and `textAlign: 'center'`: narrow glyph words ("ill", "if") get visually huge gaps, and wide words, all caps Gutenberg headings like "CHAPTER", Roman numerals, words heavy in m and w, exceed the estimate and get truncated with a trailing ellipsis ("CHAPT…"). The `stripStyle` worklet (`:338-345`) interpolates only between the prev, current, and next estimated centres, extrapolating linearly beyond one word during fast flings.

**Fix for parity:** position words from real rendered widths via the step zero utility (fall back to the estimate until a measurement lands; an `onTextLayout` fed cache converges one frame after a new word appears). Lay out lefts as cumulative measured width plus `displaySize * 0.4` (change the 0.5 constant to 0.4). Drop the fixed width and `numberOfLines` truncation entirely: no `width`, no ellipsize, single line by construction (keeping `lineHeight: stripH` for vertical centring is fine). Feed the animated interpolation the measured centres of the FULL window so the strip tracks real geometry beyond one word during a fling; the worklet currently receives three plain numbers, so pass a small plain array of centres plus the window's first index (at most 19 entries) or an equivalent shape reanimated is happy with. Keep the existing pin to the committed index during playback and follow `pos` while scrubbing.

The file header comment calls the analytic widths a deliberate stopgap to avoid async layout; this issue retires that stopgap.

### 3. Long word shrink uses a character count heuristic

Delta id: `displays-fit-shrink-heuristic-vs-measured`. Severity: medium.

**Web** (`src/hooks/useFitFontSize.ts:8-12, 47-99`): `FIT_SIDE_MARGIN = 14`, `MIN_SCALE = 0.5`. It measures the actual pixel width of `before + halfFocal` and `after + halfFocal` with a canvas using the element's REAL computed font at the BASE size (a stable fixed point: always measured at base, never at the shrunk size). `halfFocal` is half the measured focal width. `availableHalf = containerWidth / 2 - 14`. Only if the longer half exceeds `availableHalf` does the word shrink, by the exact ratio `availableHalf / longerHalf`, floored at scale 0.5. Normal words render at exactly the base size, and the shrink threshold matches what actually paints.

**Native** (`Focus Reader Android: src/reader/displays.tsx:43-60`): `fitFontSize` estimates each half as `charCount * 0.58` em, plus `0.5 * 0.58` em for the focal. The 0.58em per character constant is deliberately generous for Fraunces, so native shrinks words the web would leave at full size and shrinks earlier and by more, with no sensitivity to glyph shapes ("illicit" shrinks as if it were as wide as "mammoth"). `FIT_SIDE_MARGIN = 14` and `MIN_SCALE = 0.5` already match the web.

**Fix for parity:** replace the per character estimate with real measurement of the split halves (`splitWord(word, mode)`) in Fraunces 400 at the base size, measured once per word and cached (key on word, mode, and base size), keeping the same `containerW / 2 - 14` threshold, exact ratio shrink, and 0.5 floor, so shrink onset and amount match the web word for word. `fitFontSize` is consumed by `TrailDisplay` and by `FocusReelDisplay` (and through it the hybrid view), so this one fix serves all displays. `splitWord` and `effectiveBaseFontSize` already match the web; do not touch them.

### 4. Paragraph auto centering ignores the 128px content padding

Delta id: `displays-paragraph-autocenter-ignores-content-padding`. Severity: high.

**Web** (`src/components/Reader/ParagraphDisplay.tsx:172-195`): on every `currentIndex` change it measures REAL rects: `diff = elementCenter - containerCenter` from `getBoundingClientRect` of the active word span and the scroll container, then `container.scrollBy({ top: diff, behavior })` only when `|diff| > 2` px. This is padding independent; the active word is kept exactly at the vertical centre of the visible card (subject to scroll clamping at the extremes). The first positioning after a paragraph change is instant (`'auto'`), subsequent per word moves are `'smooth'`.

**Native** (`Focus Reader Android: src/reader/displays.tsx:440-448`, style at `:593`): computes `target = Math.max(0, wordY - layoutH / 2 + lineHeight / 2)` where `wordY` is the word's `onLayout` y RELATIVE TO the inner `paraWrap` view. But the scroll content begins with `paddingVertical: 128` (`s.paraContent`), so the word's y in content coordinates is `wordY + 128`. The `scrollTo` therefore lands 128px short and the active word sits about 128px below the card's vertical centre for the whole mid paragraph reading flow (roughly two lines low at the 33.6px paragraph type). Near the top of a paragraph the `Math.max(0, ...)` clamp masks the error; mid paragraph it is fully visible. Verified parent chain: the word `Text` reports `onLayout` against `paraWrap`, which sits inside `EnterPara` (zero layout offset) inside the content container that carries the padding, so the 128px error is exact.

**Fix for parity:** add the content container top padding to the target: `target = Math.max(0, wordY + 128 - layoutH / 2 + lineHeight / 2)`. Prefer deriving the 128 from the style (or a shared constant) instead of hardcoding it twice, or measure the word's y in content coordinates (`measureLayout` against the ScrollView's inner content), which stays correct if the `EnterPara` wrapper ever gains a layout offset. Keep the existing instant then smooth behavior (`shouldInstantScroll`). Optionally skip the scroll when the correction is 2px or less, like the web; harmless to add.

### 5. Focus reel "Ready" empty state renders at 24px

Delta id: `focusreel-ready-state-font-size`. Severity: low.

**Web** (`src/components/Reader/RSVPDisplay.tsx:104-116`): with `tokens.length === 0` the display keeps the guide frame in a `fontSize * 4` = 224px box whose inline style sets `fontSize` to the `fontSize` prop (56 as wired from App's `DEFAULT_FONT_SIZE`); the centred span "Ready" inherits that 56px, in the muted ink color, Fraunces 400.

**Native** (`src/reader/displays.tsx:163-171`): same 224px box, guide frame, muted Fraunces text, but `fontSize` is hardcoded to 24 (line 168).

**Fix for parity:** render "Ready" at the display's `fontSize` prop (56 by default), color `t.textMuted`, `FONTS.serifRegular`. This state is nearly unreachable on both platforms (both gate the reader behind a successful parse), so it is cosmetic only.

### 6. Trail "Ready" empty state renders at 24px

Delta id: `displays-trail-ready-font-size`. Severity: low.

**Web** (`src/components/Reader/GhostTrailDisplay.tsx:107-119`): when there is no current word, the container (height `fontSize * 4`, `fontSize: ${fontSize}px`) shows a centred span "Ready" in the muted ink serif (`text-mocha` maps to the muted text variable); it inherits the container font size, 56px.

**Native** (`Focus Reader Android: src/reader/displays.tsx:251-260`): shows "Ready" in Fraunces 400 at a hardcoded `fontSize: 24` (line 256), color `t.textMuted`, inside the guide frame.

**Fix for parity:** render "Ready" at the display's `fontSize` prop (56) in Fraunces 400, `t.textMuted`. Same shape of fix as issue 5; the two hardcodes are copies of each other.

### 7. Farthest ghost opacity floor is 0.06 instead of 0.04

Delta id: `displays-trail-min-ghost-opacity`. Severity: low.

**Web** (`src/components/Reader/GhostTrailDisplay.tsx:87`): ghost opacity is `Math.max(0.04, 1 - i * 0.2)` for i = 1..5, giving 0.8, 0.6, 0.4, 0.2, 0.04. The fifth ghost is nearly invisible at 4%.

**Native** (`Focus Reader Android: src/reader/displays.tsx:242`): `Math.max(0.06, 1 - i * 0.2)`, so the fifth ghost sits at 6%, slightly more visible.

**Fix for parity:** change the native floor to 0.04. `TRAIL_COUNT = 5` and the 0.2 falloff already match.

### 8. Trail rows should ride 4px above the guide frame centre

Delta id: `displays-trail-row-vertical-offset`. Severity: low.

**Web** (`src/components/Reader/GhostTrailDisplay.tsx:131, 158-161, 190-193`): all three layers (current word, left ghosts, right ghosts) are absolutely positioned `inset-0 flex items-center` wrappers with `style={{ marginTop: '-8px' }}`. Because top and bottom are both 0 with auto height, the negative top margin stretches each layer's box from y = -8 to y = 224 (resolved height 232), so the flex centred text line lands at y = 108, a net 4px above the geometric centre (112) of the 224px frame, visually balancing between the guide notches.

**Native** (`Focus Reader Android: src/reader/displays.tsx:276-290`): the single trail row is centred exactly via `justifyContent: 'center'` on the container with no offset, so the text sits 4px lower relative to the guide frame than on web.

**Fix for parity:** nudge the trail text rows up 4px net. Either apply `transform: [{ translateY: -4 }]` to each row, or reproduce the web construction with `marginTop: -8` on a row inside a vertically centring container (RN flexbox centres the margin box, yielding the same 4px up result). Apply the same offset to all three layers you build in issue 1 so the current word and both ghost rows share one baseline.

Important nuance, verified against the web source: the web Focus reel (`RSVPDisplay.tsx:148-157`) does NOT share this nudge; its rows are exactly centred (`top: '50%'`, `translateY(calc(-50% + offsetY))`, no margin). Matching the web therefore means the trail view alone rides 4px high relative to the reel. That is correct strict parity, but flag it in your summary so Michael can decide whether he prefers cross mode consistency instead.

## Acceptance checklist

- [ ] Trail view: at the first word of a book, the last word, and any word with lopsided neighbours, the focal letter sits at the exact horizontal centre of the screen; ghosts begin exactly 8px past the measured end of the current word, are spaced by 0.3em gaps, and clip hard at the container edges.
- [ ] Sentence strip: every pair of words shows the same visible gap (`displaySize * 0.4`); narrow words like "ill" no longer float in oversized boxes; wide words like "CHAPTER" render in full with no trailing ellipsis; a fast fling tracks real word centres across the whole window instead of extrapolating past one word.
- [ ] Long word shrink: onset and amount match the web word for word; normal words render at exactly the base size; a narrow word like "illicit" no longer shrinks as though it were as wide as "mammoth"; the `containerW / 2 - 14` threshold, exact ratio, and 0.5 floor are intact.
- [ ] Paragraph view: several lines into a long paragraph, the highlighted word sits at the vertical centre of the card instead of about 128px low.
- [ ] Focus reel empty state: "Ready" renders at the display's `fontSize` prop (56), muted serif, inside the guide frame.
- [ ] Trail empty state: "Ready" renders at the display's `fontSize` prop (56), muted serif, inside the guide frame.
- [ ] Trail view: the fifth ghost on each side renders at 0.04 opacity, not 0.06.
- [ ] Trail view: the word and ghost rows sit a net 4px above the guide frame's geometric centre, matching the web trail (and the summary flags that the web reel does not share this nudge).

## Verification

1. Run `npx tsc --noEmit` in `C:/Users/Michael/Desktop/Focus Reader Android` and get a clean pass.
2. Reason carefully through the running behavior: what renders on the very first frame before a measurement lands (the fallback path must not flash or misplace the focal pin), whether reanimated worklets only receive plain numbers or small plain arrays, whether measurement caches clear when the font size changes, and whether both empty states still center inside the guide frame.
3. Do NOT use the Expo web build to verify anything. Its dev server opens blank localhost tabs in the real browser and the web bundle breaks on zustand's `import.meta`.
4. On device checking is done by Michael on his Android phone. End your summary by telling him exactly what to look at, in plain everyday English without jargon. For example: open any book in the trail view and jump to the very first word, the big word should sit exactly in the middle of the screen with the faded words trailing off to the right only. Scrub to a spot where one side has much longer words than the other, the bright letter should stay glued to the middle. In the sentence view, find a chapter heading like CHAPTER I, the whole word should be visible with no dots at the end, and the spacing between words should look even. In the paragraph view, read a few lines into a long paragraph, the highlighted word should stay in the middle of the card instead of drifting toward the bottom. Very long words should shrink only when they truly need to, and about as much as on the web version.

## Final note

When summarizing your work for Michael, use plain everyday language, explain what changed and why it matters as if to a friend, and avoid dashes in prose. Restructure sentences with commas or periods instead.

---

## Outcome, recorded 2026-07-13

Implemented in commit `8e27908` on `feat/native-ui-web-parity` in the native repo.

Files changed: `src/reader/measureText.tsx`, `src/reader/displays.tsx`, `app.json`.

### Issue by issue

**Step zero: shared Fraunces 400 measurement utility** (done)

New src/reader/measureText.tsx, the recommended hybrid: a glyph advance table warmed once via hidden onTextLayout probes answers synchronously, and exact per string widths overwrite the estimate a frame later. Everything is measured at one 100px reference size and scaled, so base size measurement is a stable fixed point and font size changes need no cache flush. Exposes measureTextWidth, useTextMeasurement (re-render subscription), and a hidden MeasureHost mounted inside each measuring display.

**1. Trail view: focal letter pinned to screen centre** (done)

TrailDisplay rebuilt with the web's three layer geometry: current word layer pins the focal box dead centre via equal flex sides (identical result to the web's left 50% translateX(-50%), needs no measurement so the pin never drifts), ghost lanes are anchored at centre + measured halfFocal + measured before/after width + 8px (just 8px when that half is empty), nearest ghost adjacent to the anchor, 0.3em columnGap at the ghost size, hard clip at container edges via overflow hidden.

**2. Sentence strip: measured widths, even gaps, no ellipsis** (done)

Word positions now come from measureTextWidth at displaySize with cumulative lefts + gap; the gap constant was already 0.4 in the committed tree (the other session fixed it, prompt was stale there). Width boxes, numberOfLines, and textAlign removed so nothing can truncate; the strip gets an explicit width with 4em slack so no box is ever clamped. The worklet now interpolates across the FULL window via a plain array of centres plus the first index, clamped at the window edges; playback pin and scrub follow of pos unchanged.

**3. Long word shrink from real measurement** (done)

fitFontSize now measures the splitWord halves plus half the focal in Fraunces 400 at the BASE size via the utility (cached per string), keeping containerW/2 - 14, exact ratio shrink, and the 0.5 floor. Serves reel, trail, and hybrid. splitWord and effectiveBaseFontSize untouched.

**4. Paragraph auto centering + 128px padding term** (done)

Added shared PARA_PAD_V = 128 constant used by both the s.paraContent style and the scroll target (wordY + PARA_PAD_V - layoutH/2 + lineHeight/2). Also added the web's skip when the correction is 2px or less. Instant then smooth behavior preserved.

**5. Focus reel Ready at 24px** (done)

Now renders at the fontSize prop (56), t.textMuted, Fraunces 400, inside the guide frame.

**6. Trail Ready at 24px** (done)

Same fix as issue 5 in TrailDisplay's empty state.

**7. Ghost opacity floor 0.06 to 0.04** (done)

Math.max(0.04, 1 - i * 0.2); fifth ghost now 4%.

**8. Trail rows ride 4px above frame centre** (done)

All three trail layers (word layer and both ghost lanes) carry translateY -4 so they share one baseline. The Focus reel intentionally does NOT get the nudge, matching the web reel, so the trail alone rides 4px high; flagged for Michael in the summary.

### Judgment calls made during implementation

1) app.json state differed from the run brief: the tree was clean and already committed at 0.7.4 (no uncommitted 0.7.3 bump existed to preserve). Per the standing rule to bump every change round, I bumped 0.7.4 to 0.7.5. 2) The sentence gap was already 0.4 in the committed tree (another session's fix landed); I verified rather than re-changed it. 3) Trail focal pin: I kept the FocalWord equal flex construction for the current word instead of measured absolute spans, because it produces geometry identical to the web pin without depending on measurements, so the pin cannot shift while exact widths land; measurements only position the ghost lanes. 4) Ghost rows live in 4000px wide invisible lanes anchored by inset with the row packed against the anchor edge, sized so Yoga can never clamp the row below its content (which would spill ghosts past the anchor); this also means ghost words themselves never need measuring. 5) Measurement happens at one 100px reference size and scales linearly, so the base size fixed point holds by construction and no cache flush is needed on font size changes. 6) MeasureHost is mounted inside each measuring display (only one display is ever mounted at a time) to keep displays self contained instead of editing ReaderScreen. 7) Worklet fallback beyond the rendered window clamps to the window edge centre, the natural extension of the web's mids map fallback. 8) I added the optional 2px scroll skip in paragraph view since the prompt called it harmless and it matches the web.

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
