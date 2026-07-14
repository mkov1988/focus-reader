# Book pickup thresholds and instant-open origins

**Done.** Implemented and committed as `abf2cff` on `feat/native-ui-web-parity`, 2026-07-13, with an independent review that passed and left no unresolved findings. This package brought the native Android app's book pickup gesture and instant open animation into exact parity with the web app.

## What this fixed

Picking up and tap opening books on native felt off in several ways at once. The hold to pick up committed at 250ms instead of the web's 130ms, so every lift started a fifth of a second late. A sloppy press whose thumb rolled a little opened nothing, because the tolerances were about 8 to 10px instead of the web's 22px. The Resume and Start Reading buttons flew the cover out of the middle of the screen instead of the hero card, quick taps blanked the origin card into an empty slot, and the empty lifted slot still took taps (which could restart the animation mid flight), stayed visible to screen readers, and lacked the web's soft shadow and fade. This package fixed all nine of those, so the pickup feels snappy, sloppy presses still work, opens fly from the right place, tap opens never hide the card, and the lifted slot is inert and polished.

## What changed

### 1. Hold to pick up now commits at 130ms

The pickup used to commit at 250ms of hold on grid cards, search results, and the Today hero cover, a fifth of a second later than the web. Native `DEFAULT_HOLD_MS` is now `130` in `BookCard`, matching the web's `DEFAULT_HOLD_MS = 130`, and the hero cover uses the same shared gesture so it also picks up at 130ms. `SHELF_HOLD_MS` stays `400` for shelf and swimlane cards, and every shelf and swimlane call site still passes it, so a sideways swipe there still scrolls the shelf rather than lifting a book. This latency is the single most felt storefront gesture.

### 2. Touch tolerance raised to 22px on both paths

The tap gesture used to fail past `maxDistance(10)` and the lift pan died once movement passed Android's internal touch slop of about 8dp, so a press whose contact patch rolled 10 to 22px opened nothing at all. Both paths now match the web's `DEFAULT_TOUCH_SLOP = 22`. The tap allows 22px of drift, and the lift is a manual activation pan that times the 130ms itself and only gives up if the finger wanders past 22px before the hold lands, so gesture handler's 8dp internal slop no longer kills a deliberate press. The save ribbon corner check (`inRibbon`) still vetoes both gestures so that corner toggles save instead. One platform ceiling remains: Android's own page scroller can still natively claim a touch that rolls mostly vertically past the OS slop before 130ms, and that exists on any Android app, outside what the gesture config controls.

### 3. Resume and Start Reading open from the measured hero cover

Both buttons used to open the cover from `centerRect()`, a synthetic 110x165 rect in the middle of the window, so the cover always animated from mid screen instead of the hero card. The web always passes `heroOrigin()`, the hero cover's real on screen rect. Native now keeps the cover ref in `HeroResume` and `HeroPick` and passes it into `HeroCover`, so both buttons measure the real cover with `measureInWindow` and pass that rect to `open.begin`. `centerRect()` is now only the fallback when the ref is gone. Both buttons use the `kbd` slot id (see issue 6) so the hero cover never hides on these opens.

### 4. Vibe hero's Start reading opens from the centered 110x165 rect

Native's `startReadingMeasured()` used to measure the 84px rotated vibe cover and, on failure, fall back to a hardcoded `{ x: 40, y: 260, width: 84, height: 126 }`. The web opens this button from a viewport centered fallback, `new DOMRect(window.innerWidth / 2 - 55, window.innerHeight / 2 - 82.5, 110, 165)`, with no haptic. Native now begins the instant open from the shared `centerRect()`, which is `{ x: windowWidth / 2 - 55, y: windowHeight / 2 - 82.5, width: 110, height: 165 }`. The `measureInWindow` call and the `40,260` fallback are gone. The slot id changed from `` `vibe-pick:${heroPick.id}` `` to `` `kbd:${heroPick.id}` `` to match the web's instant open convention, the open still runs `instant: true`, and no haptic was added. The pick card underneath stays fully visible.

### 5. Resume and Start Reading fire at 130ms of hold with no pressed dim

Native's `Pressable onPress` used to fire only on release regardless of hold, and the pressed style dimmed the button to opacity 0.9, feedback the web button does not show. The web wires both `onPress` and `onActivate`, so a hold of 130ms opens the book while the finger is still down. A new `useHoldFire` hook now starts a 130ms timer on press in that opens while the finger is still down, an earlier release opens on release, and a fired flag that only rearms on a fresh touch guarantees exactly one open per press. The pressed opacity 0.9 dim is removed from both buttons, so they stay at `opacity: 1`; the accent background and shadow are unchanged.

### 6. Quick tap opens no longer blank the origin card

Native's `BookCard.beginInstant` and `HeroCover`'s tap used to call `open.begin` with the same physical slot id as the lift path plus `instant: true`, so `openingSlotId` matched and the card swapped to the empty slot (cover opacity 0, inset slot view, title and author dimmed to 0.4) on every tap open. On the web, instant opens use slot id `` `kbd:${book.id}` ``, which never matches any physical slot (`'hero'`, `'shelf:84'`), so nothing hides. Native's instant tap in `BookCard`, `HeroCover`'s tap, both hero buttons, and the vibe button now all begin with `` `kbd:${book.id}` ``, so the origin card or hero cover stays fully drawn under the flying cover. The empty inset slot now appears only during a genuine press and hold lift. The row slot ids were left alone as instructed, since `RecentRow` and `BookRow` never check `openingSlotId` and so already matched the web.

### 7. The lifted empty slot is now inert and hidden from accessibility

