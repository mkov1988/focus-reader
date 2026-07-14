# Reader stage gesture zoning

**Done.** Implemented and committed as `90e77e1` on `feat/native-ui-web-parity`, 2026-07-13, independent review passed with no unresolved findings. This package rebuilt the native reader's touch handling so each part of the reading stage owns the right gesture, the way the web app splits the screen into zones, and cleaned up nine smaller gesture and feel mismatches that hung off the same structure.

## What this fixed

Before this, the native reader ran one `Gesture.Race(...)` over the whole reading stage, so every touch anywhere competed between scrub, swipe, and tap. That produced wrong outcomes all over: a horizontal swipe across the big focus word skipped a sentence, a downward flick on the trail ribbon exited the book, any touch anywhere paused playback, and fast flings in the split view could scrub the reel instead of scrolling the text. The web app instead splits the stage spatially: the display band owns the kinetic scrub, and the surrounding stage owns tap to peek, sideways sentence skips, and the swipe down exit. This package reproduced that zoning on native and brought the eight related gestures to match the web exactly.

## What changed

### 1. Stage wide race replaced with spatial zoning

The reader had a single `Gesture.Race` wrapping the whole stage, so scrub, skip, swipe down, and tap all competed on every touch. The kinetic scrub was scoped to the display band only. The scrub `GestureDetector` now sits directly on the `fontSize * 4` = 224px band view for Focus and Trail and Hybrid, and on a full stage wrapper in Sentence mode. The outer stage keeps a `Race(tap, resolver)`, where one release time Pan mirrors the web's single resolution at finger up (web `useReaderGestures`, constants `TAP_MS = 250`, `TAP_PX = 8`, `SWIPE_PX = 70`, `SWIPE_DOWN_PX = 110`): skip if `absX > absY && absX > 70` (left is forward, right is back), then exit if the touch did not start inside the hybrid paragraph card and `dy > absX && dy > 110`. Because dominance resolves once at release, steep diagonals still count. Zoning is deterministic without any activation order race: `onLayout` measured frames (the band, plus the hybrid paragraph card, both measured relative to the stage view so header collapse never stales them) are hit tested against the touch start point, and the resolver is marked `simultaneousWithExternalGesture` with the band scrub and the paragraph scroller so nothing cancels anything. Band taps pause playback at touch down then peek with a haptic; stage taps peek without pausing. Reel row height and scrub density stay `fontSize * 1.5` = 84px per word on Focus and `round(fontSize * 2.5)` = 140px per word on Trail.

### 2. Focus and Hybrid swipe down exit added

Focus and Hybrid had no swipe down exit at all: the old Race for `rsvp` and `hybrid` was `(scrubGesture, swipeSkip, tap)`, so the vertical scrub claimed every vertical drag and there was no downward flick exit. With the zoning in place, the resolver's exit branch is now active in `rsvp`, `hybrid`, and `trail`. A 110px vertically dominant flick starting off the band, and in Hybrid off the paragraph card, calls `handleBack` (pause plus return to the storefront). Gestures starting inside the hybrid card are suppressed via the measured card frame, so scrolling the bottom text never ejects the reader. The 110px threshold stays deliberately large so casual movement never exits.

### 3. Scrub activation deadzone and cross axis bail removed

The scrub Pan used `activeOffsetY([-12, 12]).failOffsetX([-24, 24])` (mirrored on the x axis for Trail and Sentence), so the reel did not follow the finger until 12px of travel, 24px of perpendicular movement killed the scrub entirely, and the reel jumped about 12/84 of a word on activation because RNGH translation includes the pre activation travel. On web the reel moves fractionally from the very first pixel (1px = 1/84 word on the Focus reel) and perpendicular movement is simply ignored. Now that the scrub is scoped to the band, those offsets were removed. The pan uses `manualActivation` and activates in `onTouchesMove` at 2px of travel, translation is measured from touch down so there is no activation jump, and perpendicular movement never cancels. The 2px slack rather than literally zero keeps clean finger taps from activating the pan, which on Android would cancel native word presses; 2px is 1/42 of a reel row and imperceptible.

