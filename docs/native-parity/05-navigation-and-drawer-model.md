# Native parity 05: Navigation model, back handling, and drawer behavior

**Done.** Implemented and committed as `5de8738` on `feat/native-ui-web-parity`, 2026-07-13, independent review passed with no unresolved findings. This package rebuilt the native app's navigation so hardware back, drawer behavior, stack resets, and screen transitions all match the web app's one level deep model exactly.

## What this fixed

Before this work, the native navigation drifted from the web in eleven ways. Hardware back popped the screen behind the open drawer instead of closing the drawer. Drawer Browse choices pushed onto whatever stack existed, so backing out could resurrect a Vibe or Results page the web would have discarded. The More pages carried a hamburger the web never shows there, opening a book from Stats left Stats in the stack, screens slid with the Android default animation where the web swaps instantly, and several smaller details (scroll reset, search box clearing, drawer active tab logic, easing curves, swipe dismiss, drawer spacing) sat off the web's values. The package brought all of these to parity. Today is now the single home, inner pages always back out to Today, More pages close back onto whatever was beneath them, and the drawer feels like the web's.

## What changed

### 1. Hardware back closes the open drawer

Hardware back had no drawer integration, so react-navigation's native-stack owned the back button and popped the screen behind the scrim (or exited the app when Today was the only route), leaving the drawer floating over a new screen. On the web the drawer is dismissed three ways, all funneled through `closeMenu()`, which fires `haptics.tick()`, animates the panel offscreen over `DRAWER_MS = 240` ms, then unmounts. MenuDrawer now registers a `BackHandler` while `menuOpen` is true and runs the same close path as the scrim tap: a haptic tick plus `setMenuOpen(false)` so the 240 ms slide out plays, returning `true` so the stack never pops and the app never exits beneath the drawer. `app.json` already sets `android.predictiveBackGestureEnabled: false`, so the BackHandler works reliably.

### 2. Drawer Browse choices reset the stack

`MenuDrawer.go()` called `navigationRef.navigate(route)` for Library and Notebook, which pushed onto the existing stack. From Today, then a Vibe page, then the drawer, then Library, the stack became [Today, Vibe, Library], so backing out returned to the Vibe page first. The web runs `haptics.tick(); clearResults(); setActiveTab(key); closeMenu()`, discarding any open vibe or results page so one back press lands on Today. Library and Notebook now reset the stack to [Today, tab]:

```ts
navigationRef.reset({ index: 1, routes: [{ name: 'Today' }, { name: route }] });
```

One back press always lands on Today and any Results or Vibe screens are dropped, exactly like `clearResults()` on web. Today keeps its single route reset, and the More routes (Stats, Settings, About) stay plain pushes, which already matches the web's overlay pop behavior.

### 3. Stats, Settings, and About lost the hamburger

All three More screens passed `onMenu={() => { haptics.tick(); setMenuOpen(true); }}` to InnerPageHeader, rendering a hamburger the web never allows there. On the web the More pages render InnerPageHeader without the `onMenu` prop and show only [back][title]. The `onMenu` prop was removed from the Stats, Settings, and About headers, and the now unused `setMenuOpen` lines were cleaned up (AboutScreen also dropped its whole `useStore` import). Library, Notebook, Results, Vibe, and the reader keep their hamburgers. As a side effect the drawer is no longer reachable from More pages, which also removed the odd state where no Browse item was highlighted on those routes.

### 4. Per screen transitions: instant swaps and a 200 ms fade

The Stack.Navigator set only `headerShown: false`, so every screen got the Android native-stack default animation (a system slide and fade of roughly 300 to 400 ms) on push and pop, and the reader's `animation: 'fade'` also played on pop, fading where the web is instant. The web has three treatments: Library, Notebook, results, and vibe swap with no transition (the only motion is scroll resetting to top); Stats, Settings, and About mount with `animate-fade-in`, which is `fadeIn 0.2s ease-out` (opacity 0 to 1, 200 ms) and unmount instantly; the reader is an instant viewMode swap covered by the book open overlay. Library, Notebook, Results, Vibe, and Reader now use `animation: 'none'` (instant swap; the open overlay covers reader entry). Stats, Settings, and About use `animation: 'fade'` with `animationDuration: 200`. Note that `animationDuration` may be ignored on some Android versions of the native-stack fade, but the system fade already sits close to 200 ms, which the prompt accepted.