Native used to render the `GestureDetector` unconditionally, so the hidden empty slot still took taps and holds, and a press called `open.begin` again, resetting the pending transition mid flight and glitching openness back to 0 without unmounting. It also stayed accessible while hidden. Fresh touches on a hidden card now fail immediately in both gestures. This was not done with `.enabled(false)`, because flipping it mid gesture cancels the very pan doing the lifting; instead new touch downs are refused while the card is hidden, and gesture state lives in a ref so the handler swap when hiding does not drop the active touch. The lift pan now also tracks only the first pointer, so a second finger tapping the slot neither cancels nor restarts anything. For accessibility, the slot drops its `accessibilityRole` and `accessibilityLabel` while hidden, sets `accessible={!hidden}`, and adds `accessibilityElementsHidden={hidden}` plus `importantForAccessibility` set to `no-hide-descendants`, matching the web's `aria-hidden`.

### 8. The empty slot gained the inset shadow, 0.2s fade in, and eased text dim

Native's slot views had the fill `t.inkA(0.13)` and border `t.inkA(0.1)` but no inset shadow, appeared instantly, and jumped the title and author to opacity 0.4 with no transition. The web's slot is `bg-espresso/[0.13]` plus `ring-1 ring-espresso/10` plus an inset shadow `inset 0 3px 10px rgba(58,42,30,0.22)`, mounts with `animate-fade-in` (opacity 0 to 1 over 0.2s ease out), and fades the title, author, and badge to opacity 0.4 over the default 150ms. A new shared `EmptySlot` component (exported from `BookCard`, used by both `BookCard` and `HeroCover`) now mounts with `FadeIn.duration(200)` ease out and approximates the inset depression with a 10px `expo-linear-gradient` strip from `rgba(58,42,30,0.22)` to transparent, clipped by the slot's 3/12 corner radii (3 on the left corners, 12 on the right corners). The title, author, and badge now ease to 0.4 over 150ms with the web's `cubic-bezier` easing. The hero cover also now stays mounted at opacity 0 under the slot like the web, instead of unmounting.

### 9. The rows' no measurement fallback uses the shared centered rect

`useRowOpen`'s no node branch used to pass `{ x: 0, y: 0, width: 48, height: 72 }`, so a cover with no measurable ref would spring from the top left corner at a different start scale. The web substitutes `fallbackRect()`, a 110x165 rect centered in the viewport, for any opener that cannot capture a rect. `centerRect` moved into a new small module `src/open/centerRect.ts`, and `useRowOpen`'s no node branch now uses it. `TodayScreen`, `VibeScreen`, and `BookCard` import the same helper, so every no measurement open now originates from screen center like the web. This is a rare path, hit only when a cover ref is unexpectedly null.

## Judgment calls

- **Manual pan instead of LongPress for issue 2.** Android's `LongPress` cancels itself if the finger travels past `maxDistance` even after it activates, which would sever the finger follow mid lift, so a manual activation pan was used instead.
- **Dropped `maxPointers(1)` from the lift pan.** Android cancels an active pan when a second pointer lands once `maxPointers` is exceeded, which would have cancelled the lift during the issue 7 test (a second finger tapping the empty slot). Touches are now filtered by the first pointer's id instead, and release and abort are driven from per pointer touch events, so a cancelled lift (for example the scroller stealing the touch) springs back to the slot instead of accidentally committing.
- **Did not use `.enabled(!hidden)` for issue 7.** Disabling a handler cancels it while active, which would kill the lift the moment it begins. Refusing new touch downs while hidden achieves the same inertness safely.
- **`centerRect` lives in a new file `src/open/centerRect.ts`** rather than inside `OpenTransition.tsx`, which the open-transition-internals package owns.
- **Kept the vibe Start reading button's small pressed dim.** Issue 4 scoped its changes to the origin rect, slot id, and haptic only, so the button's existing pressed dim was left in place. This differs from the Resume and Start Reading buttons on the Today hero, whose dim was removed under issue 5.
- **Platform caveat for testing.** The gestures now tolerate the full 22px roll, but Android's own scroll container can still claim a strongly vertical roll past roughly 8dp before the 130ms hold lands. That is an OS level ceiling, not a gesture config issue.

## Check on your phone

- [ ] Confirm: a still press on a grid card, a search result, or the Today hero cover starts lifting the book after about 130ms, noticeably quicker than before; shelf and swimlane cards still need the longer 400ms hold so sideways swipes scroll.
- [ ] Confirm: a sloppy press where your thumb rolls a little still opens on a quick release or lifts on a hold instead of doing nothing; the save ribbon corner still toggles save.
- [ ] Confirm: tapping Resume or Start Reading on the Today hero flies the cover open from the hero card's own position, not from the middle of the screen, and the hero cover never blinks out on a quick tap.
- [ ] Confirm: on a vibe page, tapping Start reading pops the cover open from the exact center of the screen while the pick card underneath stays fully visible.
- [ ] Confirm: holding Resume or Start Reading down opens the book while your finger is still on it, a quick tap opens on release, and the button never dims while pressed.
- [ ] Confirm: a quick tap on any cover opens the book while the origin card stays fully drawn under the flying cover; the dented empty slot appears only when you actually press and hold to lift.
- [ ] Confirm: press and hold a cover so it lifts, then tap the empty dented slot with another finger; nothing happens and the in flight open never restarts.
- [ ] Confirm: when a lift begins, the empty slot fades in over about 0.2s with a soft shadow at its top, and the title, author, and badge dim smoothly to about 40 percent rather than snapping.

Everything else in this package, including the shared `kbd` slot ids, the exported `centerRect` helper for the rows' rare no measurement fallback, and the hiding of the lifted slot from screen readers, was verified in code and by the independent adversarial review.
