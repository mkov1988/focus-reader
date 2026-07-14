# Book Open Transition Internals and Error Flow

**Done.** Implemented and committed as `61d1926` on `feat/native-ui-web-parity`, 2026-07-13, independent review passed with no unresolved findings. This package brought the native book open transition, its loading path, and its error flow to exact parity with the web app's `BookOpenTransition`.

## What this fixed

Before this package the native open transition drifted from the web in several ways at once. The transition closed on download completion rather than parse completion, so the reader mounted before it was ready and flashed its own full screen loading view with a duplicate badge while a large book parsed on the JS thread. A failed open fired the transient save toast pill instead of a proper error card, and ReaderScreen carried a full screen error page with a Try again button the web never had. Instant opens clamped the cover to the viewport, the cover kept flying during the closing fade, the faux page text was solid ruled lines instead of dashed word strips, the loading spinner was Android's material arc, and a held book that finished loading could flash the committed badge for a frame. This package parsed the book during the transition so the reader is fully formed the frame the fade ends, matched the web's spring back plus persistent dismissible error card, froze the cover the instant the fade starts, rendered the faux text as dashes, and swapped in a spinning Loader2. All committed as `61d1926`.

Files changed: `App.tsx`, `src/components/BookCover.tsx`, `src/components/OpenErrorCard.tsx`, `src/components/Spinner.tsx`, `src/open/OpenTransition.tsx`, `src/screens/ReaderScreen.tsx`, `src/services/library.ts`, `src/store.ts`.

## What changed

### 1. Close the transition on parse completion, not download completion

The web (`src/App.tsx`) fetches `library.fetchContent(book)`, runs `parseText(text)` synchronously, injects authored scene chapters into the parsed result, and only then sets `pendingParsed`, so the 240ms close fade starts only after the book is fully parsed and `onComplete` swaps into a ready reader with no in reader loading state. Native used to resolve on download of raw stripped text, fade, navigate, then re-await `fetchContent` and run `parseText` in ReaderScreen during render, showing a full screen loading view with its own back chevron and a duplicate 'Brewing your book…' badge while the synchronous parse of a large book blocked the JS thread after the fade already ended.

`begin()` now parses the downloaded text and applies the scene to chapter mapping while the cover is still up, matching the web's synchronous main thread parse:

```ts
const scenes = getScenes(pending.book.id);
if (scenes.length > 0) {
    parsed.chapters = scenes.map((s) => ({ title: s.label, wordIndex: s.startIndex, lineIndex: 0 }));
    parsed.chapterConfidence = 'high';
}
```

The resulting `ParsedText` is stashed in `library.ts` (`stashParsed`/`consumeParsed`, keyed by book id and cleared on consumption), and only then does `setLoaded(true)` fire. ReaderScreen consumes the stash on mount so it renders fully formed the frame the fade ends and the 'Brewing your book…' screen never appears on transition driven opens. The fetch plus parse path survives only as a cold mount fallback (deep links, state restore). A cancelled open skips the parse so nothing stale is stashed.

### 2. Persistent dismissible error card after the cancel spring settles

The web catch stores the error message (`e.message`, fallback `'Could not open that book.'`), fires `haptics.error()`, springs the cover back, and only after cancel completes and `pending` clears renders a fixed card: `bottom-6` (24px), centered (`left-1/2 -translate-x-1/2`), `z-[90]`, `max-w-sm` (384px), `w-[calc(100%-2rem)]`, `bg-cream rounded-2xl ring-1 ring-coral-accent/30 shadow-xl px-4 py-3 flex items-start gap-3`, holding a bold 13px "Couldn't open that book." plus the specific error in italic mocha and a lucide `X` dismiss (size 16, mocha) that persists until dismissed. Native used to run `haptics.error()` then `showToast("Couldn't open that book.")` immediately while the cover was still springing, using the store's transient bubble (in over 290ms, hold 1750ms, fade out 360ms) styled as the save confirmation pill with the coral Bookmark medallion, carrying no error detail and no dismiss control.

