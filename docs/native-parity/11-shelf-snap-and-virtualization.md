# Shelf snapping, list virtualization, and grid spacing

> **Status: implemented and committed 2026-07-13.** Commit `ef4bf3e` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings.


## Mission

Make the native app's horizontal shelves and results grids scroll like the web app and perform like a native app should. Five fixes: add card snapping to the Popular shelf and every vibe swimlane, virtualize the Popular shelf (100 cards), virtualize the Browse results grid (988 cards), stop the bookmark ribbon tips from clipping on horizontal shelves, and correct the results grid's vertical spacing. Every change goes in the native repo. When you finish, all five acceptance checkboxes must describe true behavior.

## Context

Focus Reader is a cozy speed reading app for public domain books (think warm coffeeshop aesthetic: cream paper, espresso ink, coral accents, stitched leather book covers). It exists in two repos:

- **Web app (source of truth, READ ONLY): `C:/Users/Michael/Desktop/Focus Reader`.** A React + Vite + Tailwind app. It defines the exact look, copy, timings, and interaction feel. Read any file you need there, but NEVER modify anything in that repo.
- **Native app (where ALL your changes go): `C:/Users/Michael/Desktop/Focus Reader Android`.** An Expo SDK 54 app on React Native 0.81 with reanimated 4, gesture-handler 2.28, zustand, expo-image, expo-haptics, lucide-react-native, and react-navigation native-stack. This is a full React Native port of the web app. Never introduce a WebView anywhere; every screen is real native UI.

The goal of this work stream is pixel and behavior parity: when the web and native apps are held side by side, they should look and feel identical, except where a real native control is clearly better.

Relevant shared facts:

- The catalog is identical on both sides: web `src/services/curated.json` and native `src/services/catalog.json` each hold exactly 988 books. The Popular shelf is the top 100 by downloads.
- `BookCard` (native `src/components/BookCard.tsx`) is the storefront card: an SVG generated cover, a `Gesture.Race(Pan, Tap)` detector (tap opens instantly, press and hold lifts the cover), and an animated leather `SaveButton` ribbon whose tip pokes ABOVE the cover's top edge.
- The ribbon geometry is identical on web and native: bookmark art viewBox 64 wide by 148 tall, `EDGE = 40`, rendered 36px wide. Tip height above the cover = 40 * 36 / 64 = **22.5px**. (Web: `src/components/Input/LeatherBookmark.tsx:12-15` and `SaveButton.tsx:65-73`. Native: `src/components/SaveButton.tsx:25-26` and `RibbonButton` at lines 111 to 133.)
- Card widths: the Popular shelf and the "Deeper cuts" vibe lane use **176** (web `w-44`); all other swimlanes use the `BookCard` default of **144** (web `w-36`). Gap between cards is **20px** everywhere (web `gap-5`), content inset is **20px** (web `px-5`), and each shelf ends with a **4px** trailing spacer (web `w-1`, native `<View style={{ width: 4 }} />`).

## Before you start

1. Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect to be on branch `feat/native-ui-web-parity`. If you are on a different branch, stop and say so before changing anything.
2. Another session may hold uncommitted changes in `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, `src/reader/useReelEngine.ts`, and `app.json`. None of those files are yours to touch in this task. Always read the current state of any file before editing it, and never revert changes you did not make.
3. This package ideally runs after the `shared-cover-save-toast` package. If `src/components/BookCard.tsx`, `src/components/SaveButton.tsx`, or `src/components/ui.tsx` look different from the descriptions below, that package probably landed first; adapt to the current code rather than restoring the described state.
4. Line numbers below were checked on 2026-07-13 but may drift. If a listed line does not match, trust the described behavior and re-locate the code.

## Issues to fix

### 1. Horizontal shelves snap cards on web but scroll freely on native

Delta id: `gestures-shelf-snap-missing` (severity medium, interaction).

**What the web does.** The Popular shelf scroller (`src/components/Input/StoreFront.tsx:1114`) and every `Swimlane` scroller (`StoreFront.tsx:194-212`, scroller div at line 206) carry the classes `flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-pl-5 -mx-5 px-5 pt-7 -mt-4`, with `snap-start flex-shrink-0` on each card wrapper. That is CSS mandatory scroll snap with a 20px scroll padding inset: after any fling or drag, momentum always settles with a card's left edge aligned to the 20px inset. The shelf can never rest between cards.

**What native does.** `src/screens/TodayScreen.tsx:149-168` (Popular shelf) and the shared `Swimlane` in `src/components/ui.tsx:98-122` (used by every vibe lane in `src/screens/VibeScreen.tsx`) are plain horizontal `ScrollView`s with `contentContainerStyle` of `paddingHorizontal: 20, gap: 20` (Today inline at line 153; Swimlane via `s.laneRow` at `ui.tsx:204`) and the default `decelerationRate`. No `snapToInterval`, `snapToOffsets`, or `disableIntervalMomentum`. Flings settle at arbitrary offsets.

**Change.** Add card start snapping to both shelf scrollers:

- `snapToOffsets = cards.map((_, i) => i * (cardWidth + 20))` where `cardWidth` is 176 for the Popular shelf and the "Deeper cuts" lane, and 144 for all other swimlanes. Because the content container already carries `paddingHorizontal: 20`, offset 0 naturally puts the first card's left edge at the 20px inset, so the formula needs no inset correction.
- `decelerationRate="fast"` so the settle feels like CSS mandatory snap rather than a long native glide.
- Prefer `snapToOffsets` over `snapToInterval` because the trailing 4px spacer makes the content length a non multiple of the interval.
- Snapping must apply after momentum (the default for these props), so a hard fling still lands on a card edge.

The shared `Swimlane` takes `children`, so it cannot see the card width or count today. Give it two new optional props (for example `cardWidth?: number` default 144 and use `React.Children.count(children)` minus the trailing spacer, or pass the item count explicitly) and compute the offsets inside. `VibeScreen.tsx` renders "Deeper cuts" cards at width 176 (`VibeScreen.tsx:229`); that lane must get 176 based offsets while every other lane keeps 144.

If you do issue 2 first and the Popular shelf becomes a `FlatList`, apply these same props to the `FlatList`; it accepts all `ScrollView` props.

### 2. The Popular shelf mounts all 100 cards eagerly

Delta id: `today-popular-shelf-not-virtualized` (severity medium, performance).

**What the web does.** Web also maps all 100 popular books into the scroller (`StoreFront.tsx:1114-1140`), but they are cheap DOM nodes; Today paints instantly from bundled data.

**What native does.** `TodayScreen.tsx:149-168` renders `popular.map(...)` inside a horizontal `ScrollView`: 100 `BookCard` instances, each with an rn-svg generated cover (gradients, stitching), a `GestureDetector` (Pan plus Tap race), and an animated `SaveButton` ribbon, all instantiated synchronously when Today mounts. The repo's own legacy `src/components/Shelf.tsx:25-36` already demonstrates the virtualized pattern (`FlatList`, `initialNumToRender={4}`, `windowSize={5}`, `removeClippedSubviews`) but is unused, nothing imports it.

**Change.** Convert the Popular shelf to a horizontal `FlatList`:

- `initialNumToRender` around 4 to 6, a small `windowSize` (5 is fine), `removeClippedSubviews`.
- Keep the exact card look: `BookCard` with `width={176}`, `holdMs={SHELF_HOLD_MS}`, `slotId={`shelf:${book.id}`}`, `startIndex={progressById[book.id]?.currentIndex}`.
- Keep 20px gaps between cards, 20px content insets (`paddingHorizontal: 20` on `contentContainerStyle`), the full bleed `style={{ marginHorizontal: -20 }}`, the ribbon headroom (see issue 4), and the snap behavior from issue 1.
- Keep the trailing 4px spacer, for example via `ListFooterComponent`.
- Keep the loading state: when `popular.length === 0`, four `CoverSkeleton` placeholders at width 176 (either outside the list as today, or as `ListEmptyComponent`).

Today must feel instant on device like the web. Caution from the audit: `removeClippedSubviews` clips offscreen rows AND can clip children that overflow their bounds. The ribbon tips overflow 22.5px above each cover, so after wiring the headroom fix in issue 4, verify ribbons still poke above the covers. If `removeClippedSubviews` eats the tips even with correct headroom, drop that one flag and keep the windowing.

### 3. Browse mounts all 988 catalog cards with no virtualization

Delta id: `search-browse-results-unvirtualized-988-cards` (severity medium, performance).

**What the web does.** `openBrowse` (`StoreFront.tsx:541-545`) loads the full curated list (988 books) into the same 2 column grid (`StoreFront.tsx:936-954`); the DOM tolerates roughly 1000 simple card nodes and the page stays responsive with instant scroll.

**What native does.** `src/screens/ResultsScreen.tsx:118-130` maps `results` into `<View style={s.cell}>` cells inside `PageShell`'s `ScrollView` (`src/components/ui.tsx:161-189`). For Browse that is 988 `BookCard`s, each with a `Gesture.Race(Pan, Tap)` detector, an SVG leather save ribbon, and a generated multilayer cover, all mounted eagerly, nothing clipped or recycled.

**Change.** Render the results grid with a virtualized 2 column list (`FlatList` with `numColumns={2}`; prefer `FlatList` over FlashList so no new dependency is added) so Browse opens and scrolls as instantly as the web page, while keeping the cell layout identical: cells at `width: '50%'` with `alignItems: 'center'`, centered 144px cards, 24px row gap (`rowGap: 24` today), and the same `slotId={`search:${book.id}`}` and `startIndex` wiring.

Structural note: a vertical `FlatList` inside `PageShell`'s vertical `ScrollView` would NOT virtualize (React Native disables windowing for same orientation nesting and warns). The `FlatList` must become the screen's scroller. Two workable routes:

- Extend `PageShell` so a caller can supply the scrolling element (for example a `renderScroll` prop or a sibling `PageShellList` component), keeping the theme background, `PageWash`, and header slot, or
- Build the screen from `PageWash` plus `InnerPageHeader` plus a `FlatList` directly in `ResultsScreen`, moving the error card and search pill into `ListHeaderComponent` and the empty state into `ListEmptyComponent`.

Either way the list's `contentContainerStyle` must replicate `PageShell`'s column exactly: `width: '100%'`, `maxWidth: 448` (`PAGE_MAX_W`), `alignSelf: 'center'`, `paddingHorizontal: 20`, `paddingTop: 20`, `paddingBottom: Math.max(48, insets.bottom + 16)` (see issue 5 for the extra 28). Carry over `keyboardShouldPersistTaps='handled'` to the list (the screen currently gets it via `PageShell`'s `keyboardPersist` prop). Keep the 6 skeleton grid while `searching` and the copy "Nothing on the shelf for that. Try another title or author." for zero results.

The rendered output is functionally identical; the delta is time to interactive and scroll smoothness on device. Expo dev mode exaggerates the cost, so judge on hardware.

### 4. Popular shelf ribbon headroom is clipped by the ScrollView viewport

Delta id: `today-shelf-ribbon-headroom-clip` (severity medium, visual).

**What the web does.** The scroller div (`StoreFront.tsx:1114`, same in `Swimlane` at line 206) carries `pt-7 -mt-4`: 28px padding INSIDE the scrollable box and a 16px negative margin pulling the whole box up. The ribbon pokes 22.5px above each cover (36px wide ribbon, `EDGE` 40 of viewBox 64, so 40 * 36 / 64 = 22.5, per `SaveButton.tsx:65-73`), and with 28px of interior headroom it stays fully inside the box, so nothing clips.

**What native does.** `TodayScreen.tsx:153` puts `paddingTop: 28` AND `marginTop: -16` both in `contentContainerStyle`. The negative margin shifts the content view up 16px within the `ScrollView`'s viewport (which clips on Android), leaving only 12px of effective headroom above cover tops. The 22.5px ribbon tips (native `SaveButton.tsx` uses the same `EDGE` 40, `VIEW` 64 by 148, `RIBBON_W` 36 geometry) lose their top 10px or so. `ui.tsx:204` (`laneRow`, used by `Swimlane`) has the identical construction.

**Change.** In both places, move `marginTop: -16` out of `contentContainerStyle` and onto the `ScrollView`'s own `style` (alongside the existing `marginHorizontal: -20`), leaving `paddingTop: 28` in `contentContainerStyle`. The box itself then shifts up 16px while the full 28px of interior top padding remains as clip safe headroom. This was a static analysis finding, so confirm visually on device; if Android still clips, the fallback is `paddingTop: 28` on the scroller with `marginTop: -16` on the surrounding section `View`. Apply the same treatment to the Popular shelf `FlatList` from issue 2.

### 5. Results grid vertical spacing deviates from web

Delta id: `search-results-grid-vertical-spacing` (severity low, visual).

**What the web does.** The results `<section>` has `mb-7`, a 28px bottom margin before the page's bottom padding (`StoreFront.tsx:902`). The grid itself (`grid grid-cols-2 gap-y-6 justify-items-center`, lines 930 to 937) has zero top padding, so first row save ribbon tips (22.5px tall) poke up into the 20px gap under the search box (the form has `mb-5`), slightly overlapping its bottom edge. That overlap is intentional web behavior.

**What native does.** `ResultsScreen.tsx:144` gives `s.grid` a `paddingTop: 12`, pushing the first row down so ribbons no longer reach the search pill, and there is no 28px bottom spacer after the grid; content ends at `PageShell`'s `paddingBottom` of `Math.max(48, insets.bottom + 16)`.

**Change.** Drop the grid's top padding to 0 (letting first row ribbon tips overlap the 20px gap exactly as on web; the native search pill already has `marginBottom: 20` matching web `mb-5`) and add a 28px bottom margin below the whole grid, no results, or skeleton block. After the issue 3 conversion, that means `paddingTop: 0` where the grid style used to apply and 28 extra points of bottom spacing in the list, for example `paddingBottom: 28 + Math.max(48, insets.bottom + 16)` on the list's `contentContainerStyle` or a 28px tall `ListFooterComponent`. React Native's default `overflow` is visible on both platforms so removing the padding should not clip the ribbons, but verify on Android since ancestor overflow rules differ from web.

## Acceptance checklist

- [ ] Flinging the Popular shelf and any vibe swimlane (including "Deeper cuts" and "Where you left off") always settles with a card's left edge on the 20px inset, never resting between cards, with a quick decisive stop (`decelerationRate="fast"`).
- [ ] The Popular shelf is a horizontal `FlatList` that mounts only a handful of cards up front (`initialNumToRender` 4 to 6, small `windowSize`, `removeClippedSubviews` unless it clips ribbons); Today opens instantly and the shelf looks pixel identical (176px cards, 20px gaps, 20px insets, 4px trailing spacer, skeletons while empty).
- [ ] Browse renders its 988 results in a virtualized 2 column list that opens fast and scrolls smoothly, with identical cells (50% width, centered 144px cards, 24px row gaps), working tap and press and hold gestures, save ribbons, `keyboardShouldPersistTaps='handled'`, the 6 skeleton loading grid, and the same empty state copy.
- [ ] On the Popular shelf and every swimlane, the full leather bookmark tip (22.5px) is visible above each cover top, nothing shaved off, because the 16px negative margin sits on the scroller's own style, not inside the content container.
- [ ] In results, the first row of ribbon tips pokes up into the 20px gap under the search pill (slightly overlapping its bottom edge like the web), and there is 28px of breathing room between the last row and the page's bottom padding.

## Verification

1. Type check the native repo: run `npx tsc --noEmit` in `C:/Users/Michael/Desktop/Focus Reader Android`. It must pass clean.
2. Reason through the running behavior carefully: trace the snap offset math for both card widths, confirm the `FlatList`s are the actual scrollers (no vertical list nested in a vertical `ScrollView`), and confirm no gesture, slot id, or `startIndex` wiring was lost in the conversions.
3. Do NOT use the Expo web build to verify anything. Its dev server opens blank localhost tabs in the real browser and the web bundle breaks on zustand's `import.meta`. Do not start it.
4. On device checking is done by Michael on his Android phone. End your summary by telling him exactly what to look at, in plain everyday English, for example: "On your phone, open the app and flick the Popular shelf hard. It should glide and then stop with a book lined up neatly on the left edge, every time. The screen should appear right away with no stutter. Look at the little leather bookmarks on top of the covers, the whole rounded tip should be visible, not cut flat. Then tap see all next to Popular. The full book list should show up quickly and scroll smoothly all the way down. The first row of bookmarks should peek up close to the search box, and after the last row there should be a bit of extra space before the bottom. Open a vibe like a bedtime shelf and flick the rows sideways, they should also click into place on a book. Also check that tapping a book still opens it and holding a book still picks it up, both on the shelf and in the list."

## Final note

When summarizing your work for Michael, use plain everyday language, no jargon, and avoid dashes in prose. Write in short clear sentences.

---

## Outcome, recorded 2026-07-13

Implemented in commit `ef4bf3e` on `feat/native-ui-web-parity` in the native repo.

Files changed: `src/components/ui.tsx`, `src/screens/TodayScreen.tsx`, `src/screens/VibeScreen.tsx`, `src/screens/ResultsScreen.tsx`.

### Issue by issue

**1. Add card snapping to the Popular shelf and every vibe swimlane** (done)

Popular shelf FlatList and the shared Swimlane ScrollView both got snapToOffsets (one offset per card at i * (cardWidth + 20)) plus decelerationRate fast. Swimlane grew an optional cardWidth prop (default 144) and counts cards with React.Children.count; VibeScreen passes cardWidth 176 to the Deeper cuts lane so its offsets use 196 steps while every other lane uses 164.

**2. Virtualize the Popular shelf (100 cards)** (done)

Converted to a horizontal FlatList with initialNumToRender 5, windowSize 5, removeClippedSubviews, and the same card wiring (width 176, holdMs SHELF_HOLD_MS, slotId shelf:id, startIndex from progressById). 20px gaps ride as an ItemSeparatorComponent and the tail is a 24px footer (20 gap + the web 4px spacer) instead of flex gap in the content container, because container gap throws off the windowing spacer offsets. The 4 skeleton row still renders when popular is empty, in a plain View with identical styling.

**3. Virtualize the Browse results grid (988 cards)** (done)

ResultsScreen now builds its own page from the theme background, PageWash, InnerPageHeader, and a numColumns 2 FlatList as the screen scroller (no nesting inside PageShell's ScrollView, so windowing is real). Error card and search pill moved into ListHeaderComponent; the 6 skeleton grid and the empty copy live in ListEmptyComponent. Cells keep width 50 percent, centered 144px cards, 24px row gaps via marginTop on cells past the first row, slotId search:id, startIndex, and keyboardShouldPersistTaps handled. Content container replicates PageShell exactly (100 percent width, maxWidth 448, centered, 20px side padding, 20 top).

**4. Stop bookmark ribbon tips clipping on horizontal shelves** (done)

In both the Popular shelf (TodayScreen) and Swimlane (ui.tsx), marginTop -16 moved out of contentContainerStyle onto the scroller's own style next to marginHorizontal -20, leaving the full paddingTop 28 as interior headroom. Needs the on device look Michael does anyway; if Android still clips, the documented fallback is moving the negative margin to the section View.

**5. Correct the results grid vertical spacing** (done)

Grid top padding dropped from 12 to 0 (first row ribbon tips now poke into the 20px gap under the search pill like the web) and the list paddingBottom is 28 + Math.max(48, insets.bottom + 16), giving the web mb-7 breathing room after the grid, the empty state, or the skeleton block.

### Judgment calls made during implementation

1) Used an ItemSeparatorComponent (20px) plus a 24px ListFooterComponent on the Popular FlatList instead of flex gap in contentContainerStyle: virtualized lists compute unmounted region sizes from measured cell frames, and container level gap is invisible to that math, causing content jumps mid fling. Separators live inside each cell's measured frame so spacing is exact and visually identical. 2) Kept removeClippedSubviews on the Popular shelf per the prompt; ribbon tips stay inside the scroller bounds thanks to the 28px headroom, but Michael should confirm on device and we drop just that flag if tips vanish. 3) For Browse I chose the prompt's second route (PageWash + InnerPageHeader + FlatList directly in ResultsScreen) rather than extending PageShell, to avoid churning a shared component other screens use. 4) Left removeClippedSubviews off the vertical results grid so ribbon overflow above rows near the viewport edge can never pop in late. 5) Row gaps in the results grid use marginTop 24 on cells at index 2 and up (margins are inside measured frames) rather than rowGap, same virtualization reasoning; the non virtualized skeleton grid keeps rowGap 24. 6) Did NOT bump expo.version in app.json: that file is explicitly off limits this run (another session holds it), so the version bump memory rule is deferred to whoever commits.

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