### 4. Hybrid reel scrub no longer steals the paragraph half's scroll

In Hybrid the old `surfaceGesture` wrapped the whole stage including the bottom 45% ParagraphDisplay, so the reel scrub, the paragraph scroll, and a bare `edgePan` all raced every drag. A normal drag usually scrolled the text, but a fast fling whose first move event jumped past the 12px scrub threshold could scrub the reel instead, an outcome that depended on arbitration and touch sampling rather than a clean spatial split. This falls out of issue 1: the scrub detector only exists on the reel band, and the resolver, edgePan, and GHScrollView are all mutually simultaneous, so every vertical drag in the paragraph half, including fast flings, scrolls the paragraph, with the 34px edge advance barrier intact.

### 5. Paragraph edgePan no longer claims all drags

The paragraph `edgePan` was a bare `Gesture.Pan()` that activated at the platform touch slop (about 8dp on Android) in any direction and called `onManualScroll?.()` on every update, so an 8dp horizontal drag over the paragraph paused playback (`handleManualScroll` is `poke()` plus `engine.pause()`), and because edgePan activated before the outer skip it prevented the sentence skip from ever firing in paragraph mode. Web only treats vertically dominant drags as manual scroll (`|dy| > 8 && |dy| > |dx|`), so a horizontal swipe there does not pause and, at release, fires the 70px sentence skip. The edgePan `onUpdate` now early returns unless `|dy| > 8 && |dy| > |dx|` before calling `onManualScroll` or the edge logic, with velocity samples still collected first like web, and it declares simultaneity with the stage resolver so a 70px horizontal swipe over the card reaches the skip. Web wheel handling (`WHEEL_MIN` 90 with magnitude mapping to 1, 2, or 3 paragraphs) is desktop only and needed nothing on native.

### 6. Edge advance no longer repeats within one finger stroke

After a paragraph over scroll advance, only the 420ms `advanceLock` guarded, so on a short paragraph that sits at its edge a continuous finger pull would fire another advance about every 420ms without lifting. Web sets `touchStart.current = null` in `triggerAdvance` and early returns while it is null, so the rest of that touch is inert and the user must lift and drag again. A `strokeConsumed` ref is now set in `trigger()` (mirroring the web nulling of `touchStart`), cleared in `onBegin`, and early returns in `onUpdate` while set, so at most one edge advance fires per finger stroke. The flick strength multi paragraph counts were left untouched: `V_TWO` 0.9, `V_THREE` 1.5, `OVERSCROLL_MIN` 34, `LANDING_MS` 420.

### 7. Swipe down exit removed from the trail and sentence scrub surfaces

The trail and sentence Races included `swipeDown` across the entire stage including the scrub surface, and the x axis scrub failed on vertical drags via `failOffsetY`, handing them to `swipeDown`. On web both scrub displays stop propagation on pointer down, so the exit never arms for gestures starting on them: on the trail ribbon the exit only works on the stage area outside the 224px ribbon, and in Sentence mode it works nowhere. Now in Trail the exit fires only for touches starting outside the measured ribbon frame, and in Sentence the outer detector is not rendered at all, so there is no exit gesture anywhere, only the header back button. This matches web exactly. It is flagged below as a judgment call for Michael to overrule.

### 8. Sentence strip tap no longer peeks

The stage level Tap in the sentence race fired `haptics.tick()` plus `peek()` on any tap. On web, `ReaderView` does not pass `onTap` to SentenceDisplay, so a tap on the strip is a no op; only tapping a word seeks, via the word's own handler. The tap peek and haptic were removed from sentence mode (no outer gestures, and the engine's `onTap` for sentence routes to word seek only). Word taps still seek two ways: the `Text` `onPress` is kept, and an analytic tap to word resolver driven by the scrub gesture's tap was added, gated on under 8px stillness on both axes (browser click semantics), because an activated pan cancels native presses for any wobbly tap. Both paths seek the same word so a double fire is idempotent. Web Trail and Focus still peek on a band tap; only Sentence changed. Flagged below as possibly a web oversight.

### 9. Sentence scrub density and word gap corrected