The rejection handler now keeps `haptics.error()` and the cancel (target 0, `phaseSV = 3`, phase 'cancelling'), drops the toast, and parks the real error message (fallback 'Could not open that book.') in a ref. `clear()`, which runs from `finishCancel` after the spring settles, promotes it to new store state `openError`. A new `OpenErrorCard` component matches the web card: surface background (`t.surface`), borderRadius 16, borderWidth 1 with the accent color at 30% alpha, shadow, paddingHorizontal 16, paddingVertical 12, bottom 24 plus safe area inset, centered, maxWidth 384, width screen minus 32, zIndex 90, bold 13px "Couldn't open that book." headline, italic muted detail line, and a 16px lucide-react-native `X` dismiss. The detailed error strings from `src/services/library.ts` ('No readable plain-text edition is available for this title.', 'The downloaded file appears to be empty.', `HTTP ${res.status}`) now surface in the detail line instead of being swallowed. `begin()` dismisses any lingering card, same as the web.

### 3. Remove ReaderScreen's full screen error page and Try again button

The web has no retry affordance and never mounts the reader on failure; loading lives inside the transition's 'Brewing your book…' badge over the storefront. Native used to commit to ReaderScreen before content resolved, showing a full screen loading page (pill badge with ActivityIndicator plus 'Brewing your book…' and the title, plus a bare '‹' back glyph), and on error swapping to serif "Couldn't open that book." (19px Fraunces medium), the message in italic 13px Fraunces, and a coral 'Try again' pill that re-ran `fetchContent` via `setAttempt`.

The error page, Try again pill, the error/attempt state, and the error haptic effect are gone. With issue 1 fixed, transition driven opens never reach ReaderScreen before content is ready, so this path only fires on cold mounts. A cold mount fetch failure now fires `haptics.error()`, shows the same persistent card via the store, and goes back (`navigation.goBack()`, falling back to navigating to `Today` when there is nothing to go back to). The plain loading badge view survives for cold mounts only.

### 4. Instant opens must not clamp the anchor to the viewport

On the web, `autoCommit` initialises the anchor to the tracking rect centre raw and unclamped, and `clampToViewport` (half cover plus a 12px margin) applies only to finger following during gesture tracking. So tapping a Library row whose 48px cover sits at an x centre of about 58 makes the 180x270 cover expand centred on that point, hanging about 32px off the left edge. Native used to clamp on instant opens (`const anchored = opts.instant ? clampToViewport(cx, cy) : { x: cx, y: cy };`), shifting the same tap right and down.

`begin()` now always anchors on the raw origin centre (`const anchored = { x: cx, y: cy };`), and the provider's `clampToViewport` helper was removed. The finger follow clamp inside the frame callback (tracking phase only) is untouched, matching the web.

### 5. Freeze all cover motion the instant the closing fade starts

The web closing effect cancels the requestAnimationFrame loop before applying the CSS `opacity 240ms ease-out` fade, so the cover freezes wherever the spring had reached (for a cached or bundled book that loads in about 50ms, openness around 0.1 to 0.3) and fades out in place. Native's `useFrameCallback` used to keep integrating the spring through the closing phase; gesture commits froze target so drift was negligible, but instant opens have target = 1, so a book that loaded before the spring settled kept expanding and translating toward the screen anchor for the whole 240ms fade, most visible on the three bundled books and any cached book.

The spring integration in the frame callback is now guarded with `phaseSV.value !== 2`, and the closing effect (plus the loaded at release fast path) also sets `target = openness` and `velocity = 0`, so the cover fades out frozen in place exactly like the web.

### 6. Faux page text as dashed word strips, not solid ruled lines

