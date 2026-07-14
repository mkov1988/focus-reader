# Shelf snapping, list virtualization, and grid spacing

**Done.** Implemented and committed as `ef4bf3e` on `feat/native-ui-web-parity`, 2026-07-13, independent review passed with no unresolved findings. This package made the native app's horizontal shelves and results grids scroll like the web app and perform like a native app should.

## What this fixed

The native storefront had five gaps. Horizontal shelves scrolled freely and settled at arbitrary offsets instead of snapping to a card edge like the web. The Popular shelf mounted all 100 cards eagerly and the Browse grid mounted all 988, so both paid a full render cost up front rather than windowing like a native list should. The bookmark ribbon tips got shaved off the top of covers on horizontal shelves because a negative margin sat in the wrong place. And the results grid's vertical spacing drifted from the web. This package brought all five to parity: card snapping on every shelf, real virtualization on the two heavy lists, full ribbon headroom, and matched grid spacing.

## What changed

### 1. Card snapping on the Popular shelf and every vibe swimlane

Before, the web snapped and native did not. The web Popular shelf scroller (`src/components/Input/StoreFront.tsx:1114`) and every `Swimlane` scroller (`StoreFront.tsx:194-212`, scroller div at line 206) carry `flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-pl-5 -mx-5 px-5 pt-7 -mt-4` with `snap-start flex-shrink-0` on each card wrapper: CSS mandatory scroll snap with a 20px scroll padding inset, so after any fling or drag momentum always settles with a card's left edge aligned to the 20px inset and the shelf never rests between cards. Native's `TodayScreen.tsx:149-168` and the shared `Swimlane` in `src/components/ui.tsx:98-122` were plain horizontal `ScrollView`s with `contentContainerStyle` of `paddingHorizontal: 20, gap: 20` and the default `decelerationRate`, no snapping, so flings settled anywhere.

Both scrollers got `snapToOffsets = cards.map((_, i) => i * (cardWidth + 20))`, one offset per card, plus `decelerationRate="fast"` so the settle feels like CSS mandatory snap rather than a long native glide. `snapToOffsets` was used rather than `snapToInterval` because the trailing 4px spacer makes the content length a non multiple of the interval. Because the content container already carries `paddingHorizontal: 20`, offset 0 puts the first card's left edge at the 20px inset with no correction. Snapping applies after momentum (the default for these props), so a hard fling still lands on a card edge. The shared `Swimlane` grew an optional `cardWidth` prop (default 144) and counts its cards with `React.Children.count`; `VibeScreen.tsx` passes `cardWidth` 176 to the "Deeper cuts" lane (`VibeScreen.tsx:229`) so its offsets step by 196 while every other lane steps by 164.

### 2. Virtualize the Popular shelf (100 cards)

Before, `TodayScreen.tsx:149-168` rendered `popular.map(...)` inside a horizontal `ScrollView`: 100 `BookCard` instances, each with an rn-svg generated cover, a `GestureDetector` (Pan plus Tap race), and an animated `SaveButton` ribbon, all instantiated synchronously when Today mounted. The web maps all 100 too (`StoreFront.tsx:1114-1140`) but they are cheap DOM nodes so Today paints instantly. The repo already had the virtualized pattern in the unused legacy `src/components/Shelf.tsx:25-36` (`FlatList`, `initialNumToRender={4}`, `windowSize={5}`, `removeClippedSubviews`).

The Popular shelf became a horizontal `FlatList` with `initialNumToRender` 5, `windowSize` 5, and `removeClippedSubviews`, keeping the exact card wiring: `BookCard` with `width={176}`, `holdMs={SHELF_HOLD_MS}`, `slotId={`shelf:${book.id}`}`, and `startIndex={progressById[book.id]?.currentIndex}`. The 20px gaps ride as an `ItemSeparatorComponent` and the tail is a 24px `ListFooterComponent` (20px gap plus the web 4px spacer) rather than a flex gap in the content container. The loading state still renders four `CoverSkeleton` placeholders at width 176 in a plain `View` with identical styling when `popular.length === 0`. The 20px content insets (`paddingHorizontal: 20`), the full bleed `marginHorizontal: -20`, the ribbon headroom from issue 4, and the snap behavior from issue 1 all carried over.

### 3. Virtualize the Browse results grid (988 cards)

Before, `ResultsScreen.tsx:118-130` mapped `results` into `<View style={s.cell}>` cells inside `PageShell`'s `ScrollView` (`src/components/ui.tsx:161-189`): for Browse that was 988 `BookCard`s, each with a `Gesture.Race(Pan, Tap)` detector, an SVG leather save ribbon, and a generated multilayer cover, all mounted eagerly. The web's `openBrowse` (`StoreFront.tsx:541-545`) loads the same 988 books into a 2 column grid (`StoreFront.tsx:936-954`) and the DOM stays responsive.

