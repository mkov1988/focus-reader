# Reader stage gesture zoning

> **Status: implemented and committed 2026-07-13.** Commit `90e77e1` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings. Note: Sentence view ships with no swipe down exit anywhere, matching the web; flagged for Michael to overrule if wanted.


## Mission

Restructure the native reader's touch handling so it matches the web app's spatial gesture zoning. Today the native app runs one `Gesture.Race(...)` over the entire reading stage, so every touch anywhere competes between scrub, swipe, and tap. The web app instead splits the stage into zones: the display band (the Focus reel or Trail ribbon, or the full stage in Sentence mode) owns the kinetic scrub, and the surrounding stage owns tap to peek, horizontal sentence skip swipes, and the swipe down exit. This package rebuilds that zoning and fixes eight smaller gesture and feel mismatches that hang off the same structure.

## Context

Focus Reader is a cozy speed reading app for public domain books. There are two repos:

- **Web app (READ ONLY source of truth):** `C:/Users/Michael/Desktop/Focus Reader`. This is the reference for every look and behavior. Never modify anything in this repo. Read it freely.
- **Native app (where ALL changes go):** `C:/Users/Michael/Desktop/Focus Reader Android`. Expo SDK 54, React Native 0.81, reanimated 4, gesture-handler 2.28, zustand, expo-image, expo-haptics, lucide-react-native, react-navigation native-stack.

This is a full React Native app. Never introduce a WebView anywhere.

Reader vocabulary you need:

- The reader has five visualization modes: `rsvp` (called Focus, a vertical word reel), `trail` (a horizontal ghost ribbon), `sentence` (a horizontal word strip), `paragraph` (a scrollable paragraph card), and `hybrid` (Focus reel on top plus a faded paragraph card in the bottom 45%).
- `READER_FONT_SIZE` is 56 in both apps. The Focus reel and Trail ribbon are each a band of height `fontSize * 4` = 224px. The reel row height and vertical scrub density are `fontSize * 1.5` = 84px per word. Trail scrub density is `round(fontSize * 2.5)` = 140px per word.
- "Kinetic scrub" means dragging the reel or strip with your finger to move through the book, with inertia on release. On web it lives in `src/hooks/useKineticScrub.ts`; on native it is the `scrubGesture` built inside `src/reader/useReelEngine.ts`.
- "Chrome" means the header and controls. "Peek" briefly shows the chrome while playing. "Poke" counts as activity so the chrome stays up.

## Before you start

1. Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect branch `feat/native-ui-web-parity`.
2. **WARNING, THIS PACKAGE OVERLAPS THE ACTIVE READER FIX SESSION.** Another session may hold uncommitted changes in `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, `src/reader/useReelEngine.ts`, and `app.json`. This package edits `src/reader/useReelEngine.ts`, `src/reader/displays.tsx`, and `src/screens/ReaderScreen.tsx`, so two of your three files may already differ from the last commit. Read the current state of every file before editing it, build your edits on what is actually there, and do not revert changes you did not make.
3. Ideally run this package after the `reel-engine-playback-core` package (see `docs/native-parity/06-reel-engine-playback-core.md` in the web repo), because pause and seek semantics feed the zoning behavior here. If that package has not landed, proceed anyway but re-check any engine code it touched.
4. Line numbers below were verified on 2026-07-13. If a listed line has drifted, trust the described behavior and re-locate the code.

## The target gesture map

This is the web's zoning, which native must reproduce. All thresholds resolve at release unless noted.

| Mode | Scrub surface (kinetic scrub + pause on touch down) | Rest of the stage |
|---|---|---|
| Focus (`rsvp`) | The 224px reel band, vertical axis | Tap peeks (no pause). Horizontal swipe past 70px skips a sentence. Downward swipe past 110px exits. |
| Hybrid | The 224px reel band, vertical axis | Top area off the band: same as Focus. Bottom 45% paragraph card: native scroll plus edge advance; horizontal swipes still skip; swipe down NEVER exits from here. |
| Trail | The 224px ribbon, horizontal axis | Tap peeks. Horizontal swipe past 70px skips. Downward swipe past 110px exits. |
| Sentence | The strip covers the WHOLE stage, horizontal axis | Nothing. No tap peek, no skip swipe, no exit swipe. Tapping a word seeks (word press only). |
| Paragraph | none (no kinetic scrub) | Native scroll plus edge advance on the card. Tap peeks. Horizontal swipe past 70px skips. No swipe down exit (the whole surface is a scroller). |

Key web mechanics behind this map:

- The display components stop propagation on pointer down (`src/hooks/useKineticScrub.ts:139-149`, attached in `src/components/Reader/RSVPDisplay.tsx:123-133`, `src/components/Reader/GhostTrailDisplay.tsx:121-126`, `src/components/Reader/SentenceDisplay.tsx:168-179`), so once a touch starts on the display band the outer reader gestures never arm.
- The outer gestures live on `<main>` (`src/App.tsx:337`) via `useReaderGestures` (`src/hooks/useReaderGestures.ts`). Constants at lines 17-21: `TAP_MS = 250`, `TAP_PX = 8`, `SWIPE_PX = 70`, `SWIPE_DOWN_PX = 110`. Resolution happens ONCE at pointer up (lines 96-108): tap if both axes moved under 8px and under 250ms; else horizontal skip if `absX > absY && absX > 70`; else exit if `!inScroller && dy > absX && dy > 110`. Because dominance is checked at release, steep diagonals still count.
- `startedInVerticalScroller` (`useReaderGestures.ts:32-40`) walks up from the touch target looking for `overflow-y: auto|scroll`; if the gesture began inside the paragraph scroller, the swipe down exit is suppressed so scrolling the text never ejects the reader.
- Touching the scrub surface pauses playback immediately at pointer down: `useKineticScrub` fires `onStart` (line 163), wired to `handleManualScroll` = activity poke + pause (`src/components/Reader/ReaderView.tsx:54-57`).
- A tap on the scrub surface resolves inside the scrub itself: if movement ON THE SCRUB AXIS stayed under 8px and the touch lasted under 250ms, `onTap` fires (`useKineticScrub.ts:194-197`). Focus and Trail wire `onTap` to haptic tick + peek (`App.tsx:349`, `ReaderView.tsx:97,109`); Sentence does NOT pass `onTap` (`ReaderView.tsx:126-136`), so a tap on the sentence strip does nothing. Note the tap check uses axis movement only, so a quick horizontal flick across the Focus reel band (under 250ms, under 8px of VERTICAL travel) resolves as a tap and peeks; it never skips a sentence.

Native counterpart today: `src/screens/ReaderScreen.tsx:180-204` builds `tap` (Tap, maxDuration 250, maxDistance 8, haptic + peek), `swipeSkip` (Pan, `activeOffsetX([-28, 28])`, `failOffsetY([-20, 20])`, onEnd fires skip when `|translationX| > 70`), and `swipeDown` (Pan, `activeOffsetY(30)`, `failOffsetX([-24, 24])`, onEnd fires `handleBack` when `translationY > 110 && translationY > |translationX|`), then composes per mode:

```
rsvp / hybrid: Race(engine.scrubGesture, swipeSkip, tap)
trail / sentence: Race(engine.scrubGesture, swipeDown, tap)
paragraph: Race(swipeSkip, tap)
```

One `GestureDetector` with that Race wraps the whole stage (`ReaderScreen.tsx:273`). The engine's `scrubGesture` (`src/reader/useReelEngine.ts:262-300`) pauses playback in `onBegin` (which fires at touch down, stage wide) and activates with `activeOffsetY([-12, 12]).failOffsetX([-24, 24])` on the y axis or the mirrored offsets on the x axis.

## Issues to fix

### 1. Replace the stage wide Race with spatial zoning (gestures-stage-gesture-zoning)

**Web:** as described in the gesture map above. Concrete consequences of the web structure: (a) a horizontal swipe ON the 224px Focus reel band never skips a sentence (it either does nothing or peeks, if axis movement stayed under 8px within 250ms); (b) a fast vertical flick ON the trail ribbon or sentence strip never exits the reader (the x axis scrub owns it); (c) in Trail mode a 70px horizontal swipe OFF the ribbon skips a sentence; (d) swipe direction dominance is resolved once at release (`absX > absY && absX > 70`), so steep diagonals still count.

**Native:** the single Race over the whole stage means (a) a horizontal swipe over the Focus reel activates `swipeSkip` (its `activeOffsetX` 28 beats the scrub's `failOffsetX` 24) and wrongly skips a sentence; (b) a strong downward flick over the trail or sentence strip activates `swipeDown` and wrongly exits; (c) in Trail mode there is no `swipeSkip` at all, so off ribbon horizontal swipes scrub instead of skipping; (d) diagonal swipes that cross `failOffsetY` 20px before `activeOffsetX` 28px fail entirely instead of resolving by dominance at release. Also, because the scrub's `onBegin` pause fires at touch down stage wide, ANY touch anywhere pauses playback, so tap to peek always pauses (web only pauses when the touch starts on the scrub surface).

**Change:** attach the kinetic scrub (and its pause on touch down) to the display band only, and attach the outer set to the rest of the stage, per the gesture map. Suggested implementation, adapt as needed:

- Pass `engine.scrubGesture` down into the display components (or wrap the band views in `ReaderScreen`) so a `GestureDetector` sits directly on the `fontSize * 4` band view (`displays.tsx:165` for the Focus reel, `displays.tsx:253` for Trail) and on the SentenceDisplay root, which spans the whole stage.
- Keep an outer `GestureDetector` on the stage. Replace `swipeSkip` + `swipeDown` with ONE resolver Pan that mirrors the web's single release time resolution: at `onEnd`, if `absX > absY && absX > 70` skip (left = forward, right = back); else if the touch did not start inside the hybrid paragraph card and `dy > absX && dy > 110` exit. Keep the separate Tap (250ms, 8px) for peek + haptic, racing the resolver.
- RNGH has no `stopPropagation`, so make the zoning deterministic with hit tests instead of activation order: measure the band frame (and in Hybrid the paragraph card frame) via `onLayout` into refs, record the touch start position in the outer gestures, and no-op the outer tap and resolver when the touch began inside the band. This avoids every arbitration race. Mark the outer resolver `simultaneousWithExternalGesture` with the band scrub and the paragraph scroller so nothing cancels anything; the hit tests decide what acts.
- Per mode composition after the fix: Focus and Hybrid get band scrub + outer tap + outer resolver (skip and exit branches). Trail gets ribbon scrub + outer tap + outer resolver (skip AND exit, fixing consequence (c)). Sentence gets ONLY the strip scrub (see issues 7 and 8). Paragraph keeps outer tap + the resolver's skip branch only.
- A tap on the Focus band or Trail ribbon should still pause (touch down pause) then peek with a haptic, matching web. Implement the band tap inside the band scoped detector (for example Race the band pan with a Tap of maxDuration 250 / maxDistance 8, or resolve it inside the pan like web does with axis movement under 8px within 250ms).

### 2. Focus and Hybrid have no swipe down exit (gestures-focus-hybrid-swipe-down-exit-missing)

**Web:** `useReaderGestures` on `<main>` (`src/hooks/useReaderGestures.ts:96-108`, constants at 17-21, `App.tsx:246-252`): on pointer up, if `dy > |dx|` and `dy > 110` and the gesture did not start inside a vertical scroller (`startedInVerticalScroller`, lines 32-40), `onSwipeDown` fires `handleBack` (pause + return to the storefront). In Focus, that is the whole stage above and below the 224px reel band. In Hybrid, it is only the top half area around the reel band; the bottom 45% paragraph scroller deliberately suppresses the exit so scrolling the text never ejects the reader. The 110px threshold is deliberately large so casual movement never exits.

**Native:** `swipeDown` exists (`ReaderScreen.tsx:193-198`) but `surfaceGesture` only includes it for `trail` and `sentence` (`ReaderScreen.tsx:200-204`). For `rsvp` and `hybrid` the Race is `(scrubGesture, swipeSkip, tap)`: the vertical scrub claims all vertical drags stage wide, and there is no downward flick exit at all.

**Change:** with the zoning from issue 1 in place, vertical drags starting on the reel band scrub, and a downward flick starting elsewhere on the stage (`dy > 110`, vertically dominant at release, NOT starting inside the hybrid paragraph card) exits the reader via `handleBack`.

### 3. Scrub activation deadzone and cross axis bail (gestures-reel-scrub-activation-deadzone)

**Web:** `useKineticScrub` owns the pointer at pointer down (`useKineticScrub.ts:139-180`; the reel and ribbon set `touchAction: 'none'`) and applies `(start - coord) / pxPerStep` on every pointer move, so the reel moves fractionally from the very first pixel of finger travel (1px = 1/84 word on the Focus reel). Movement on the perpendicular axis is simply ignored; it never cancels the scrub.

**Native:** the scrub Pan uses `activeOffsetY([-12, 12]).failOffsetX([-24, 24])` (y axis) or the mirrored x axis offsets (`useReelEngine.ts:296-298`). The reel does not follow the finger until 12px of travel, and 24px of perpendicular movement kills the scrub entirely, handing the gesture to `swipeSkip` or `swipeDown`. Worse, RNGH translation includes the pre activation travel, so on activation the reel jumps about 12/84 of a word instead of easing from zero.

**Change:** once the scrub is scoped to the band (issue 1), those offsets have no reason to exist; they were only there because scrub, swipes, and tap raced over one surface. Remove the activation deadzone and the cross axis fail: use `manualActivation` (activate in `onTouchesMove` on the first movement) or minimal offsets so tracking starts effectively immediately and perpendicular movement never cancels the scrub. Make sure the tracked position starts from zero at the moment tracking begins so there is no activation jump.

### 4. Hybrid reel scrub races the paragraph half's scroll (gestures-hybrid-reel-scrub-steals-paragraph-scroll)

**Web:** Hybrid = reel band on top plus a bottom 45% ParagraphDisplay that is a real `overflow-y: auto` scroller (`ReaderView.tsx:139-164`, `ParagraphDisplay.tsx:205-217`). Dragging the paragraph text scrolls it natively, pausing playback via `onManualScroll` when vertically dominant past 8px; over scrolling an edge by 34px advances a paragraph; the reel scrub exists only within the reel band; the swipe down exit is suppressed for gestures starting inside the scroller (`useReaderGestures.ts:32-40`).

**Native:** `surfaceGesture` for `hybrid` wraps the WHOLE stage (`ReaderScreen.tsx:200-204,297-313`), including the bottom 45% ParagraphDisplay. Inside that half the paragraph has its own `GHScrollView` (`displays.tsx:520-534`) plus a bare `edgePan` (`displays.tsx:475-513`) that activates at the platform touch slop (about 8dp on Android) in any direction and runs simultaneously with the scroll. Three handlers race every drag. For a normal speed vertical drag the edgePan and scroll (about 8dp) activate before the stage scrub (12px) and cancel it, so the paragraph likely scrolls. But a fast fling whose first touch move event jumps past 12px can let the stage scrub activate first, cancelling the scroll and scrubbing the reel instead. The outcome depends on arbitration and touch sampling, unlike web's deterministic spatial split.

**Change:** falls out of issue 1. In Hybrid, vertical drags inside the paragraph half must ALWAYS scroll the paragraph (with the 34px edge advance barrier), and the reel scrub must engage only on the reel band. Scope the scrub detector to the band; do not rely on activation order races.

### 5. Paragraph edgePan claims all drags (gestures-paragraph-edgepan-claims-all-drags)

**Web:** `ParagraphDisplay.handleTouchMove` (`ParagraphDisplay.tsx:136-164`) returns early unless `|dy| > 8 && |dy| > |dx|`. Only vertically dominant drags count as manual scroll (`onManualScroll` = pause + activity, `ReaderView.tsx:54-57`) or feed the edge advance logic. A horizontal swipe over the paragraph therefore does NOT pause playback and, at release, the outer gestures fire the sentence skip at 70px (`useReaderGestures.ts:100-104`).

**Native:** `edgePan` (`displays.tsx:475-513`) is a bare `Gesture.Pan()` that activates at the platform touch slop (about 8dp on Android), direction agnostic, and its `onUpdate` calls `onManualScroll?.()` unconditionally on EVERY update. `ReaderScreen.handleManualScroll` (`ReaderScreen.tsx:221-224`) is `poke()` + `engine.pause()`. So an 8dp horizontal drag over the paragraph pauses playback, and because edgePan activates long before the stage `swipeSkip` (`activeOffsetX` 28), RNGH's default cancel on activate prevents the sentence skip swipe from ever firing in paragraph mode.

**Change:** gate the edgePan's manual scroll pause and its edge logic on vertically dominant movement (`|dy| > 8 && |dy| > |dx|`). Either give the pan `activeOffsetY([-8, 8])` plus a fail on x, or check translation dominance inside `onUpdate` before acting. Ensure horizontal 70px swipes over the paragraph card still reach the outer skip resolver (make edgePan simultaneous with, or at least not cancelling, the outer resolver). Web wheel handling (`WHEEL_MIN` 90 with magnitude mapping to 1/2/3 paragraphs) is desktop only and needs nothing on native.

### 6. Edge advance can repeat within one finger stroke (displays-paragraph-advance-repeat-per-gesture)

**Web:** `triggerAdvance` (`ParagraphDisplay.tsx:104-110`) sets `touchStart.current = null`, and `handleTouchMove` early returns when `touchStart` is null. After one over scroll advance the rest of that touch is inert; the user must lift and drag again to advance another paragraph. The 420ms `LANDING_MS` lock is only a secondary guard.

**Native:** after an advance, only the 420ms `advanceLock` guards (`displays.tsx:456-469`). The pan keeps updating; once the lock clears, the edge anchor re-arms, and if the new paragraph is still at its edge (a short paragraph that fully fits has `atBottom` immediately true) and the finger keeps pulling, another advance fires within the same continuous gesture, repeating about every 420ms.

**Change:** latch a per gesture flag when an advance fires: set it in the trigger, clear it in `onBegin` (or `onFinalize`), and early return in `onUpdate` while set. At most one edge advance per finger stroke. Do not touch the flick strength multi paragraph jumps (count 2 or 3 from one release); those already match web (`V_TWO` 0.9, `V_THREE` 1.5, `OVERSCROLL_MIN` 34, `LANDING_MS` 420, constants at `displays.tsx:396-399`).

### 7. Swipe down exit wrongly present on the trail and sentence scrub surfaces (displays-scrub-surface-swipe-down-exit-extra)

**Web:** both scrub displays stop propagation on pointer down (`GhostTrailDisplay.tsx:124-126`, `SentenceDisplay.tsx:168-179`, `useKineticScrub.ts:147-149`), so the `<main>` level exit (110px vertically dominant) never arms for gestures starting on them. On the trail ribbon (`touchAction: 'none'`) a vertical drag does nothing. On the sentence strip (`touchAction: 'pan-y'`, covering the whole stage) a vertical drag never exits either; the browser may take the pointer for panning, aborting the scrub, but no exit fires. So in Trail mode the exit swipe only works on the stage area OUTSIDE the 224px ribbon, and in Sentence mode it works nowhere.

**Native:** the trail and sentence races include `swipeDown` across the entire stage including the scrub surface (`ReaderScreen.tsx:193-204`); the x axis scrub fails on vertical drags via `failOffsetY`, handing them to `swipeDown`.

**Change:** with the zoning of issue 1, exclude the exit from gestures that start on the scrub surface: in Trail mode keep it only outside the ribbon; in Sentence mode remove it entirely (the strip spans the whole stage). Note this leaves Sentence mode with no exit gesture at all, only the header back button. This matches web exactly, but it removes an escape hatch, so mention it plainly in your summary to Michael together with issue 8 in case he prefers the native behavior.

### 8. Sentence strip tap peeks on native but does nothing on web (displays-sentence-tap-peek-mismatch)

**Web:** `ReaderView` does NOT pass `onTap` to SentenceDisplay (`ReaderView.tsx:126-136`), and the strip fills the whole reading area with a pointer down that stops propagation, so a tap on the strip fires the scrub's `onTap` which is undefined, a no-op (`SentenceDisplay.tsx:124-135`, `useKineticScrub.ts:193-197`). Tapping a word still seeks via the word's own click handler. Net: in Sentence mode there is no tap to peek anywhere on the reading surface; chrome only returns via controls activity or pausing. Web Trail and Focus DO peek on a band tap (their `onTap` is wired through).

**Native:** the stage level Tap in the sentence race fires `haptics.tick()` + `peek()` on any tap (`ReaderScreen.tsx:180-183,200-204`); a tap on a word additionally seeks via the Text `onPress`.

**Change:** remove the tap (peek + haptic) from the sentence mode composition; a tap should only seek when it lands on a word. Keep the band tap peek in Focus and Trail. The web's missing tap peek in Sentence mode may itself be an oversight, but web is the source of truth until Michael says otherwise; flag it in your summary so he can decide.

### 9. Sentence scrub density and word gap are off (gestures-sentence-pxperstep-off-by-one)

**Web:** `SentenceDisplay.tsx:59-64`: `displaySize = max(32, min(fontSize * 0.8, 64))` = 44.8 at the fixed 56px reader size; `pxPerStep = Math.round(displaySize * 2.6)` = `Math.round(116.48)` = 116px of drag per word; strip word gap = `displaySize * 0.4` = 17.9px. That way `pxPerStep` approximates one average word plus gap and the strip roughly tracks the finger 1:1.

**Native:** `PX_PER_STEP_X = 117` (`useReelEngine.ts:32-33`) and `ReaderScreen.tsx:97-99` passes a hardcoded 117 for sentence mode. The strip's gap is `displaySize * 0.5` = 22.4px (`displays.tsx:306-307`), so words sit wider apart while the drag density stays fixed; the strip tracks the finger slightly differently than web. Trail (140) and Focus (84) already match web exactly.

**Change:** compute the sentence `pxPerStep` as `Math.round(displaySize * 2.6)` = 116 (derive it from the same `displaySize` formula rather than hardcoding, so a future font size change stays correct) and set the strip gap to `displaySize * 0.4` in `displays.tsx`. The gap looks visual but it is load bearing for scrub feel, since `pxPerStep` is calibrated against word plus gap width.

### 10. Paragraph scroller shows Android overscroll stretch (gestures-paragraph-overscroll-stretch)

**Web:** the paragraph container is `overflow-y: auto` with `overscroll-contain` (`ParagraphDisplay.tsx:205-217`): reaching an edge is a dead stop, and the deliberate 34px `OVERSCROLL_MIN` pull past it (the barrier before a paragraph advance, constants at `ParagraphDisplay.tsx:22-35`) happens against a visually static page. No rubber band, no glow.

**Native:** the `GHScrollView` (`displays.tsx:520-534`) uses the default `overScrollMode`: on Android 12+ the content visibly stretches when pulled past an edge (glow on older versions), so the 34px barrier pull is accompanied by a stretch effect web never shows.

**Change:** set `overScrollMode="never"` (and `bounces={false}` for any future iOS build) on the paragraph `GHScrollView` so the edge feels like web's hard stop and the 34px pull is the only feedback before the advance fires. All other paragraph feel constants already match web (EDGE_SLOP 2, OVERSCROLL_MIN 34, LANDING_MS 420 with scroll disabled during landing, velocity thresholds 0.9/1.5, land at top, slide in `28 + 42(n-1)` px over `300 + 150(n-1)` ms).

## Acceptance checklist

- [ ] Zoning: in Focus, a horizontal swipe across the 224px reel band never skips a sentence (a quick short one peeks); in Trail, a horizontal swipe off the ribbon skips a sentence at 70px; a vertical flick on the trail ribbon or sentence strip neither exits nor does anything else; taps outside the scrub surface peek the chrome without pausing playback; steep diagonal swipes off the band resolve by dominance at release instead of dying part way.
- [ ] Focus and Hybrid: a downward flick past 110px starting off the reel band (and, in Hybrid, off the paragraph card) exits the reader; scrolling or flicking the Hybrid paragraph text never exits.
- [ ] The reel and strip follow the finger from the first pixel of travel, with no 12px dead zone, no jump on activation, and no cancellation from sideways finger drift.
- [ ] In Hybrid, every vertical drag inside the paragraph half scrolls the paragraph (with the 34px edge barrier), including fast flings; the reel only scrubs when the touch starts on the reel band.
- [ ] A horizontal drag over the paragraph card no longer pauses playback, and a 70px horizontal swipe there skips a sentence; only vertically dominant drags (over 8px and more vertical than horizontal) pause and feed the edge advance.
- [ ] Holding a continuous pull past a paragraph edge advances exactly once; advancing again requires lifting the finger and dragging again.
- [ ] Swipe down exits only from the stage area outside the trail ribbon in Trail mode, and not at all in Sentence mode (header back still works there).
- [ ] Tapping the sentence strip does nothing (no peek, no haptic); tapping a word in the strip still seeks to it.
- [ ] Sentence scrub moves one word per 116px of drag and the strip's word gap is `displaySize * 0.4` (17.9px at the default size), matching web geometry.
- [ ] Pulling past the top or bottom of the paragraph card shows no stretch or glow; the edge is a hard stop and the only feedback before an advance is the pull itself.

## Verification

1. Type check the native repo: run `npx tsc --noEmit` in `C:/Users/Michael/Desktop/Focus Reader Android`. Fix any errors you introduced.
2. Reason through the running behavior carefully, gesture by gesture and mode by mode against the target gesture map table above. Pay special attention to RNGH arbitration: confirm nothing relies on activation order between the band scrub, the outer resolver, the paragraph scroll, and the edgePan. Hit tests and explicit simultaneity should make every outcome deterministic.
3. Do NOT use the Expo web build to verify anything. Its dev server opens blank localhost tabs in the real browser and the web bundle breaks on zustand's `import.meta`. Do not start it.
4. On-device checking is done by Michael on his Android phone. End your summary by telling him exactly what to try, in plain everyday English, for example: open a book in Focus mode and swipe sideways across the big word in the middle, nothing should skip; swipe sideways above or below it, that should jump a sentence; flick down from the empty area, that should close the book; drag the small text at the bottom of the split view, it should only ever scroll that text; pull past the end of a paragraph and keep holding, it should turn the page once and then wait for you to let go; tap the word strip in sentence view, nothing should flash or buzz; and the page edges should feel like a firm wall instead of stretching.

## Final note

When summarizing your work for Michael, use plain everyday language, no jargon, and avoid dashes in prose (restructure the sentence instead). Also mention the two judgment calls from issues 7 and 8 (sentence view now has no swipe to exit and no tap to peek, exactly like the web) so he can overrule them if the web behavior was an oversight.

---

## Outcome, recorded 2026-07-13

Implemented in commit `90e77e1` on `feat/native-ui-web-parity` in the native repo.

Files changed: `src/screens/ReaderScreen.tsx`, `src/reader/useReelEngine.ts`, `src/reader/displays.tsx`, `app.json`.

### Issue by issue

**1. Replace the stage wide Race with spatial zoning** (done)

Scrub GestureDetector now sits directly on the fontSize*4 band view (Focus/Trail/Hybrid) and on a full-stage wrapper in Sentence mode. The outer stage keeps Race(tap, resolver): ONE release-time Pan resolves skip (absX>absY && absX>70) then exit (dy>absX && dy>110) at finger-up, like web useReaderGestures. Zoning is deterministic via both onLayout-measured frames (band + hybrid paragraph card, measured relative to the stage view so header collapse never stales them) hit-tested against the touch start point, AND simultaneousWithExternalGesture between resolver, band scrub, and paragraph scroller so nothing cancels anything. Band taps pause at touch down then peek with a haptic; stage taps peek without pausing.

**2. Focus and Hybrid swipe down exit** (done)

The resolver's exit branch is active in rsvp/hybrid/trail; a 110px vertically dominant flick off the band (and off the hybrid paragraph card) calls handleBack. Gestures starting in the hybrid card are suppressed via the measured card frame.

**3. Scrub activation deadzone and cross axis bail** (done)

activeOffset/failOffset removed. The pan uses manualActivation and activates in onTouchesMove at 2px of travel; translation is measured from touch down so there is no activation jump; perpendicular movement never cancels. The 2px slack (rather than literally 0) keeps clean finger taps from activating the pan, which on Android would cancel native word presses.

**4. Hybrid reel scrub races the paragraph half's scroll** (done)

Falls out of issue 1: the scrub detector only exists on the reel band, and the resolver + edgePan + GHScrollView are all mutually simultaneous, so every vertical drag (including fast flings) in the paragraph half scrolls the paragraph.

**5. Paragraph edgePan claims all drags** (done)

edgePan onUpdate now early-returns unless |dy|>8 && |dy|>|dx| (web handleTouchMove gate) before calling onManualScroll or edge logic, with velocity samples still collected first like web. It also declares simultaneity with the stage resolver so 70px horizontal swipes over the card reach the skip.

**6. Edge advance can repeat within one finger stroke** (done)

A strokeConsumed ref is set in trigger() (mirroring web nulling touchStart in triggerAdvance), cleared in onBegin, and early-returns onUpdate — at most one advance per stroke. Flick-strength multi-paragraph counts (V_TWO/V_THREE) untouched.

**7. Swipe down exit wrongly present on trail and sentence scrub surfaces** (done)

Trail: exit only fires for touches starting outside the measured ribbon frame. Sentence: the outer detector is not rendered at all, so there is no exit gesture anywhere (header back still works). Flagged to Michael as a web-parity judgment call he can overrule.

**8. Sentence strip tap peeks on native but does nothing on web** (done)

No tap/peek/haptic in sentence mode (no outer gestures; the engine's onTap for sentence routes to word-seek only). Word taps still seek: kept Text onPress AND added an analytic tap-to-word resolver driven by the scrub gesture's tap (gated on <8px stillness on both axes), because an activated pan cancels native presses for any wobbly tap. Flagged to Michael as possibly a web oversight.

**9. Sentence scrub density and word gap** (done)

Exported sentenceDisplaySize() from displays.tsx; strip gap is now displaySize*0.4 (17.9px) and ReaderScreen passes pxPerStep = Math.round(sentenceDisplaySize(READER_FONT_SIZE)*2.6) = 116, derived from the same size so future font changes stay in step.

**10. Paragraph scroller shows Android overscroll stretch** (done)

GHScrollView now has overScrollMode="never" and bounces={false}; edges are a hard stop and the 34px barrier pull is the only pre-advance feedback.

### Judgment calls made during implementation

1) Version bump: the uncommitted 0.7.3 bump was preserved and, per the standing rule to bump every change round, app.json now reads 0.7.4. 2) Scrub activation threshold: used 2px of travel instead of literally the first reported movement — a真 0px activation would cancel native word presses (sentence strip) on every real-world tap since fingers wobble a few pixels; 2px is 1/42 of a reel row and imperceptible, and translation is still measured from touch down so nothing jumps. 3) Sentence word taps: implemented an analytic tap-to-word seek fed by the scrub gesture's tap resolution (requiring <8px stillness on BOTH axes, i.e. browser-click semantics) in addition to keeping Text onPress — on native an activated pan cancels the press, so onPress alone would drop most real taps; both paths seek the same word so double-firing is idempotent. 4) Hybrid exit suppression uses a measured paragraph-card frame hit test as the native equivalent of the web's startedInVerticalScroller DOM walk. 5) Paragraph mode has NO exit branch anywhere on the stage, following the prompt's gesture map ('the whole surface is a scroller'); on very wide web screens a swipe outside the 672px card could technically exit, but on a phone the card covers the stage. 6) Per prompt instruction, the two behavior removals (sentence view: no swipe-to-exit, no tap-to-peek) were applied to match web exactly and are flagged for Michael to overrule. Suggested on-device checks for Michael, in plain words: open a book in Focus view and swipe sideways across the big word — nothing should skip, though a quick light brush there may flash the controls; swipe sideways above or below the big word and it should jump a sentence; flick straight down from an empty part of the screen and the book should close; in the split view, drag the small text at the bottom — it should only ever scroll that text, and flicking down there should never close the book; in Paragraph view, drag sideways — reading should not pause, and a longer sideways swipe should jump a sentence; pull past the end of a paragraph and keep holding — it should turn once, then wait for you to lift your finger; the page edges should feel like a firm wall with no stretchy glow; in the ribbon view, swipe sideways off the ribbon to jump a sentence, and flicking down ON the ribbon should do nothing; in Sentence view, tapping the strip should not buzz or flash anything, tapping a word should jump to it, and the only way out is the back button — that last part and the no-tap-flash both copy the website exactly, so say the word if you'd rather keep a swipe-down exit or tap-to-show-controls there.

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