Each web line is a 2px repeating gradient of ink dashes: `repeating-linear-gradient(90deg, ink 0 {wordPx}px, transparent {wordPx}px {wordPx + 2.4}px)` with `wordPx = 3.6 + ((row * 3) % 4) * 0.5` varying per row, `ink = 'rgba(74,55,40,0.32)'`, line width `calc(w% - indentPx)` with a 7px `marginLeft` indent on each paragraph's first line, deliberately broken text. Native used to draw solid Views at full width `${w}%` (indent not subtracted, so first lines extended 7px too far right) with `opacity: 0.75 + ((row % 3) * 0.06)` as a stand in and no word gaps at all.

Each line is now a clipped row of small dash Views: dash width `wordPx = 3.6 + ((row * 3) % 4) * 0.5` computed before the row increment (matching the web's sequence exactly), 2.4px gaps, 2px tall, borderRadius 999, constant color `rgba(74,55,40,0.32)`, and the per row opacity variation removed entirely. First lines use a container of width `${w}%` with `paddingLeft: 7` and `overflow: 'hidden'`, reproducing web's `calc(w% - 7px)` width plus `marginLeft: 7` so dashes start 7px in and the right edge lands at w% of the column; enough dashes are rendered to overfill and let the clip do the work, since RN has no repeating gradient. Everything that already matched stayed: paragraph line widths `[97, 92, 95, 67]`, `[94, 90, 96, 85, 51]`, `[92, 88, 94, 60]`, the heading mark (centred, 46% width, 3px height, opacity 0.9, marginBottom 9), gap 5 between lines, 8px paragraph spacing, and container insets (top and bottom 14%, left 39%, right 9%).

### 7. Skip the 'committed' phase when content is already loaded at release

On the web, `onUp` checks a ref mirror synchronously (`setPhase(loadedRef.current ? 'closing' : 'committed')`), so if the fetch and parse finished while the finger was still down, the badge is never rendered and the fade begins immediately on release. Native's `release()` used to unconditionally set phase 'committed' (`phaseSV.value = 1`), then flip to 'closing' after the commit render painted, so the badge row could flash for a frame or two.

A `loadedRef` mirror is now set alongside `setLoaded` and read synchronously in `release()`. When already loaded the phase goes straight to 'closing' with `phaseSV.value = 2`, the target frozen at the current openness and velocity zeroed (consistent with issue 5), so the badge never mounts.

### 8. Replace the ActivityIndicator with a spinning 14px Loader2

The web badge is `bg-cream/95 rounded-full px-4 py-2` with 8px gap, `ring-1 ring-espresso/10 shadow-lg`, fixed 40px from the bottom, centred, containing lucide `Loader2` at size 14 in `text-coral-accent` with `animate-spin` (1s linear infinite rotation) plus 'Brewing your book…' at 12px font medium espresso. Native had the same container metrics (`t.paperA(0.95)`, border `t.inkA(0.1)`, padding 16/8, gap 8, bottom 40, radius 999) and identical copy and typography, but the spinner was `<ActivityIndicator size="small" color={t.accent} />`, Android's material arc at about 20dp.

A new shared `Spinner` component wraps lucide-react-native's `Loader2` at size 14 in `t.accent` inside a reanimated view spinning `withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1)` driving a rotate transform, matching the web's once per second linear infinite rotation. It is used in both the transition badge and the surviving ReaderScreen cold mount badge; both `ActivityIndicator` usages are removed.

### 9. Verify the cover scaling model at rest

The web `apply()` resizes the layout box each frame (`wrap.style.width/height = COVER_W * scale`) and positions with translate only, so the BookCover's 12px right radius, 1px ring, stitch inset, and text sizes are constant CSS pixels at every openness and at openness 0 the floating cover is pixel identical to the md card cover it replaces. Native uses a fixed 180x270 render transform scaled about its centre, so constant pixel details scaled: at a 48px row the 12px/3px corner radii rested at roughly 3.2px visual radius versus the card's 12px, popping at pickup and at cancel settle.

Verified on paper that it did NOT coincide at rest, and the fix was applied. An animated style in the Overlay counter scales the four radii by `1/scale` on both the page (new `pageStyle` prop on BookCover) and the cover face (merged into `faceStyle`), so the on screen radii are a constant 12px/3px at every openness, exactly like the web's layout resize model. Border widths were deliberately left scaled: `borderWidth` is a layout prop in RN and animating it would relayout every frame, and the divergence is a fraction of a pixel. Residual divergence remains in the generated cover type size (the overlay draws at 180 wide and scales down while card type is fixed per size, so cover text renders about 20% smaller than the card at pickup); Michael should eyeball pickup on device.

### 10. Reader screen navigation animation should be 'none'

The web `onComplete` fires exactly `CLOSE_FADE_MS = 240` ms after closing starts and synchronously sets viewMode 'READING', so the storefront unmounts and the parsed reader appears the same frame; exiting the reader is likewise an instant swap with no animation. No change was needed here: `App.tsx` already registers the Reader screen with `animation: 'none'` (landed with the earlier navigation parity package). Verified in the current file that entry and exit are instant swaps around the 240ms cover fade.

## Judgment calls

- The error card state lives in the zustand store (`openError`, `showOpenError`, `dismissOpenError`, never persisted) with the card mounted once at the app root, so the transition and ReaderScreen share one card the way the web shares App level `pendingError`, instead of duplicating card UI in two places.
- The prompt suggested guarding the frame callback with `phaseSV.value < 2`, but that would also freeze the cancel spring (phase 3), so `phaseSV.value !== 2` was used and target plus velocity were frozen on the closing paths, putting both suggested mechanisms effectively in place.
- For issue 9 the counter scale was applied only to the radii. Animating `borderWidth` forces a full layout pass every frame in RN, the exact cost the prompt said to avoid, and the border divergence is under a pixel. The generated cover text still renders about 20% smaller than the card at pickup; fixing that would mean scaling type dynamically inside the shared BookCover, which was left alone and flagged for an on device look.
- A cancelled open that finishes downloading mid spring skips the parse and stash entirely, so no orphaned `ParsedText` is retained.
- The error card shadow uses the warm espresso shadow color the toast already uses rather than pure black, keeping the two bottom cards consistent; every other metric follows the web exactly.

## Check on your phone

- [ ] Confirm: tap a book you have read before. The cover freezes and melts away where it is, not growing while it fades, and the reading page is there the instant the cover is gone, with no extra fade and no brewing message inside the reader.
- [ ] Confirm: turn on airplane mode and tap a book you have never opened. The cover slides back to its shelf first, then a cream card appears at the bottom saying it could not open the book, with the actual reason in smaller italic text and a little X. It stays until you tap the X. No Try again button, no error page.
- [ ] Confirm: in the Library list, tap a book in a row near the left edge. The opened cover is allowed to hang off the edge of the screen, matching the web.
- [ ] Confirm: press and hold a book until the page peeks out. The fake text looks like rows of tiny dashes, like blurred words, not solid drawn lines.
- [ ] Confirm: keep holding a slow book until the brewing pill appears. The spinner is a thin coral line icon spinning smoothly and small, not the standard Android spinner.
- [ ] Confirm: hold a book for a few seconds so it finishes loading, then let go. It fades out right away without the brewing pill blinking on screen first.
- [ ] Confirm: at the moment you press a book, the floating cover's corners look as round as the card underneath, with no visible pop or seam at pickup (the generated cover text still renders a touch smaller than the card, which is the one known residual).

Everything else in this package (parse caching and data threading, the shared store error state, and the Reader screen's `animation: 'none'` registration) was verified in code and by review, including a clean `npx tsc --noEmit` and an independent adversarial pass that checked every constant, timing, and copy string against the web source with no unresolved findings.