`ResultsScreen` now builds its own page from the theme background, `PageWash`, `InnerPageHeader`, and a `numColumns={2}` `FlatList` as the screen's scroller, so windowing is real (a vertical `FlatList` nested in `PageShell`'s vertical `ScrollView` would not virtualize). The error card and search pill moved into `ListHeaderComponent`; the 6 skeleton grid and the empty copy "Nothing on the shelf for that. Try another title or author." live in `ListEmptyComponent`. Cells keep `width: '50%'` with `alignItems: 'center'`, centered 144px cards, 24px row gaps, `slotId={`search:${book.id}`}`, `startIndex`, and `keyboardShouldPersistTaps='handled'`. The content container replicates `PageShell` exactly: `width: '100%'`, `maxWidth: 448` (`PAGE_MAX_W`), `alignSelf: 'center'`, `paddingHorizontal: 20`, `paddingTop: 20`, and the bottom padding from issue 5.

### 4. Full ribbon headroom on horizontal shelves

Before, the ribbon tips clipped. The web scroller (`StoreFront.tsx:1114`, same in `Swimlane` at line 206) carries `pt-7 -mt-4`: 28px padding inside the scrollable box and a 16px negative margin pulling the box up, so the ribbon that pokes 22.5px above each cover (36px wide ribbon, `EDGE` 40 of viewBox 64, so 40 * 36 / 64 = 22.5, per `SaveButton.tsx:65-73`) stayed fully inside the box. Native put both `paddingTop: 28` and `marginTop: -16` in `contentContainerStyle` (`TodayScreen.tsx:153`, and the identical `laneRow` at `ui.tsx:204`). The negative margin shifted the content view up 16px within the viewport, which clips on Android, leaving only 12px of effective headroom and shaving the top 10px or so off the 22.5px tips.

In both the Popular shelf (`TodayScreen`) and the `Swimlane` (`ui.tsx`), `marginTop: -16` moved out of `contentContainerStyle` onto the scroller's own `style`, next to the existing `marginHorizontal: -20`, leaving the full `paddingTop: 28` as interior clip safe headroom. The box shifts up 16px while all 28px of top padding remains. This was a static analysis finding, so it still wants the on device look; if Android still clips, the documented fallback is `paddingTop: 28` on the scroller with `marginTop: -16` on the surrounding section `View`.

### 5. Results grid vertical spacing

Before, native diverged from the web. The web results `<section>` has `mb-7`, a 28px bottom margin before the page's bottom padding (`StoreFront.tsx:902`), and the grid itself (`grid grid-cols-2 gap-y-6 justify-items-center`, lines 930 to 937) has zero top padding, so first row save ribbon tips (22.5px tall) poke up into the 20px gap under the search box (the form has `mb-5`) and slightly overlap its bottom edge, which is intentional. Native's `s.grid` had `paddingTop: 12` (`ResultsScreen.tsx:144`) pushing the first row down, and no 28px bottom spacer after the grid.

The grid's top padding dropped from 12 to 0, so first row ribbon tips now poke into the 20px gap under the search pill exactly like the web (the native search pill already has `marginBottom: 20` matching web `mb-5`), and the list's bottom padding is `28 + Math.max(48, insets.bottom + 16)`, giving the web `mb-7` breathing room after the grid, the empty state, or the skeleton block.

## Judgment calls

- The Popular `FlatList` uses a 20px `ItemSeparatorComponent` plus a 24px `ListFooterComponent` instead of a flex gap in `contentContainerStyle`. Virtualized lists compute unmounted region sizes from measured cell frames and container level gap is invisible to that math, which causes content jumps mid fling. Separators live inside each cell's measured frame so the spacing is exact and visually identical.
- `removeClippedSubviews` was kept on the Popular shelf per the prompt. The ribbon tips stay inside the scroller bounds thanks to the 28px headroom, but if the tips ever vanish on device the fix is to drop just that one flag and keep the windowing.
- For Browse, the prompt's second route was chosen (`PageWash` plus `InnerPageHeader` plus a `FlatList` directly in `ResultsScreen`) rather than extending `PageShell`, to avoid churning a shared component other screens use.
- `removeClippedSubviews` was left off the vertical results grid so ribbon overflow above rows near the viewport edge can never pop in late.
- Row gaps in the results grid use `marginTop: 24` on cells at index 2 and up (margins sit inside measured frames) rather than `rowGap`, for the same virtualization reason; the non virtualized skeleton grid keeps `rowGap: 24`.
- `expo.version` in `app.json` was not bumped: that file was explicitly off limits this run because another session held it, so the version bump was left to whoever commits next.

## Check on your phone

- [ ] Confirm: flicking the Popular shelf hard glides and then stops with a book lined up neatly on the left edge, every time, never resting between cards.
- [ ] Confirm: flicking a vibe swimlane sideways (including "Deeper cuts" and "Where you left off") also clicks into place on a book with the same quick decisive stop.
- [ ] Confirm: Today opens right away with no stutter, and the Popular shelf looks the same as before (176px cards, even gaps, a little space at the end).
- [ ] Confirm: the whole rounded leather bookmark tip is visible above each cover on the shelves and swimlanes, not cut flat.
- [ ] Confirm: tapping "see all" next to Popular opens the full book list quickly and it scrolls smoothly all the way down.
- [ ] Confirm: in that list, the first row of bookmarks peeks up close to the search box and there is a bit of extra space after the last row before the bottom.
- [ ] Confirm: tapping a book still opens it and holding a book still picks it up, both on the shelf and in the list.

Everything else in this package was verified in code and by review.