### 5. Scroll to top when backing out to Today

Each native screen owned a fresh ScrollView, so inner pages opened at their top but popping back restored the previous screen exactly as left, keeping the old Today scroll offset. The web runs a `useLayoutEffect` calling `window.scrollTo(0, 0)` whenever `mode` or `activeTab` changes, so backing out always lands on Today scrolled to the very top. TodayScreen now adds a navigation focus listener that skips the first mount and scrolls its PageShell ScrollView to `y: 0` without animation on every return visit, including returns from the reader (which also matches web, where the storefront remounts fresh).

### 6. Today search box empty after returning from Results

TodayScreen held its own `query` state and stayed mounted beneath Results, and `submitSearch` navigated without clearing, so after backing out the Today pill still showed the stale query with the clear X visible. On the web, backing out of results calls `clearResults()`, which runs `setQuery('')` so the Today header search box is always empty (placeholder "Search Focus Reader", no X button) when the user lands back home. `submitSearch` now clears the query right after navigating to Results. Results still prefills its own box from `route.params.query`, matching the web's shared query state.

### 7. Opening a book from Stats pops Stats first

StatsScreen rendered `<RecentRow key={r.bookId} r={r} />` with no way to customize the open action, and `OpenTransition.tsx` did `navigationRef.navigate('Reader', ...)`, pushing Reader on top of Stats so backing out of the reader returned to Stats. On the web each "Reading now" RecentRow gets a custom onOpen that runs `setStatsOpen(false)` before `onOpenBookInstant`, closing the Stats overlay before the book opens so exiting the reader lands on whatever page Stats had covered. RecentRow gained an optional `beforeOpen` prop that runs after the cover rect is measured but before `open.begin`, and StatsScreen passes `navigation.goBack` there. The cover flight starts from the real row rect, Stats leaves the stack, and exiting the reader lands on whatever was beneath Stats. Other RecentRow call sites are untouched, and `OpenTransition.tsx` itself needed no change.

### 8. Drawer marks Today active when opened from a Vibe page

The native active check was `active = activeRoute === key || (key === 'Today' && activeRoute == null)`, so on a Vibe route no Browse item was highlighted. On the web active state is `mode !== 'results' && activeTab === t.key`, and a vibe page is `mode='vibe'` with `activeTab` still `'today'`, so the drawer shows Today highlighted (cream card, coral border, 2.4 stroke icon, trailing Check); only `mode='results'` shows no active tab. The check now treats the Vibe route as Today, exactly the expression from the prompt:

```ts
const active = activeRoute === key || (key === 'Today' && (activeRoute == null || activeRoute === 'Vibe'));
```

### 9. Drawer and header animation easing curves

All the drawer and header timings used `withTiming` with no easing argument, which defaults to `Easing.inOut(Easing.quad)`, so the native drawer started slower and landed harder than the web's decelerate curve. The durations already matched (240 ms panel, 200 ms scrim in, 240 ms scrim out, 300 ms header collapse); only the curves were off. Easing is now passed explicitly:

- `Easing.bezier(0.2, 0.8, 0.25, 1)` for the drawer panel's open, close, swipe commit, and swipe snap back (the web panel slides with `transform 240ms cubic-bezier(.2,.8,.25,1)`, the house curve, in both directions).
- `Easing.out(Easing.quad)` for the scrim fade in (web `fadeIn 200ms ease-out`) and the InnerPageHeader collapse (web `duration-300 ease-out`).
- `Easing.bezier(0.25, 0.1, 0.25, 1)`, the CSS `ease` equivalent, for the scrim fade out (web `opacity 240ms ease`).

### 10. Drawer swipe dismiss details (partial)

