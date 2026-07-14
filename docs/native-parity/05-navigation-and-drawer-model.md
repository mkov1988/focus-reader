# Native parity 05: Navigation model, back handling, and drawer behavior

> **Status: implemented and committed 2026-07-13.** Commit `5de8738` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings. The two drawer swipe details the prompt marked optional were skipped; everything else is in.


## Mission

Rebuild the native app's navigation to match the web app's model exactly. Hardware back must close the open menu drawer instead of popping the screen underneath. Drawer Browse choices must reset the stack so one back press always lands on Today. Stats must pop itself before opening a book. The More pages lose their hamburger buttons. Screen transitions, scroll reset, search box clearing, drawer active tab logic, drawer easing curves, swipe dismiss details, and drawer spacing all get tuned to the web's exact values. There are 11 issues, each specified below with the exact web behavior to copy.

## Context

Focus Reader is a cozy speed reading app for public domain books. There are two repos:

- **Web app (READ ONLY source of truth):** `C:/Users/Michael/Desktop/Focus Reader`. This is the reference for look and behavior. Read it as much as you like. Never modify anything in it.
- **Native app (where ALL changes go):** `C:/Users/Michael/Desktop/Focus Reader Android`. Expo SDK 54, React Native 0.81, reanimated 4, gesture-handler 2.28, zustand, expo-image, expo-haptics, lucide-react-native, react-navigation native-stack.

This is a full React Native app. Never introduce a WebView.

The navigation model (both platforms): Today is the only home page. Library, Notebook, search Results, and Vibe pages are inner pages you back out of, always landing on Today. Stats, Settings, and About are "More" pages opened from the menu drawer that close back onto whatever was beneath them. The menu drawer slides in from the right and is the single navigation hub (there is no tab bar).

Key files:

- Web: `src/components/Input/StoreFront.tsx` (the storefront shell, drawer, overlays, and navigation state all live here), `src/components/InnerPageHeader.tsx`, `tailwind.config.js` (animation keyframes), `src/App.tsx`.
- Native: `App.tsx` (stack navigator), `src/nav.ts` (navigationRef + route types), `src/components/MenuDrawer.tsx`, `src/components/InnerPageHeader.tsx`, `src/components/ui.tsx` (PageShell + useScrollTop), `src/components/rows.tsx` (RecentRow), `src/open/OpenTransition.tsx` (book open cover flight, navigates to Reader), `src/screens/*.tsx`, `app.json`.

Native haptics live in `src/haptics.ts` as `haptics.tick()` etc, mirroring the web's `haptics` module.

## Before you start

Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect branch `feat/native-ui-web-parity`.

