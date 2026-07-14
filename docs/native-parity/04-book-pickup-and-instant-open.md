# Book pickup thresholds and instant-open origins

> **Status: implemented and committed 2026-07-13.** Commit `abf2cff` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings.


## Mission

Make picking up and tap opening books in the native Android app feel exactly like the web app. That means committing a pickup at 130ms of hold instead of 250ms, allowing 22px of finger drift instead of 8 to 10, firing the hero buttons at 130ms of hold with no pressed dim, opening from the correct origin rects, never blanking the origin card on a quick tap, making the empty slot inert while a book is lifted, and polishing the empty slot visuals. Nine issues total, all listed below with exact constants.

## Context

Focus Reader is a cozy speed reading app for public domain books. The user browses a storefront (a Today page with a hero, shelves, search results, and vibe pages), picks up a book cover with a press and hold, and the cover physically lifts under the finger and springs open into the reader. A quick tap opens the book instantly with the same animation but no finger follow phase.

Two repos matter:

- **Web app (read only source of truth):** `C:/Users/Michael/Desktop/Focus Reader`. This is the reference for every look and behavior. Read it as much as you like. Never modify anything in this repo.
- **Native app (where all changes go):** `C:/Users/Michael/Desktop/Focus Reader Android`. Expo SDK 54, React Native 0.81, reanimated 4, gesture-handler 2.28, zustand, expo-image, expo-haptics, lucide-react-native, react-navigation native-stack.

This is a full React Native app. Never introduce a WebView.

Key files on each side for this package:

- Web: `src/utils/pressGesture.ts` (the press gesture engine), `src/components/Input/StoreFront.tsx` (Today page, heroes, vibe pages), `src/components/Input/BookCard.tsx` (grid/shelf card), `src/App.tsx` (open handlers and the fallback rect).
- Native: `src/components/BookCard.tsx`, `src/screens/TodayScreen.tsx` (HeroCover, HeroResume, HeroPick, centerRect), `src/screens/VibeScreen.tsx`, `src/components/rows.tsx`, `src/open/OpenTransition.tsx` (the open transition context, consumed via `useOpenTransition`).

## Before you start

Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect to be on branch `feat/native-ui-web-parity`.

**Important warnings:**