The native pan used `Gesture.Pan().activeOffsetX(12).failOffsetY([-16, 16])` and a committed swipe close called `runOnJS(setMenuOpen)(false)` with no haptic. The web ignores pointer down on `'button, input, [role="button"], a, label, select, textarea'`, claims the gesture only after dx exceeds 8 px rightward, bails if the move is vertical dominant (`|dy| > |dx| + 4` and `|dy| > 8`) or leftward past 8 px, and commits close if dx exceeds 35% of panel width or average velocity exceeds 0.5 px per ms, always firing `haptics.tick()` before the 240 ms slide out. The commit thresholds already matched (`translationX > 0.35 * panelW`, `velocityX > 500` px per s, which is 0.5 px per ms). The core fixes were applied: `runOnJS(haptics.tick)()` on the swipe commit branch and `activeOffsetX` lowered from 12 to 8. The two parts the prompt marked optional were skipped: the exact vertical dominance bail (gesture-handler cannot express the relational comparison declaratively, and the existing `failOffsetY` window of plus or minus 16 approximates it) and refusing pans that begin on interactive rows (would need manual touch target inspection with real regression risk to row taps).

Web quirk worth knowing: selecting a Browse or More item on web double ticks (the item handler ticks, then closeMenu ticks again about 0 ms later, effectively one buzz at 5 ms vibrations); native `go()` single ticks, which matches the intent, so no change was made there.

### 11. Drawer MORE label spacing, active row shadow, and cleanups

The MORE label had `marginTop: 8` and inherited groupLabel's `marginBottom: 12`, leaving only 36 px from the last tab row and 12 px to the first More row, and the active tab row had no shadow. On the web the "More" label has `mt-7 mb-2` (28 px above, 8 px below), and with the Browse tab list's `mb-7` (28 px) above it, 56 px separate the last tab row from the MORE label; the active Browse tab row is `bg-cream ring-coral-accent/50 shadow-sm` with a `0 1px 2px rgba(0,0,0,0.05)` drop shadow. The MORE label is now `marginTop: 28`, `marginBottom: 8`. The active Browse row carries a hairline shadow matching `shadow-sm`: `shadowOpacity: 0.05`, `shadowRadius: 2`, `shadowOffset: { width: 0, height: 1 }`, `elevation: 1`. The drawer scroll content bottom padding became `Math.max(24, insets.bottom + 8)` so the About row clears the Android gesture navigation band on edge to edge devices. The dead `src/components/InnerHeader.tsx` (zero importers) was verified unreferenced and deleted.

## Judgment calls

1. Issue 6: chose the `setQuery('')` right after navigate option rather than a focus listener, since Results swaps in with no animation so the clear is invisible and it cannot accidentally clear while the user is typing.
2. Issue 7: implemented `beforeOpen` so it runs after the cover rect is measured but before `open.begin`, otherwise popping Stats first would unmount the row and lose the rect the cover flight starts from.
3. Issue 4: kept `animationDuration: 200` on the three fade screens as the prompt specified, accepting the symmetric pop fade rather than building self fading mounts for exact asymmetry.
4. Issue 10: skipped the optional exact vertical dominance bail and the interactive row pan exclusion, as noted above.
5. Reader animation set to `none` for both push and pop per the prompt; the book open overlay covers the entry visually.
6. The package 03 cover inks decision needed no action here: `BookCover.tsx` already has `onTint = t.surface` from the earlier package, and this package touches no cover ink code.

## Check on your phone

- [ ] Confirm: with the drawer open on any screen, pressing hardware back plays a haptic tick and slides the drawer closed over about 240 ms; the screen beneath never changes and the app never exits.
- [ ] Confirm: from Today, open a Vibe page, open the drawer, tap Library; one back press lands on Today with the Vibe page gone. Same for Notebook.
- [ ] Confirm: Stats, Settings, and About headers show only the back button and title, with no hamburger on any of the three.
- [ ] Confirm: entering or leaving Library, Notebook, Results, or Vibe swaps instantly with no slide; Stats, Settings, and About fade in over about 200 ms; leaving the reader plays no fade.
- [ ] Confirm: scroll deep on Today, descend into an inner page, back out, and Today is scrolled to the very top.
- [ ] Confirm: search something from Today, then back out of Results, and the Today search box is empty with its placeholder showing and no clear X.
- [ ] Confirm: open a book from the Stats page's "Reading now" list, then exit the reader, and you land on the screen that was beneath Stats, not on Stats.
- [ ] Confirm: open the drawer while on a Vibe page and the Today row is highlighted (cream card, coral border, bolder icon, trailing check).
- [ ] Confirm: the drawer opens and closes with a fast start and gentle settle, and a committed swipe dismiss fires a haptic tick.

Everything else in this package was verified in code and by review.