Warning: another session may hold uncommitted changes in `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, `src/reader/useReelEngine.ts`, and `app.json`. Read the current state of any file before editing it, and do not revert changes you did not make. `src/open/OpenTransition.tsx` and `src/components/InnerPageHeader.tsx` are shared surfaces with that reader work, so edit them surgically.

If a line number given below has drifted, trust the described behavior and re-locate the code.

## Issues to fix

### 1. Hardware back does not close the open drawer (high)

**Web behavior** (`src/components/Input/StoreFront.tsx:361-372` and `:1262-1298`): the drawer is dismissed three ways, all funneled through `closeMenu()`: tap the scrim, tap the X button, or swipe right. `closeMenu` fires `haptics.tick()`, animates the panel offscreen over `DRAWER_MS = 240` ms, then unmounts. Nothing beneath the drawer is interactive while it is open (fixed `inset-0 z-[70]` captures everything).

**Native behavior** (`src/components/MenuDrawer.tsx:37-107`, `App.tsx:72-90`, `app.json:19`): MenuDrawer has no BackHandler and no other back integration (grep for BackHandler across the repo returns nothing). react-navigation's native-stack still owns the hardware back button, so pressing back while the drawer is open pops the current screen behind the scrim (or exits the app when Today is the only route), leaving the drawer floating over the new screen. `app.json` sets `android.predictiveBackGestureEnabled: false`, so a BackHandler will work reliably.

**Fix:** while `menuOpen` is true in the store, intercept the hardware back press. Register `BackHandler.addEventListener('hardwareBackPress', ...)` returning `true`, added and removed with `menuOpen`, and run the same close path as the scrim tap: `haptics.tick()` plus `setMenuOpen(false)` so the 240 ms slide out plays (this is exactly the existing `close` callback at `MenuDrawer.tsx:68-71`). No navigation may occur beneath the open drawer.

### 2. Drawer Browse navigation accumulates a stack instead of resetting (medium)

**Web behavior** (`StoreFront.tsx:1306-1322` and `:579-610`): the navigation model is strictly one level deep. Today is the only home, and Library, Notebook, results, and vibe pages ALWAYS back out directly to Today. Drawer Browse items run `haptics.tick(); clearResults(); setActiveTab(key); closeMenu()`, so any open vibe or results page is discarded, and the single back control on Library or Notebook (`goHome`) lands on Today. Example: Today, then a vibe page, then drawer, then Notebook, then back equals Today.

**Native behavior** (`src/components/MenuDrawer.tsx:73-83`, `src/nav.ts:8-18`): `MenuDrawer.go()` calls `navigationRef.reset({index: 0, routes: [{name: 'Today'}]})` only for Today; for Library and Notebook (and the More routes) it calls `navigationRef.navigate(route)`, which pushes onto whatever stack exists. Example: Today, then Vibe, then drawer, then Library gives the stack [Today, Vibe, Library]; back from Library returns to the Vibe page, then back again reaches Today. Two steps, and a resurrected page the web would have discarded.

**Fix:** when a Browse tab (Library or Notebook) is chosen from the drawer, reset the stack to [Today, tab]:

```ts
navigationRef.reset({ index: 1, routes: [{ name: 'Today' }, { name: route }] });
```

so one back press always lands on Today and any Results or Vibe screens are dropped, exactly like `clearResults()` on web. Leave the More routes (Stats, Settings, About) as plain pushes; on web those are overlays that close back onto whatever page was beneath, which plain push and pop already matches.

Note: `navigate()` does pop back to an existing instance of the same route, so the stack does not grow unboundedly today, but the intermediate history (Vibe, Results, the other tab) survives back navigation, which never happens on web.

### 3. Stats, Settings, and About must not show a hamburger (medium)

**Web behavior** (`StoreFront.tsx:139-154` OverlayPage, `:1364-1369` Stats header, `:1479` Settings, `:1580` About): the More pages render InnerPageHeader WITHOUT the `onMenu` prop. OverlayPage passes only title, eyebrow, backLabel, and onBack, and the Stats overlay does the same. These pages show [back][title] only. The hamburger appears exclusively on Today's home header, on the Browse inner pages (Library, Notebook, results, vibe, wired at `StoreFront.tsx:694-701`), and in the reader.

**Native behavior:** `src/screens/StatsScreen.tsx:78`, `src/screens/SettingsScreen.tsx:47`, and `src/screens/AboutScreen.tsx:36` all pass `onMenu={() => { haptics.tick(); setMenuOpen(true); }}` to InnerPageHeader, so a hamburger renders on the right of each of those headers and reopens the drawer from pages where the web never allows it.

**Fix:** remove the `onMenu` prop from InnerPageHeader on Stats, Settings, and About (and clean up the now unused `setMenuOpen` imports if nothing else uses them). Keep `onMenu` on Library, Notebook, Results, Vibe, and the reader.

Side effect: the drawer becomes unreachable from More pages, which also removes the currently odd drawer state where no Browse item is highlighted on those routes.

### 4. Per screen transitions: instant swaps and a 200 ms fade (medium)

**Web behavior** (`StoreFront.tsx:439-454`, `:139-147`, `:1356-1363`, `tailwind.config.js:44-58`, `src/App.tsx:316-353`): three distinct treatments.

1. Library, Notebook, results, and vibe are a conditional render swap with NO transition animation at all; the only motion is the scroll position resetting to top.
2. Stats, Settings, and About overlays mount with `animate-fade-in` which is `fadeIn 0.2s ease-out` (opacity 0 to 1, 200 ms). Closing them unmounts instantly with no exit animation.
3. Entering and leaving the reader is an instant viewMode swap; the book open transition overlay visually covers the entry, and swipe down exit lands back on the storefront with zero transition.

**Native behavior** (`App.tsx:72-86`): the Stack.Navigator sets only `headerShown: false`, so every screen gets the Android native-stack `default` animation (a system slide and fade of roughly 300 to 400 ms) on push AND pop. Reader alone overrides with `animation: 'fade'`, which also plays on pop, so leaving the reader fades where the web is instant.

**Fix:** per screen options:

- `animation: 'none'` for Library, Notebook, Results, and Vibe.
- `animation: 'fade'` with `animationDuration: 200` for Stats, Settings, and About. Accept that native-stack applies the fade symmetrically to pop where web closes instantly, or use `'none'` plus a self fading mount inside those three screens for exact asymmetry.
- Reader pop should be instant; `animation: 'none'` is safe because the open transition overlay covers the push.

The web fade uses `ease-out`; the native-stack fade is close enough at 200 ms. The uncommitted reader session does not touch `App.tsx`, so this change will not collide.

### 5. Scroll to top when backing out to Today (low)

**Web behavior** (`StoreFront.tsx:449-454`): a `useLayoutEffect` runs `window.scrollTo(0, 0)` whenever `mode` or `activeTab` changes. Entering Library, Notebook, results, or vibe opens them at the top, AND backing out of any of them lands on Today scrolled to the very top, even if the user had scrolled deep before descending.

**Native behavior** (`src/components/ui.tsx:161-195`, `App.tsx:72-86`): each screen owns a fresh ScrollView, so inner pages do open at their top (entry parity holds), but popping back restores the previous screen exactly as it was left. Returning to Today keeps the old scroll offset instead of jumping to the top.

**Fix:** on back navigation focus (a `useFocusEffect` or navigation `'focus'` listener that distinguishes a return visit from first mount), scroll the screen's ScrollView to `y: 0` without animation. At minimum do this on Today, which is the only screen reachable by backing out on web. The `useScrollTop` hook in `ui.tsx:193-195` already hands out the ref needed, and `PageShell` accepts a `scrollRef` prop.

### 6. Today search box must be empty after returning from Results (low)

**Web behavior** (`StoreFront.tsx:569-577` and `:601-605`): backing out of results calls `clearResults()`, which runs `setQuery('')` along with resetting mode, so the Today header search box is always empty (placeholder "Search Focus Reader", no X button) when the user lands back on home.

**Native behavior** (`src/screens/TodayScreen.tsx:35` and `:55-58`): TodayScreen holds its own `query` state with `useState('')` and stays mounted beneath the Results screen; `submitSearch` navigates without clearing, so after backing out the Today pill still shows the stale query text with the clear X visible. The file has no `useFocusEffect` or blur listener.

**Fix:** clear the Today search field when the user returns from Results. Either a `useFocusEffect` that resets `query`, or `setQuery('')` immediately after `navigation.navigate` in `submitSearch`.

Note: the Results screen pre-filling its own box from `route.params.query` already matches web (shared query state there). Only the home box's post back state diverges.

### 7. Opening a book from Stats must pop Stats first (medium)

**Web behavior** (`StoreFront.tsx:1447-1461`): on the Reading Stats page, each "Reading now" RecentRow is given a custom onOpen: `(book, rect, idx) => { setStatsOpen(false); onOpenBookInstant(book, rect, idx); }` (line 1456). The Stats overlay is closed BEFORE the book opens, so when the user later swipes down out of the reader they land on whatever page the Stats overlay had been covering (Today home, or Library if the menu was opened from there), never back on Stats.

**Native behavior** (`src/screens/StatsScreen.tsx:165`, `src/components/rows.tsx:23-46`, `src/open/OpenTransition.tsx:276-287`): StatsScreen renders `<RecentRow key={r.bookId} r={r} />` with no way to customize the open action. RecentRow's `useRowOpen` calls `open.begin(...)`, and `OpenTransition.tsx:282` does `navigationRef.navigate('Reader', ...)`, which pushes Reader on top of Stats. Stats stays in the stack, so backing out of the reader returns to the Stats page.

**Fix:** when a book is opened from the Stats screen, pop Stats off the stack first. For example, give the native RecentRow an optional `onOpen` or `beforeOpen` prop that StatsScreen uses to call `navigation.goBack()` (or pop) before `open.begin`, or have OpenTransition replace rather than push when told to. Exiting the reader must land on the screen Stats was opened over.

The cover flight from the row rect already matches (native measures the cover via `measureInWindow`); only the stack landing differs. `OpenTransition.tsx` is shared with the in flight reader session's work, so keep the change minimal and coordinate around any uncommitted state you find there.

### 8. Drawer must mark Today active when opened from a Vibe page (low)

**Web behavior** (`StoreFront.tsx:1308`): active state is `mode !== 'results' && activeTab === t.key`. A vibe page is `mode='vibe'` with `activeTab` still `'today'` (openVibe never touches activeTab, and vibe rows exist only on the Today tab), so the drawer shows Today highlighted (cream card, coral border, 2.4 stroke icon, trailing Check). Only `mode='results'` (search or Browse) shows no active tab.

**Native behavior** (`src/components/MenuDrawer.tsx:135`, snapshot at `:49-57`): `active = activeRoute === key || (key === 'Today' && activeRoute == null)`. When the current route is `'Vibe'`, no Browse item is highlighted. `'Results'` correctly shows none; Library, Notebook, and Today match.

**Fix:** treat the Vibe route as Today for highlighting:

```ts
const active = activeRoute === key || (key === 'Today' && (activeRoute == null || activeRoute === 'Vibe'));
```

After issue 3 is fixed, Stats, Settings, and About can no longer open the drawer, so their no active tab state stops being reachable.

### 9. Drawer and header animation easing curves (low)

**Web behavior** (`StoreFront.tsx:1274-1284` panel, `:1267-1272` scrim, `src/components/InnerPageHeader.tsx:36-39` collapse): the drawer panel slides with `transform 240ms cubic-bezier(.2,.8,.25,1)` (fast start, gentle settle) in both directions, including the snap back after an uncommitted swipe. The scrim fades in with `fadeIn 200ms ease-out` and fades out with `opacity 240ms ease`. The reader and inner header collapse animates grid rows plus opacity with `duration-300 ease-out`.

**Native behavior** (`src/components/MenuDrawer.tsx:51-66` open/close, `:93-102` swipe end, `src/components/InnerPageHeader.tsx:29-37`): all of these use `withTiming` with no easing argument, which defaults to `Easing.inOut(Easing.quad)`. Durations already match (240 ms panel, 200 ms scrim in, 240 ms scrim out, 300 ms header collapse); the curves do not. The native drawer starts slower and lands harder than the web's decelerate curve.

**Fix:** pass easing explicitly:

- `Easing.bezier(0.2, 0.8, 0.25, 1)` for the drawer panel's three timing calls (open, close, and the swipe snap back and commit at `MenuDrawer.tsx:97-100`).
- `Easing.out(Easing.quad)` for the scrim fade in and the InnerPageHeader collapse (the CSS `ease-out` equivalent).
- The CSS `ease` equivalent, `Easing.bezier(0.25, 0.1, 0.25, 1)`, for the scrim fade out.

This bezier is the house curve (the web's `slide-in-right` keyframe uses the same one). InnerPageHeader is shared with the in flight reader chrome work but the file itself is not in that session's uncommitted set.

### 10. Drawer swipe dismiss details (low)

**Web behavior** (`StoreFront.tsx:374-437` and `:361-372`): pointer down on the panel is ignored entirely if it starts on `'button, input, [role="button"], a, label, select, textarea'`. Tracking then claims the gesture only after dx exceeds 8 px rightward; it bails if the move is vertical dominant (`|dy| > |dx| + 4` and `|dy| > 8`) or leftward past 8 px. On release: commit close if dx exceeds 35% of panel width OR average velocity (dx divided by elapsed ms) exceeds 0.5 px per ms; commit runs `closeMenu()` which ALWAYS fires `haptics.tick()` before the 240 ms slide out. Otherwise the panel springs back to 0.

**Native behavior** (`src/components/MenuDrawer.tsx:86-102`): `Gesture.Pan().activeOffsetX(12).failOffsetY([-16, 16])`. Activation at 12 px (web: 8), vertical fail at a fixed plus or minus 16 px window rather than a dominance comparison, and no exclusion for swipes starting on menu rows (gesture-handler cancels the Pressable once the pan activates, so a drag beginning on a row moves the drawer; on web it does nothing). Commit thresholds match (`translationX > 0.35 * panelW`, `velocityX > 500` px per s which is 0.5 px per ms, though instantaneous rather than average velocity), but a committed swipe close calls `runOnJS(setMenuOpen)(false)` directly with NO `haptics.tick()`. The web ticks on every close path.

**Fix:** add `runOnJS(haptics.tick)()` on the swipe commit branch; lower `activeOffsetX` to 8; optionally match the vertical dominance bail and refuse pans that begin on interactive rows to mirror the web exactly.

Web quirk worth knowing: selecting a Browse or More item on web double ticks (the item handler ticks, then closeMenu ticks again about 0 ms later, effectively one buzz at 5 ms vibrations); native `go()` single ticks, which matches the intent. No change recommended there.

### 11. Drawer MORE label spacing and active row shadow (low)

**Web behavior** (`StoreFront.tsx:1328`, `:1315`, `:1305`): the "More" group label has `mt-7 mb-2`, that is 28 px above and 8 px below. The Browse tab list above it already carries `mb-7` (28 px), so 56 px separate the last tab row from the MORE label. The active Browse tab row style is `bg-cream ring-coral-accent/50 shadow-sm`, carrying a subtle drop shadow (`0 1px 2px rgba(0,0,0,0.05)`).

**Native behavior** (`src/components/MenuDrawer.tsx:157`, `:190-192`, `:131-133`): the MORE label gets `marginTop: 8` and inherits groupLabel's `marginBottom: 12`, so only 36 px from the last tab row (the Browse list's `marginBottom: 28` plus 8) and 12 px to the first More row (web: 56 px and 8 px). The active tab row has surface background plus accent border but no shadow or elevation.

**Fix:** MORE label: `marginTop: 28`, `marginBottom: 8`. Active tab row: add a hairline shadow matching `shadow-sm`: `shadowOpacity: 0.05`, `shadowRadius: 2`, `shadowOffset: { width: 0, height: 1 }`, `elevation: 1`.

Two adjacent cleanups while you are in the drawer:

- The ScrollView content ends at `paddingBottom: 24` (matches web `pb-6`) but adds no bottom safe area inset, so on edge to edge Android the About row can sit inside the gesture navigation band. Use `Math.max(24, insets.bottom + 8)`.
- `src/components/InnerHeader.tsx` is dead code (zero importers; only its own definition references it). Delete it so nobody reaches for the non parity header. Verify it is still unreferenced before deleting.

## Acceptance checklist

- [ ] 1. With the drawer open on any screen, pressing hardware back plays a haptic tick and slides the drawer closed over 240 ms; the screen beneath never changes and the app never exits.
- [ ] 2. From Today, open a Vibe page, open the drawer, tap Library; one back press from Library lands on Today (the Vibe page is gone). Same for Notebook.
- [ ] 3. Stats, Settings, and About headers show only the back button and title; no hamburger appears on any of the three.
- [ ] 4. Entering or leaving Library, Notebook, Results, or Vibe swaps instantly with no slide; Stats, Settings, and About fade in over about 200 ms; leaving the reader does not play a fade.
- [ ] 5. Scroll deep on Today, descend into an inner page, back out; Today is scrolled to the very top.
- [ ] 6. Search something from Today, then back out of Results; the Today search box is empty with its placeholder showing and no clear X.
- [ ] 7. Open a book from the Stats page's "Reading now" list, then exit the reader; you land on the screen that was beneath Stats, not on Stats.
- [ ] 8. Open the drawer while on a Vibe page; the Today row is highlighted (cream card, coral border, bolder icon, trailing check).
- [ ] 9. The drawer panel opens and closes with a fast start and gentle settle (bezier 0.2, 0.8, 0.25, 1); the scrim eases out on fade in; the inner header collapse uses ease out.
- [ ] 10. A committed swipe dismiss of the drawer fires a haptic tick; the swipe claims the gesture at 8 px of rightward travel.
- [ ] 11. In the drawer, the MORE label sits 28 px below the Browse list block with 8 px below it, the active Browse row carries a hairline shadow, and the drawer content clears the Android gesture navigation band.

## Verification

1. Type check: run `npx tsc --noEmit` in `C:/Users/Michael/Desktop/Focus Reader Android` and fix every error you introduced.
2. Reason through the running behavior carefully for each checklist item: trace the BackHandler registration lifecycle against `menuOpen`, the reset stack shapes, the focus effect ordering, and the OpenTransition timing with Stats popped.
3. Do NOT use the Expo web build to verify anything. Its dev server opens blank localhost tabs in the real browser and the web bundle breaks on zustand's `import.meta`. On device checking is done by Michael on his Android phone.

When you finish, tell Michael exactly what to try on his phone, in plain everyday English. Cover at least: open the menu and press the phone's back button (menu should close, nothing behind it should move); go into a mood page, use the menu to jump to Library, then press back once (should land on Today); open a book from the Reading Stats page and swipe out of it (should not land back on Stats); check that Stats, Settings, and About no longer have a menu button in the corner; search for a book, go back, and check the search box is empty; and feel whether the menu now slides with a quicker start and softer landing.

## Final note

When summarizing work for Michael, use plain everyday language, no jargon, and avoid dashes in prose sentences. Use commas or periods instead.

---

## Outcome, recorded 2026-07-13

Implemented in commit `5de8738` on `feat/native-ui-web-parity` in the native repo.

Files changed: `App.tsx`, `src/components/MenuDrawer.tsx`, `src/components/InnerPageHeader.tsx`, `src/components/InnerHeader.tsx (deleted)`, `src/components/rows.tsx`, `src/screens/StatsScreen.tsx`, `src/screens/SettingsScreen.tsx`, `src/screens/AboutScreen.tsx`, `src/screens/TodayScreen.tsx`.

### Issue by issue

**1. Hardware back closes the open drawer** (done)

MenuDrawer registers a BackHandler while menuOpen is true; it runs the same close path as the scrim tap (haptic tick plus the 240 ms slide out) and returns true so the stack never pops and the app never exits beneath the drawer.

**2. Drawer Browse choices reset the stack** (done)

Library and Notebook now reset the stack to [Today, tab], so one back press always lands on Today and any Vibe or Results page is discarded. Today keeps its single route reset, More routes stay plain pushes.

**3. Stats, Settings, About lose the hamburger** (done)

Removed onMenu from all three headers and cleaned up the now unused setMenuOpen lines (AboutScreen also dropped its whole useStore import). Library, Notebook, Results, Vibe, and the reader keep theirs.

**4. Per screen transitions** (done)

Library, Notebook, Results, Vibe, and Reader use animation none (instant swap; the book open overlay covers reader entry). Stats, Settings, About use fade with animationDuration 200. Note animationDuration may be ignored on some Android versions of native stack fade, but the system fade is already close to 200 ms, which the prompt accepted.

**5. Scroll to top when backing out to Today** (done)

TodayScreen adds a navigation focus listener that skips the first mount and scrolls its PageShell ScrollView to y 0 without animation on every return visit, including returns from the reader (which also matches web, where the storefront remounts fresh).

**6. Today search box empty after Results** (done)

submitSearch clears the query right after navigating to Results (the prompt's second suggested option). Results still prefills its own box from route params, matching web.

**7. Opening a book from Stats pops Stats first** (done)

RecentRow gained an optional beforeOpen prop that runs after the cover rect is measured but before open.begin. StatsScreen passes navigation.goBack there, so the flight starts from the real row rect, Stats leaves the stack, and exiting the reader lands on whatever was beneath Stats. Other RecentRow call sites are untouched. OpenTransition.tsx itself needed no change.

**8. Drawer marks Today active on a Vibe page** (done)

Active check now treats the Vibe route as Today, exactly the expression given in the prompt.

**9. Drawer and header easing curves** (done)

Panel open, close, swipe commit, and swipe snap back all use Easing.bezier(0.2, 0.8, 0.25, 1). Scrim fade in and the InnerPageHeader collapse use Easing.out(Easing.quad). Scrim fade out uses Easing.bezier(0.25, 0.1, 0.25, 1). Durations were already correct.

**10. Drawer swipe dismiss details** (PARTIAL)

Core fixes applied: haptic tick on the swipe commit branch and activeOffsetX lowered from 12 to 8. The two parts the prompt marked optional were skipped: the exact vertical dominance bail (gesture handler cannot express the relational comparison declaratively, and the existing failOffsetY window of plus or minus 16 approximates it) and refusing pans that start on menu rows (would need manual touch target inspection with real regression risk to row taps).

**11. MORE label spacing, active row shadow, drawer cleanups** (done)

MORE label now marginTop 28 and marginBottom 8. Active Browse row carries the hairline shadow (opacity 0.05, radius 2, offset 0 1, elevation 1). Drawer scroll content bottom padding is Math.max(24, insets.bottom + 8). Dead InnerHeader.tsx verified unreferenced and deleted.

### Judgment calls made during implementation

1. Issue 6: chose the setQuery('') right after navigate option rather than a focus listener, since Results swaps in with no animation so the clear is invisible, and it cannot accidentally clear while typing. 2. Issue 7: implemented beforeOpen so it runs after the cover rect is measured but before open.begin, otherwise popping Stats first would unmount the row and lose the rect the cover flight starts from. 3. Issue 4: kept animationDuration 200 on the three fade screens as the prompt specified, accepting the symmetric pop fade instead of building self fading mounts. 4. Issue 10: skipped the optional exact vertical dominance bail and the interactive row pan exclusion (see checklist note). 5. Reader animation set to none for both push and pop per the prompt; the book open overlay covers the entry visually. 6. The package 03 cover inks decision needed no action here: BookCover.tsx already has onTint = t.surface from the earlier package, and this package touches no cover ink code.

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