Sentence scrub used a hardcoded `PX_PER_STEP_X = 117` and the strip gap was `displaySize * 0.5` = 22.4px, so words sat wider apart while the drag density stayed fixed, and the strip tracked the finger slightly differently than web. Web derives both from one size: `displaySize = max(32, min(fontSize * 0.8, 64))` = 44.8 at the fixed 56px reader size, `pxPerStep = Math.round(displaySize * 2.6)` = `Math.round(116.48)` = 116px of drag per word, and strip word gap = `displaySize * 0.4` = 17.9px. A `sentenceDisplaySize()` helper was exported from `displays.tsx`; the strip gap is now `displaySize * 0.4` (17.9px) and ReaderScreen passes `pxPerStep = Math.round(sentenceDisplaySize(READER_FONT_SIZE) * 2.6)` = 116, derived from the same size so a future font change stays in step. Trail (140) and Focus (84) already matched web exactly.

### 10. Paragraph scroller Android overscroll stretch removed

The paragraph `GHScrollView` used the default `overScrollMode`, so on Android 12+ the content visibly stretched when pulled past an edge (a glow on older versions), accompanying the deliberate 34px `OVERSCROLL_MIN` barrier pull that web shows against a visually static page. The scroller now has `overScrollMode="never"` and `bounces={false}`, so edges are a hard stop like web and the 34px barrier pull is the only pre advance feedback. All other paragraph feel constants already matched web: `EDGE_SLOP` 2, `OVERSCROLL_MIN` 34, `LANDING_MS` 420 with scroll disabled during landing, velocity thresholds 0.9 and 1.5, land at top, slide in `28 + 42(n-1)` px over `300 + 150(n-1)` ms.

## Judgment calls

- **Version bump.** The uncommitted 0.7.3 bump was preserved and, per the standing rule to bump every change round, `app.json` now reads 0.7.4.
- **Scrub activation at 2px, not zero.** A literal 0px activation would cancel native word presses on the sentence strip on every real tap since fingers wobble a few pixels. 2px is 1/42 of a reel row and imperceptible, and translation is still measured from touch down so nothing jumps.
- **Sentence word taps use two paths.** An analytic tap to word seek fed by the scrub gesture's tap (requiring under 8px stillness on both axes) was added alongside the `Text` `onPress`, because on native an activated pan cancels the press and `onPress` alone would drop most real taps. Both paths seek the same word, so double firing is harmless.
- **Hybrid exit suppression by measured frame.** A hit test against the measured paragraph card frame is the native equivalent of the web's `startedInVerticalScroller` DOM walk.
- **Paragraph mode has no exit branch anywhere,** following the gesture map ("the whole surface is a scroller"). On a very wide web screen a swipe outside the 672px card could technically exit, but on a phone the card covers the stage.
- **Two web parity removals flagged for Michael.** Sentence view now has no swipe to exit and no tap to peek, applied to match the web exactly. Both are called out so Michael can overrule them if the web behavior was an oversight.

## Check on your phone

- [ ] Confirm: in Focus view, swiping sideways across the big word does not skip a sentence (a quick light brush there may flash the controls), and swiping sideways above or below it jumps a sentence.
- [ ] Confirm: the reel and strip follow your finger from the first pixel, with no dead zone before they move and no jump when they catch.
- [ ] Confirm: flicking straight down from an empty part of the Focus or Hybrid screen closes the book, and scrolling or flicking the Hybrid bottom text never closes it.
- [ ] Confirm: in the split (Hybrid) view, dragging the small bottom text only ever scrolls that text, even on a fast fling.
- [ ] Confirm: in Paragraph view, dragging sideways does not pause reading, and a longer sideways swipe jumps a sentence.
- [ ] Confirm: pulling past the end of a paragraph and holding turns the page exactly once, then waits for you to lift your finger; the page edges feel like a firm wall with no stretchy glow.
- [ ] Confirm: in the ribbon (Trail) view, swiping sideways off the ribbon jumps a sentence, and flicking down on the ribbon does nothing.
- [ ] Confirm: in Sentence view, tapping the strip does not buzz or flash anything, tapping a word jumps to it, and the only way out is the back button.

Everything else in this package was verified in code and by review.