- Another session may hold uncommitted changes in `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, `src/reader/useReelEngine.ts`, and `app.json`. Read the current state of any file before editing it, and do not revert changes you did not make.
- This package touches `src/components/BookCard.tsx` and the call sites of `src/open/OpenTransition.tsx`. A separate package named open-transition-internals edits `OpenTransition.tsx` itself. Do not restructure `OpenTransition.tsx` internals here; only change what its callers pass in (slot ids, origin rects) and, if strictly needed, add a small export. If `OpenTransition.tsx` has uncommitted changes, work with what is there.
- Ideally this package runs after the shared-cover-save-toast package. If that work has not landed, proceed anyway against current file state.
- Line numbers below were verified on 2026-07-13 but may drift. If a listed line number does not match, trust the described behavior and re locate the code by searching for the named identifiers.

## Issues to fix

### 1. Hold to pick up commits at 250ms on native, web commits at 130ms

**Web behavior** (`src/utils/pressGesture.ts:24-32` and `121-155`): `DEFAULT_HOLD_MS = 130`. A touch held roughly still for 130ms commits the pickup (the cover lifts under the finger). A release before 130ms with little movement is a tap and opens instantly. Only cards inside horizontal shelves override this with `SHELF_HOLD_MS = 400` so a sideways swipe scrolls the shelf. The 130ms default applies to search results grid cards, vibe filtered grid cards (`gridCard`, `StoreFront.tsx:799-811`, which passes no `holdMs`), and the Today hero cover (`StoreFront.tsx:632` calls `press(book, heroOrigin(), ...)` via `startPressGesture` with no `holdMs`).

**Native behavior** (`src/components/BookCard.tsx:23-26, 66-89` and `src/screens/TodayScreen.tsx:274-286`): `DEFAULT_HOLD_MS = 250` in BookCard (lift Pan uses `.activateAfterLongPress(holdMs)`, tap uses `.maxDuration(holdMs)`), and TodayScreen's HeroCover hard codes `activateAfterLongPress(250)` and `Tap().maxDuration(250)`. `SHELF_HOLD_MS = 400` already matches web for shelf and swimlane cards. So on grid cards, search results, and the hero, the lift starts 120ms later than web, and a still press of 130 to 250ms opens instantly (tap path) instead of lifting.

**Change:** Set `DEFAULT_HOLD_MS` to `130` in `src/components/BookCard.tsx`, and change HeroCover in `TodayScreen.tsx` to use 130 on both the lift (`activateAfterLongPress(130)`) and the tap (`maxDuration(130)`). Keep `SHELF_HOLD_MS = 400` for shelf and swimlane cards. The 130/400 split is the disambiguation between "pick up" and "scroll": grid pages scroll only vertically, which is why web affords the much snappier 130ms there. This latency is the single most felt storefront gesture.

### 2. Touch tolerance is 22px on web, roughly 8 to 10px on native, on both the tap and the hold paths

**Web behavior** (`src/utils/pressGesture.ts:26-32` and `123-155`): `DEFAULT_TOUCH_SLOP = 22`. A touch may wander up to 22px (the contact patch rolls as you press down) and still count. A release before `holdMs` within that slop commits the tap (instant open), and a hold past `holdMs` within 22px commits the pickup. The source comment documents that 15 to 20px of drift is normal for a deliberate press on a phone, so this was an explicitly tuned fix.

**Native behavior** (`src/components/BookCard.tsx:66-87` and `src/screens/TodayScreen.tsx:278-284`): The tap gesture uses `.maxDistance(10)`, so more than 10dp of drift fails the tap. The lift Pan is worse: react-native-gesture-handler fails a pan with `activateAfterLongPress` outright once pre activation movement exceeds the platform touch slop, which is about 8dp on Android (PanGestureHandler.kt:135 fails when dx squared plus dy squared exceeds scaledTouchSlop squared before the hold elapses). So a press whose contact patch rolls 10 to 22px opens nothing at all: the tap fails on distance and the lift never fires even if held.

**Change:** Match web's 22px slop on both paths in BookCard and HeroCover. Raise `Tap().maxDistance` to `22`. Give the hold path a 22px pre activation tolerance: `activateAfterLongPress` alone cannot do this because its slop is gesture-handler's internal platform touch slop. Use for example a `manualActivation(true)` pan where you track touches and activate yourself after 130ms if movement stayed within 22px, or `Gesture.LongPress().minDuration(holdMs).maxDistance(22)` to trigger the lift (composed so the finger follow updates still flow to `open.finger`). Whatever construction you pick, preserve the existing behavior: lift begins at the hold threshold, `open.finger` tracks moves, `open.release` on end, `open.abort` on failure, and the save ribbon hitbox check (`inRibbon`) still fails the gesture in the ribbon corner.

### 3. Resume and Start Reading open from screen center instead of the hero cover

**Web behavior** (`src/components/Input/StoreFront.tsx:492, 637-639` and `src/App.tsx:31-35`): `keyboardOpenHero` always passes `heroOrigin()`, which is `heroCoverRef.current?.getBoundingClientRect() ?? null`, the actual on screen hero cover rect, to `onOpenBookInstant`. So pressing the Resume button (resume hero) or Start Reading button (today's pick hero) plays the open animation lifting from the hero cover's exact position. `App.tsx` `fallbackRect()` (110x165 centered) is used only when no rect could be captured (originRect null).

**Native behavior** (`src/screens/TodayScreen.tsx:321-323` and `:378`): `HeroResume.instantOpen` and `HeroPick.instantOpen` call `open.begin(book, centerRect(), ...)` where `centerRect()` (TodayScreen.tsx:409-413) is a synthetic 110x165 rect centered in the window. Only a direct tap on the cover itself measures the real cover rect. So the primary button always animates the cover from mid screen, not from the hero card.

**Change:** Resume and Start Reading must measure the hero cover View with `measureInWindow`, like HeroCover's tap path already does, and pass that rect to `open.begin`. Keep `centerRect()` strictly as the fallback when no rect can be measured. The measure helper already exists inside HeroCover; hoist it (or share the cover ref) so the buttons can reuse it. Also apply issue 6 here: these instant opens must use slot id `kbd:${book.id}` so the hero cover does not hide.

### 4. Vibe hero's Start reading opens from the measured cover on native, web opens it from a screen centered fallback

**Web behavior** (`src/components/Input/StoreFront.tsx:840-847` and `src/App.tsx:31-35, 158-168`): Pressing "Start reading" calls `onOpenBookInstant(heroPick, null, progressById[heroPick.id]?.currentIndex)`. App.tsx substitutes null with `fallbackRect()`: a 110x165 rect centered in the viewport, exactly `new DOMRect(window.innerWidth / 2 - 55, window.innerHeight / 2 - 82.5, 110, 165)`. So the floating cover appears 110px wide in the exact center of the screen, not over the hero card. The pending slotId becomes `kbd:${book.id}` with `keyboardActivated: true` (auto commit, no gesture phase). No haptic fires on this button.

**Native behavior** (`src/screens/VibeScreen.tsx:118-139` and `:186-192`): `startReadingMeasured()` measures the hero BookCover with `measureInWindow` and begins the open from the cover's actual on screen rect (84px wide, rotated card position); if measurement fails it uses a hardcoded fallback `{ x: 40, y: 260, width: 84, height: 126 }`. slotId is `` `vibe-pick:${heroPick.id}` `` with `instant: true`.

**Change:** Begin the instant open from a viewport centered 110x165 rect: `{ x: windowWidth / 2 - 55, y: windowHeight / 2 - 82.5, width: 110, height: 165 }` (that is the shared `centerRect()`, see issue 9 for exporting it). Drop the `measureInWindow` call and the `{ x: 40, y: 260, ... }` fallback. Use slotId `` `kbd:${heroPick.id}` `` to match the web's instant open convention (no visible difference today since no card carries either slot, but it keeps slot hiding logic consistent if it ever keys off the prefix). Both platforms correctly leave the hero card visible during the animation. Do not add a haptic to this button.

### 5. Web's Resume and Start Reading buttons fire at 130ms of hold without waiting for release, and have no pressed dim

**Web behavior** (`src/components/Input/StoreFront.tsx:1021-1025` and `1082-1086`, plus `src/utils/pressGesture.ts:121-155`): Both buttons wire `onPointerDown` to `startPressGesture` with `onPress` AND `onActivate` both invoking the instant open. So a quick tap opens on release, but holding the button 130ms opens the book while the finger is still down. The buttons have no pressed opacity or scale styling (only a focus visible ring).

**Native behavior** (`src/screens/TodayScreen.tsx:354-361` and `395-403`): `Pressable onPress` fires only on release regardless of hold duration, and the pressed style dims the button to opacity 0.9, feedback the web button does not show.

**Change:** Fire the instant open once the press has been held 130ms (or on release if sooner), and remove the pressed opacity dim (keep `opacity: 1` regardless of pressed state; the accent background and shadow stay as they are). You can reuse the same 130ms press logic built for issue 1, or a small Gesture.LongPress/Tap race, or a Pressable with `onPressIn` starting a 130ms timer that opens (guarded so release before the timer opens once via onPress and the timer is cancelled). Make sure the open fires exactly once per press.

### 6. A quick tap open empties the origin card into the picked up slot on native; web taps never hide the card

**Web behavior** (`src/App.tsx:158-168`, `src/components/Input/StoreFront.tsx:974-995`, and `src/components/Input/BookCard.tsx:71-77`): Instant opens (quick tap or keyboard) go through `handleOpenBookInstant`, which sets slotId to `` `kbd:${book.id}` ``. That never matches any physical slot id (`'hero'`, `'shelf:84'`), so `openingSlotId` hides nothing: the card or hero cover stays fully drawn beneath the floating transition cover. The empty inset shadow slot appears only during a genuine press and hold lift (slotId `'hero'` or `'shelf:id'`).

**Native behavior** (`src/components/BookCard.tsx:60-64, 79-87` and `src/screens/TodayScreen.tsx:283-284, 298-299`): `BookCard.beginInstant` and HeroCover's tap call `open.begin` with the SAME physical slotId as the lift path plus `instant: true`, so `openingSlotId` matches and the card immediately swaps to the empty slot (cover opacity 0, inset slot view, title and author dimmed to 0.4) on every tap open.

**Change:** Instant (tap) opens must use a slot id that matches no physical card, namely `` `kbd:${book.id}` ``, in `BookCard.beginInstant`, in HeroCover's tap, and in the HeroResume and HeroPick `instantOpen` paths (see issue 3). The origin rect still comes from the measured cover; only the slot id changes. Tap open is the most common open path, so this shows constantly. Rows (`rows.tsx` `useRowOpen`) already never hide since RecentRow and BookRow do not check `openingSlotId`; those already match web.

### 7. While a book is lifted, the empty slot still accepts gestures and stays in the accessibility tree

**Web behavior** (`src/components/Input/StoreFront.tsx:974-985` and `src/components/Input/BookCard.tsx:71-77`): When `openingSlotId` matches, the hero cover div drops `role`, `tabIndex`, and `aria-label`, sets `aria-hidden`, sets `pointerEvents: 'none'`, and detaches `onPointerDown` and `onKeyDown`. BookCard likewise passes undefined handlers and `tabIndex -1` while hidden. The slot cannot start a second open mid animation.

**Native behavior** (`src/screens/TodayScreen.tsx:288-307` and `src/components/BookCard.tsx:92-128`): HeroCover and BookCard render their GestureDetector unconditionally. While hidden, the empty slot still accepts taps and holds, and a press calls `open.begin` again, resetting the pending transition mid flight. Because `begin()` with the same slotId keys the same Overlay (`OpenTransition.tsx:192`), the restart glitches openness back to 0 without unmounting. HeroCover also stays accessible (`accessible` plus `accessibilityLabel`) while hidden.

**Change:** Gate the gestures while hidden, for example `.enabled(!hidden)` on both the lift and the tap gestures in BookCard and HeroCover (remember to include `hidden` in the gesture memo dependencies). Also drop the hidden slot out of the accessibility tree like web's `aria-hidden`: set `accessible={!hidden}`, remove `accessibilityRole` and `accessibilityLabel` while hidden, and add `accessibilityElementsHidden={hidden}` plus `importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}`. Michael explicitly cares about interrupt mid animation behavior, so make sure a tap on the empty slot during a lift does nothing.

### 8. The picked up empty slot lacks the web's inset shadow, 0.2s fade in, and eased text dim

**Web behavior** (`src/components/Input/StoreFront.tsx:987-988`, `src/components/Input/BookCard.tsx:107-119`, `tailwind.config.js:43-45`): While a card or hero is lifted, the slot overlay is `bg-espresso/[0.13]` plus `ring-1 ring-espresso/10` plus inset shadow `inset 0 3px 10px rgba(58,42,30,0.22)`, and mounts with `animate-fade-in` (opacity 0 to 1 over 0.2s ease-out). The card's title, author, and badge fade to opacity 0.4 with `transition-opacity` (the default 150ms).

**Native behavior** (`src/components/BookCard.tsx:111-126` and `src/screens/TodayScreen.tsx:298-299`): The slot views (BookCard `s.slot` and HeroCover's hidden placeholder) have the fill (`t.inkA(0.13)`) and border (`t.inkA(0.1)`) but no inset shadow and appear instantly. Title and author jump to opacity 0.4 with no transition.

**Change:** Fade the slot in over 200ms ease-out on mount (reanimated `FadeIn.duration(200)` entering animation, or an Animated opacity you drive yourself). Approximate the inset depression with an inner top shadow around `rgba(58,42,30,0.22)`: React Native has no inset box shadow, so use an inner gradient trick, for example an absolutely positioned expo-linear-gradient (already available through Expo) or a stacked translucent strip about 10px tall at the top of the slot fading from `rgba(58,42,30,0.22)` to transparent, clipped by the slot's border radii (3 on the left corners, 12 on the right corners). Ease the title, author, and badge dim to 0.4 over about 150ms instead of jumping. The same fix serves both the hero placeholder in TodayScreen and BookCard, so consider a small shared EmptySlot component.

### 9. The rows' no measurement fallback origin is a 48x72 rect at the screen's top left, web uses the centered 110x165 rect

**Web behavior** (`src/App.tsx:31-35`, applied at `:148` and `:162-163`): Any opener that cannot capture a rect passes null and App substitutes `fallbackRect()`: a 110x165 DOMRect centered at the middle of the viewport, so the cover springs from screen center.

**Native behavior** (`src/components/rows.tsx:24-36` and `src/screens/TodayScreen.tsx:409-413`): `useRowOpen`'s no node branch passes `{ x: 0, y: 0, width: 48, height: 72 }`, so the cover would spring from the top left corner at a different start scale. TodayScreen's `centerRect()` already matches the web's 110x165 centered rect; the rows just do not use it.

**Change:** Export `centerRect` from a common module (for example move it into `src/open/OpenTransition.tsx` or a small shared util, then import it in TodayScreen, VibeScreen for issue 4, and rows.tsx) and make `useRowOpen`'s fallback use it, so all no measurement opens originate from screen center like the web. Rare path, only hit when the cover ref is unexpectedly null, but a one line fix once the helper is shared.

## Acceptance checklist

- [ ] 1. A still press on a grid card, search result card, or the Today hero cover lifts the book after 130ms (not 250ms); shelf and swimlane cards still need 400ms so sideways swipes scroll.
- [ ] 2. A press whose finger rolls up to 22px still works on both paths: released early it opens instantly, held past the threshold it lifts; the ribbon corner still toggles save instead.
- [ ] 3. Tapping Resume or Start Reading on the Today hero animates the cover open starting from the hero cover's actual position, not from screen center.
- [ ] 4. Tapping Start reading on a vibe page's Our pick card animates the cover open from a 110x165 rect at the exact screen center, and the hero card underneath stays fully visible.
- [ ] 5. Holding Resume or Start Reading for 130ms opens the book while the finger is still down; a quick tap opens on release; the button never dims while pressed.
- [ ] 6. A quick tap on any card or the hero cover opens the book while the origin card stays fully drawn underneath the floating cover; the empty inset slot appears only during a real press and hold lift.
- [ ] 7. While a book is lifted, tapping or holding the empty slot does nothing (the in flight transition never restarts), and the slot is invisible to screen readers.
- [ ] 8. When a lift begins, the empty slot fades in over 0.2s with a soft inset shadow at its top, and the title, author, and badge ease down to 40 percent opacity over about 150ms.
- [ ] 9. If a row's cover ref cannot be measured, the open starts from the shared centered 110x165 rect, not from the top left corner.

## Verification

- Type check in the native repo: `npx tsc --noEmit` run from `C:/Users/Michael/Desktop/Focus Reader Android`. Fix any errors you introduced.
- Reason through the running behavior carefully, path by path: the gesture race between lift and tap at 130ms, the 22px slop on both paths, each open origin, each slot id, the enabled/disabled gesture while hidden, the fade timings. Re read your edited code with fresh eyes and trace a tap, a hold, a rolled press, and a tap during a lift.
- Do NOT use the Expo web build to verify anything. Its dev server opens blank localhost tabs in the real browser and the web bundle breaks on zustand's import.meta. It proves nothing about the app.
- On device checking is done by Michael on his Android phone.

When you finish, tell Michael exactly this, in plain everyday English: press and hold a book cover on the Today page and it should start lifting almost right away, noticeably quicker than before. Try a sloppy press where your thumb rolls a little; it should still open or lift instead of doing nothing. Tap the Resume button and watch the little cover fly out of the hero card itself, not from the middle of the screen, and notice the book cover in the hero never blinks out on a quick tap. On a vibe page, tap Start reading and the cover should pop open from the center of the screen while the pick card stays put. Hold the Resume button down without letting go; the book should open while your finger is still on it, and the button should not dim. Finally, press and hold a cover so it lifts, then with another finger try tapping the empty dented slot left behind; nothing should happen, and the slot itself should have faded in gently with a soft shadow, with the title and author dimming smoothly under it.

## Final note

When summarizing your work for Michael, use plain everyday language, explain what changed in terms of what he will feel on the phone, and avoid dashes in prose. Use commas or separate sentences instead.

---

## Outcome, recorded 2026-07-13

Implemented in commit `abf2cff` on `feat/native-ui-web-parity` in the native repo.

Files changed: `src/components/BookCard.tsx`, `src/components/rows.tsx`, `src/open/centerRect.ts`, `src/screens/TodayScreen.tsx`, `src/screens/VibeScreen.tsx`.

### Issue by issue

**1. Hold to pick up commits at 130ms instead of 250ms (grid, search, hero); shelf and swimlane cards keep 400ms** (done)

DEFAULT_HOLD_MS is now 130 in BookCard and the hero cover uses the same shared gesture, so it also gets 130. SHELF_HOLD_MS stays 400 and every shelf and swimlane call site still passes it.

**2. 22px touch tolerance on both the tap and the hold paths** (done)

Tap now allows 22px of drift. The lift is a manual activation pan that times 130ms itself and only gives up if the finger wanders past 22px before the hold lands, so gesture handler's 8dp internal slop no longer kills sloppy presses. The ribbon corner check still vetoes both gestures. One platform note: Android's page scroller can still natively claim a touch that rolls mostly vertically past the OS slop before 130ms; that ceiling exists on any Android app and is outside what the gesture config controls.

**3. Resume and Start Reading open from the hero cover's measured position** (done)

The cover ref now lives in HeroResume and HeroPick and is passed into HeroCover, so both buttons measure the real cover with measureInWindow and pass that rect to open.begin. centerRect() is only the fallback when the ref is gone. Both use the kbd slot id so the cover never hides.

**4. Vibe page Start reading opens from the centered 110x165 rect** (done)

startReadingMeasured and the hardcoded 40,260 fallback are gone. The button now begins from the shared centerRect() with slot id kbd:<id>, instant, and still no haptic. The pick card stays fully visible.

**5. Resume and Start Reading fire at 130ms of hold, no pressed dim** (done)

New useHoldFire hook: press in starts a 130ms timer that opens while the finger is still down; an earlier release opens on release; a fired flag that only rearms on a fresh touch guarantees exactly one open per press. The pressed opacity 0.9 dim is removed from both buttons; accent background and shadow unchanged.

**6. Quick taps never blank the origin card (kbd slot ids)** (done)

BookCard's instant tap, HeroCover's tap, both hero buttons, and the vibe button all begin with kbd:<book.id>, which matches no physical slot, so the card or hero cover stays drawn under the flying cover. The empty slot now appears only during a real hold lift. Row slot ids left alone as instructed since rows never hide.

**7. Lifted empty slot is inert and hidden from accessibility** (done)

Fresh touches on a hidden card fail immediately in both gestures. I did not use .enabled(false) because flipping it mid gesture cancels the very pan doing the lifting; instead new touch downs are refused while the card is hidden, and gesture state lives in a ref so the handler swap when hiding does not drop the active touch. Also, the lift pan now tracks only the first pointer, so a second finger tapping the slot neither cancels nor restarts anything (the old maxPointers(1) pan would have been cancelled by that second finger). Accessibility: accessible, role and label drop while hidden, plus accessibilityElementsHidden and importantForAccessibility no-hide-descendants.

**8. Empty slot fade in, inset top shadow, eased text dim** (done)

New shared EmptySlot component (exported from BookCard, used by BookCard and HeroCover): FadeIn 200ms ease out on mount, plus a 10px expo-linear-gradient strip from rgba(58,42,30,0.22) to transparent clipped by the 3/12 corner radii. Title, author and badge now ease to 0.4 over 150ms with the web's cubic bezier. The hero cover also now stays mounted at opacity 0 under the slot like the web instead of unmounting.

**9. Rows' no measurement fallback uses the shared centered rect** (done)

centerRect moved to a new small module src/open/centerRect.ts (OpenTransition.tsx untouched, since another package owns it). useRowOpen's no node branch now uses it instead of the 48x72 top left rect; TodayScreen, VibeScreen and BookCard import the same helper.

### Judgment calls made during implementation

Construction choice for issue 2: the prompt offered a LongPress or a manual activation pan; I used the manual pan because Android's LongPress cancels itself if the finger travels past maxDistance even after it activates, which would sever the finger follow mid lift. Dropped maxPointers(1) from the lift pan and filter touches by the first pointer's id instead, because Android cancels an active pan when a second pointer lands once maxPointers is exceeded; without this, the issue 7 test (second finger taps the empty slot) would have cancelled the lift. Release and abort are now driven from per pointer touch events, so a cancelled lift (for example the scroller stealing the touch) springs back to the slot instead of accidentally committing. Did not use .enabled(!hidden) as literally suggested in issue 7 because disabling a handler cancels it while active, which would kill the lift the moment it begins; refusing new touch downs while hidden achieves the same inertness safely. centerRect lives in a new file src/open/centerRect.ts rather than inside OpenTransition.tsx, which the open-transition-internals package owns. Kept the vibe Start reading button's small pressed dim since issue 4 scoped its changes to origin, slot id and haptic only. The package 03 cover inks decision (keep native pinned inks) required no action here; this package never touches cover accessory colors. Platform caveat worth knowing when testing: our gestures now tolerate the full 22px roll, but Android's own scroll container can still claim a strongly vertical roll past roughly 8dp before the 130ms hold lands; that is an OS level ceiling, not a gesture config issue.

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
