# Book Open Transition Internals and Error Flow

> **Status: implemented and committed 2026-07-13.** Commit `61d1926` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings.


## Mission

Bring the native book open transition (`src/open/OpenTransition.tsx` and the adjacent loading and error paths in `src/screens/ReaderScreen.tsx`) to exact parity with the web app's `BookOpenTransition`. The big items: parse the book text during the transition so the reader is fully ready the moment the fade ends, freeze all cover motion the instant the closing fade starts, match the web's error flow (spring back, then a persistent dismissible cream error card, no retry button, no full screen error page), render the faux page text as dashed word strips, swap the platform spinner for a spinning 14px Loader2, leave instant open anchors unclamped, skip the 'committed' badge flash when content is already loaded at release, verify the cover scaling model at rest, and make the Reader screen's navigation animation instant.

## Context

Focus Reader is a cozy speed reading app for public domain books. It exists twice:

- Web app at `C:/Users/Michael/Desktop/Focus Reader`. This is the READ ONLY source of truth for look and behavior. Never modify anything in this repo. Open its files freely to check constants, copy, and timings.
- Native app at `C:/Users/Michael/Desktop/Focus Reader Android`. ALL changes go here. Expo SDK 54, React Native 0.81, reanimated 4, gesture-handler 2.28, zustand, expo-image, expo-haptics, lucide-react-native, react-navigation native-stack.

This is a full React Native app. Never introduce a WebView.

How the transition works on both platforms: pressing a book card lifts a floating 180x270 cover (`COVER_W`/`COVER_H`) that springs toward the finger while the book text downloads in parallel. Release inside the card commits the open; the cover freezes mid air, a "Brewing your book…" badge shows if the text is still loading, and once loaded the cover fades out over 240ms (`CLOSE_FADE_MS`) and hands off to the reader. Release outside cancels and springs the cover back to its slot. A quick tap is an instant open (web calls this `autoCommit`). On web this all lives in `src/components/Reader/BookOpenTransition.tsx` orchestrated by `src/App.tsx`; on native it lives in `src/open/OpenTransition.tsx` (a context provider plus an `Overlay` driven by reanimated shared values) which navigates to the `Reader` screen when the fade completes.

## Before you start

1. Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect branch `feat/native-ui-web-parity`.
2. WARNING: another session may hold uncommitted changes in `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, `src/reader/useReelEngine.ts`, and `app.json`. This task touches `src/screens/ReaderScreen.tsx`, which sits right next to those files and imports from `src/reader/`. Read the current state of every file before editing it, keep your edits surgical, and do not revert or reformat changes you did not make. Do not touch the four files listed above at all.
3. This package ideally runs after the book-pickup-and-instant-open package. If that package already changed `src/open/OpenTransition.tsx`, work from the file as it now stands.
4. Line numbers below were verified recently but files drift. If a listed line number does not match, trust the described behavior and re-locate the code.

## Issues to fix

### 1. Close the transition on parse completion, not on download completion

Delta id: `transition-close-parse-timing`. Severity: medium.

Web (`src/App.tsx:170-194`, `196-211`, `365`): App.tsx fetches `library.fetchContent(book)`, runs `parseText(text)` synchronously, injects authored scene chapters into the parsed result, and only then sets `pendingParsed`:

```ts
const scenes = getScenes(pending.book.id);
if (scenes.length > 0) {
    parsed.chapters = scenes.map((s) => ({ title: s.label, wordIndex: s.startIndex, lineIndex: 0 }));
    parsed.chapterConfidence = 'high';
}
setPendingParsed(parsed);
```

The transition's `loaded` prop is `pendingParsed !== null` (App.tsx:365). The 240ms close fade therefore starts only after the book is fully parsed, and `onComplete` swaps straight into a fully ready reader. There is no in reader loading state at all on web.

Native (`src/open/OpenTransition.tsx:134-146`, `275-287`; `src/screens/ReaderScreen.tsx:58-73`, `226-254`): `begin()` calls `prefetchContent(book)` (`src/services/library.ts:113-125`) which resolves with the raw stripped but unparsed text; `setLoaded(true)` fires on download, the 240ms fade runs, then `navigationRef.navigate('Reader')`. ReaderScreen then re-awaits `fetchContent` (reusing the in flight promise) and runs `parseText` in a `useMemo` during render (line 72). While `parsed.tokens.length === 0` it renders a full screen loading view with its own back chevron and a duplicate 'Brewing your book…' badge, and the synchronous parse of a large book blocks the JS thread after the fade already ended. The web never shows this gap.

Change: gate `loaded` on parse completion.

- In `begin()`, after `prefetchContent(book)` resolves, run `parseText(text)` plus the scenes to chapters mapping shown above (`getScenes` lives in `src/services/scenes.ts` on native, same as the reader already uses at ReaderScreen.tsx:77-83), cache the resulting `ParsedText` keyed by book id, and only then call `setLoaded(true)`. Running the parse synchronously at that moment matches the web, which also parses on the main thread while the cover is still up.
- Add a small cache module or export from `src/services/library.ts`, for example `consumeParsed(bookId): ParsedText | null`, that ReaderScreen checks first. Clear the entry after consumption so stale parses never leak across opens.
- ReaderScreen should consume the cached `ParsedText` so the reader is fully formed the frame the fade completes and the 'Brewing your book…' screen never appears on transition driven opens. Keep the existing fetch plus parse path as a fallback for cold ReaderScreen mounts (deep links, state restore), but it should be unreachable via the open transition.
- Make sure the scene chapter mapping is not applied twice. ReaderScreen's `chapters` useMemo (lines 77-83) produces the same mapping; either keep it (it is idempotent, same output) or have it prefer `parsed.chapters` when the cached parse already carries scene chapters with `chapterConfidence === 'high'`.

### 2. Failed opens show a persistent dismissible error card, after the cancel spring settles

Delta id: `transition-error-ui`. Severity: medium.

Web (`src/App.tsx:189-192`, `373-384`; `src/components/Reader/BookOpenTransition.tsx:344-353`): the fetch catch stores the error message (`e.message`, fallback `'Could not open that book.'`). The transition reacts to the `error` prop: `haptics.error()` then springs the cover back to its slot. Only after cancel completes and `pending` clears does App render (condition `pendingError && !pending`) a fixed card: `bottom-6` (24px), centered (`left-1/2 -translate-x-1/2`), `z-[90]`, `max-w-sm` (384px), `w-[calc(100%-2rem)]`, `bg-cream rounded-2xl ring-1 ring-coral-accent/30 shadow-xl px-4 py-3 flex items-start gap-3`. Inside: bold 13px "Couldn't open that book." plus the specific error message in italic mocha below (e.g. 'No readable plain-text edition is available for this title.'), and an X dismiss button (lucide `X`, size 16, mocha). It persists until dismissed.

Native (`src/open/OpenTransition.tsx:135-145`; `src/components/Toast.tsx:20-33`, `52-62`): the `prefetchContent` rejection handler runs `haptics.error()`, `showToast("Couldn't open that book.")` immediately while the cover is still springing back, then cancels. The toast is the store's transient bubble (in over 290ms, hold 1750ms, fade out 360ms, the web `toastPop` envelope), carries no error detail and no dismiss control, and is styled as the save confirmation pill with the coral Bookmark medallion rather than an error card.

Change:

- In the rejection handler keep `haptics.error()` and the cancel (target 0, `phaseSV = 3`, phase 'cancelling'), but remove the `showToast` call. Instead store the caught error's message (fallback 'Could not open that book.') in provider state.
- Show the error UI only after the cancel spring settles, i.e. after `onClear` runs (the `finishCancel` path at OpenTransition.tsx:258-266 ends in `runOnJS(finishCancel)`).
- Render it as a persistent card matching the web: cream/surface background (`t.surface`), borderRadius 16, borderWidth 1 with the accent color at 30% alpha, shadow, paddingHorizontal 16, paddingVertical 12, positioned near the bottom (24px plus safe area inset), centered, maxWidth 384, width = screen width minus 32. Contents: bold 13px "Couldn't open that book." headline, the caught error's message as an italic muted detail line below, and a 16px X dismiss button (lucide-react-native `X`). It stays until dismissed.
- Give the card zIndex >= 90 so it sits above the transition overlay, like the web's `z-[90]`. For reference the native toast wrap uses zIndex 95 (Toast.tsx:53) and already draws above the flying cover; that layering is fine, do not change it.
- The detailed error strings already exist in `src/services/library.ts` ('No readable plain-text edition is available for this title.' at :152, 'The downloaded file appears to be empty.' at :155, `HTTP ${res.status}` at :92); they are currently swallowed. Surface them in the card's detail line.

### 3. Remove ReaderScreen's full screen error page and Try again button

Delta id: `chrome-open-error-flow-divergence`. Severity: medium. This overlaps issue 2; coordinate so the flow is not double fixed.

Web (`src/App.tsx:170-217`, `373-384`; `src/components/Reader/BookOpenTransition.tsx:344-353`, `416-424`): fetch and parse happen during the open transition; on failure the transition fires `haptics.error()` and cancels back to the storefront, then the dismissible error card from issue 2 appears. There is no retry affordance and the reader never mounts. The reader itself has no loading screen; loading lives inside BookOpenTransition's 'Brewing your book…' badge over the storefront.

Native (`src/screens/ReaderScreen.tsx:56-70`, `154`, `226-254`): navigation commits to ReaderScreen before content resolves. While loading it shows a full screen page: a pill badge with ActivityIndicator plus 'Brewing your book…' and the book title beneath, plus a bare '‹' back glyph. On error it swaps to serif "Couldn't open that book." (19px Fraunces medium), the message in italic 13px Fraunces, and a coral 'Try again' pill that re-runs `fetchContent` via `setAttempt`, with `haptics.error()` fired on error (line 154).

Change: match the web flow. With issue 1 fixed, transition driven opens never reach ReaderScreen before content is ready, so this path only fires on cold mounts. On a ReaderScreen fetch failure: fire `haptics.error()` (web does too), return the user to the previous screen (`navigation.goBack()`, falling back to navigating to `Today` if there is nothing to go back to), and show the same persistent dismissible error card from issue 2 with the error detail. Remove the full screen error page and the 'Try again' pill entirely. Keep the plain loading view (badge plus title) for cold mounts only, per issue 1.

### 4. Instant opens must not clamp the anchor to the viewport

Delta id: `transition-instant-anchor-clamp`. Severity: medium.

Web (`src/components/Reader/BookOpenTransition.tsx:142-149`, `210-217`): in `autoCommit` mode the anchor is initialised to the tracking rect centre, raw and unclamped, and the tick only eases and clamps the anchor toward the finger while `phase === 'tracking'`; opens that mount already committed never move or clamp it. Tapping a Library row whose 48px cover sits at an x centre of about 58 makes the 180x270 cover expand centred on that point, hanging about 32px off the left edge of the viewport. `clampToViewport` (half cover plus a 12px margin) applies only to finger following during gesture tracking.

Native (`src/open/OpenTransition.tsx:117-132`): `begin()` with `instant: true` clamps:

```ts
const anchored = opts.instant ? clampToViewport(cx, cy) : { x: cx, y: cy };
```

so the same row tap expands the cover fully on screen, shifted right and down relative to the web position.

Change: for instant opens set the anchor to the raw origin centre without clamping, i.e. `const anchored = { x: cx, y: cy };` regardless of `opts.instant`. (The audit noted the native clamp is arguably nicer, but web is the source of truth; if you think it should be ported back to web instead, say so in your summary, do not act on it.)

### 5. Freeze all cover motion the instant the closing fade starts

Delta id: `transition-close-motion-not-frozen`. Severity: medium.

Web (`src/components/Reader/BookOpenTransition.tsx:355-377`): the closing effect cancels the requestAnimationFrame loop before applying the CSS fade: `cancelAnimationFrame(rafRef.current)` then transition `opacity 240ms ease-out` on the wrap and scrim. The cover freezes wherever the spring had reached (for a cached or bundled book that loads in about 50ms, that is barely above the slot, openness around 0.1 to 0.3) and fades out in place.

Native (`src/open/OpenTransition.tsx:238-267`, `275-287`): the `useFrameCallback` keeps integrating the spring through phase 2 (closing): openness keeps moving toward target. Gesture commits froze target at the commit openness so drift is negligible, but instant opens have target = 1, so when load resolves before the spring settles the cover continues expanding and translating toward the screen anchor for the whole 240ms fade. Most visible on the three bundled books and any cached book, the most common tap open case after a first read.

Change: when phase enters 'closing', stop mutating openness. Either set `target.value = openness.value` and `velocity.value = 0` in the closing effect (before or alongside `phaseSV.value = 2`), or guard the spring integration in the frame callback with `if (phaseSV.value < 2)`. Either way the cover must fade out frozen in place exactly like the web.

### 6. Faux page text must be dashed word strips, not solid ruled lines

Delta id: `transition-fauxtext-solid-lines`. Severity: medium.

Web (`src/components/Reader/BookOpenTransition.tsx:451-504`): each 2px line is a repeating gradient of ink dashes: `repeating-linear-gradient(90deg, ink 0 {wordPx}px, transparent {wordPx}px {wordPx + 2.4}px)` with `wordPx = 3.6 + ((row * 3) % 4) * 0.5` varying per row so dashes do not grid align; `ink = 'rgba(74,55,40,0.32)'`; line width is `calc(w% - indentPx)` with a 7px `marginLeft` indent on each paragraph's first line. The component comment states the text is deliberately broken, not solid ruled lines.

Native (`src/open/OpenTransition.tsx:351-376`, `421`): lines are solid Views: backgroundColor ink at full width `${w}%` (indent not subtracted, so first lines extend 7px further right than web) with `opacity: 0.75 + ((row % 3) * 0.06)` as a stand in for the dash variation. No word gaps at all. (Native also increments `row` before computing opacity, but that variation is being removed anyway.)

Change: render each line as a row of small dash Views reproducing the web pattern: dash width `wordPx = 3.6 + ((row * 3) % 4) * 0.5`, 2.4px gap between dashes, 2px height, borderRadius 999, constant color `rgba(74,55,40,0.32)`. Remove the opacity variation entirely. Handle the indent so first lines end at the same right edge as web: a container of width `${w}%` with `paddingLeft: 7` and `overflow: 'hidden'` reproduces web's `calc(w% - 7px)` width plus `marginLeft: 7` exactly (dashes start 7px in, right edge lands at w% of the column). Render enough dashes to overfill and let `overflow: 'hidden'` clip, since RN has no repeating gradient. Keep everything that already matches: paragraph line widths `[97, 92, 95, 67]`, `[94, 90, 96, 85, 51]`, `[92, 88, 94, 60]`, the heading mark (centred, 46% width, 3px height, opacity 0.9, marginBottom 9), gap 5 between lines, 8px paragraph spacing, and container insets (top and bottom 14%, left 39%, right 9%, at `s.fauxWrap` line 421).

### 7. Skip the 'committed' phase when content is already loaded at release

Delta id: `transition-committed-badge-flash`. Severity: low.

Web (`src/components/Reader/BookOpenTransition.tsx:287-301`): `onUp` checks a ref mirror synchronously: `setPhase(loadedRef.current ? 'closing' : 'committed')`. If the fetch and parse finished while the finger was still down, the badge is never rendered; the fade begins immediately on release.

Native (`src/open/OpenTransition.tsx:161-173`, `270-272`): `release()` unconditionally sets phase 'committed' (and `phaseSV.value = 1`); the `loaded && phase === 'committed'` effect then flips to 'closing' after the commit render paints, so the badge row mounts and can flash for a frame or two.

Change: in `release()`, read the current loaded state synchronously (add a ref mirror of `loaded` in the provider, as the web does with `loadedRef`; the `loaded` state variable itself is stale inside the callback) and when already loaded go straight to 'closing' with `phaseSV.value = 2`, bypassing 'committed'. Still freeze the cover (`target.value = openness.value`) on that path, consistent with issue 5.

### 8. Replace the ActivityIndicator with a spinning 14px Loader2

Delta id: `transition-badge-spinner-icon`. Severity: low.

Web (`src/components/Reader/BookOpenTransition.tsx:416-424`): the badge is `bg-cream/95 rounded-full px-4 py-2` with 8px gap, `ring-1 ring-espresso/10 shadow-lg`, fixed 40px from the bottom, centred, containing lucide `Loader2` at size 14 in `text-coral-accent` with `animate-spin` (1s linear infinite rotation) plus 'Brewing your book…' at 12px font medium espresso.

Native (`src/open/OpenTransition.tsx:339-346`, `413-420`): same container metrics (`t.paperA(0.95)`, border `t.inkA(0.1)`, padding 16/8, gap 8, bottom 40, radius 999) and identical copy and typography, but the spinner is `<ActivityIndicator size="small" color={t.accent} />`, Android's material arc at about 20dp, a different glyph, size, and motion.

Change: replace the ActivityIndicator with lucide-react-native's `Loader2` at size 14 in `t.accent`, wrapped in a reanimated view spinning 360 degrees per second, linear, infinite (`withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1)` driving a rotate transform). Apply the same swap to the ReaderScreen loading badge (ReaderScreen.tsx:234-237) if that view survives issues 1 and 3.

### 9. Verify the cover scaling model coincides at rest

Delta id: `transition-cover-scaling-model`. Severity: low. This one is verify first, change only if needed.

Web (`src/components/Reader/BookOpenTransition.tsx:152-170`; `src/components/Input/BookCover.tsx:143-172`): `apply()` resizes the layout box each frame (`wrap.style.width/height = COVER_W * scale`) and positions with translate3d only, no scale transform. The BookCover re-lays-out at the current size, so its 12px right radius, 1px ring, stitch inset, and text sizes are constant CSS pixels at every openness; at openness 0 the floating cover is pixel identical to the md card cover it replaces.

Native (`src/open/OpenTransition.tsx:293-308`; `src/components/BookCover.tsx:58-91`): the wrap is a fixed 180x270 render transform scaled about its centre (translateX, translateY, then scale). Centre point math matches the web exactly, but constant pixel details scale: at a 144px card the radii render at 12 * 0.8 = 9.6px and borders at 0.8px, diverging slightly from the card underneath at pickup and from web mid flight. Native cover type is width proportional (BookCover.tsx:77-79), so the scaled type coincidentally matches the card at openness 0 but grows toward 180px sized type at full open, where web type stays fixed.

Change: geometry (position and size envelope) already matches; this is only the interior constant pixel details. Layout animating width and height on the UI thread is more expensive in RN than a transform scale, so do NOT switch wholesale. Instead: reason through (and let Michael eyeball on device) whether the openness 0 overlay visually coincides with the card cover it replaces. If a visible seam exists at pickup, counter scale the radii and border widths (divide by the current scale inside the animated style) rather than animating layout. If it coincides at rest, leave the model as is and note the residual mid flight divergence in your summary.

### 10. Reader screen navigation animation should be 'none'

Delta id: `transition-reader-nav-fade`. Severity: low.

Web (`src/App.tsx:196-211`, `228-231`; `src/components/Reader/BookOpenTransition.tsx:366-376`): `onComplete` fires exactly `CLOSE_FADE_MS = 240` ms after closing starts and synchronously sets viewMode 'READING': the storefront unmounts and the fully parsed reader appears the same frame. Total handoff is the 240ms fade, nothing more. Exiting the reader (back, swipe down) is likewise an instant swap back to the storefront with no animation.

Native (`App.tsx:81-85` in the native repo root; `src/open/OpenTransition.tsx:275-287`): the same 240ms timer calls `navigationRef.navigate('Reader')`, but the Reader screen is registered with `options={{ animation: 'fade' }}`, adding the native stack fade (roughly 350ms default on Android) on top before the reader is fully visible; goBack from the reader plays the reverse fade, which the web does not have.

Change: set the Reader screen's options to `{ animation: 'none' }` so it appears and disappears instantly after the cover fade. Note the native root `App.tsx` is currently clean in git, but `app.json` nearby is dirty from the other session; touch only the screen options line.

## Acceptance checklist

- [ ] 1. Opening a book via the transition lands in a fully rendered reader the frame the 240ms fade completes; the ReaderScreen 'Brewing your book…' loading view never appears on transition driven opens (only on cold mounts), because `setLoaded(true)` now fires after `parseText` plus scene chapter mapping, and ReaderScreen consumes the cached ParsedText.
- [ ] 2. A failed open springs the cover back, and only after the spring settles shows a persistent bottom card (cream surface, 16px radius, accent border at 30% alpha, zIndex >= 90) reading "Couldn't open that book." in bold 13px with the real error detail in italic below and a 16px X that is the only way it goes away; no transient toast pill fires for this path.
- [ ] 3. ReaderScreen has no full screen error page and no 'Try again' button; a cold mount failure fires haptics.error(), goes back, and shows the same dismissible error card.
- [ ] 4. An instant open (quick tap) expands the cover centred on the raw origin centre; tapping a Library row near the screen edge lets the open cover hang off screen exactly as the web does, with no viewport clamp.
- [ ] 5. When the closing fade starts, the cover freezes in place; a fast loading bundled or cached book fades out barely above its slot instead of continuing to fly toward full open during the 240ms.
- [ ] 6. Holding a book past roughly 55% open shows faux page text made of small dashes (dash width 3.6 to 5.1px varying per row, 2.4px gaps, 2px tall, constant ink rgba(74,55,40,0.32), no per row opacity variation) with first lines indented 7px and ending at the same right edge as other lines.
- [ ] 7. Releasing a held book whose text already finished loading goes straight to the fade with no 'Brewing your book…' badge flashing for a frame.
- [ ] 8. The brewing badge (and any surviving ReaderScreen badge) uses a 14px Loader2 icon in the accent color rotating once per second linearly, not the platform ActivityIndicator.
- [ ] 9. The cover scaling model was verified: at openness 0 the floating cover visually coincides with the card cover, or radii and borders were counter scaled to make it so; the decision and reasoning appear in the summary.
- [ ] 10. The Reader screen is registered with `animation: 'none'`; total open handoff is the 240ms cover fade with no extra stack fade, and backing out of the reader swaps instantly.

## Verification

1. Type check the native repo: run `npx tsc --noEmit` in `C:/Users/Michael/Desktop/Focus Reader Android`. Fix any errors you introduced.
2. Reason through the running behavior carefully for each delta: the phase state machine ('tracking' → 'committed' → 'closing', or → 'cancelling'), the shared value phases (0 through 4), what the frame callback does in each, and the order of setLoaded, parse, fade, navigate. Walk the three open paths (hold and release inside, hold and release outside, quick tap) plus the failure path end to end on paper.
3. Do NOT use the Expo web build to verify anything. Its dev server opens blank localhost tabs in the real browser and the web bundle breaks on zustand's import.meta. On device checking is done by Michael on his Android phone.

End your summary by telling Michael exactly what to look at on his phone, in plain everyday English. Cover at least these checks:

- Tap a book you have read before. The cover should freeze and melt away where it is, not keep growing while it fades, and the reading page should be there the instant the cover is gone, with no extra fade and no brewing message inside the reader.
- Turn on airplane mode and tap a book you have never opened. The cover should slide back to its shelf first, then a cream card should appear at the bottom saying it could not open the book, with the actual reason in smaller italic text and a little X. The card should stay until the X is tapped. There should be no Try again button and no error page.
- In the Library list, tap a book in a row near the left edge. The opened cover is allowed to hang off the edge of the screen, that matches the web.
- Press and hold a book until the page peeks out. The fake text on the page should look like rows of tiny dashes, like blurred words, not solid drawn lines.
- Keep holding a slow book until the brewing pill appears. The spinner should be a thin coral line icon spinning smoothly, small, not the standard Android spinner.
- Hold a book for a few seconds so it finishes loading, then let go. It should fade out right away without the brewing pill blinking on screen first.

## Final note

When summarizing work for Michael, use plain everyday language and avoid dashes in prose. Restructure sentences with commas or periods instead.

---

## Outcome, recorded 2026-07-13

Implemented in commit `61d1926` on `feat/native-ui-web-parity` in the native repo.

Files changed: `App.tsx`, `src/components/BookCover.tsx`, `src/components/OpenErrorCard.tsx`, `src/components/Spinner.tsx`, `src/open/OpenTransition.tsx`, `src/screens/ReaderScreen.tsx`, `src/services/library.ts`, `src/store.ts`.

### Issue by issue

**1. Close the transition on parse completion, not download completion** (done)

begin() now parses the downloaded text and applies the scene to chapter mapping while the cover is still up, stashes the ParsedText in library.ts (stashParsed/consumeParsed, cleared on consumption), and only then sets loaded. ReaderScreen consumes the stash on mount so it renders fully formed the frame the fade ends; the fetch plus parse path remains only as a cold mount fallback. A cancelled open skips the parse so nothing stale is stashed.

**2. Persistent dismissible error card after the cancel spring settles** (done)

The rejection handler keeps haptics.error() and the cancel, drops the toast, and parks the real error message (fallback 'Could not open that book.') in a ref. clear(), which runs from finishCancel after the spring settles, promotes it to new store state openError. New OpenErrorCard component matches the web card: surface background, radius 16, accent border at 30 percent alpha, shadow, 16/12 padding, bottom 24 plus safe inset, maxWidth 384, width screen minus 32, zIndex 90, bold 13px headline, italic muted detail, 16px X dismiss. begin() dismisses any lingering card, same as the web.

**3. Remove ReaderScreen's full screen error page and Try again** (done)

Error page, Try again pill, error/attempt state, and the error haptic effect are gone. A cold mount fetch failure fires haptics.error(), shows the same persistent card via the store, and goes back (falls back to navigating to Today when there is nothing to go back to). The loading badge view survives for cold mounts only.

**4. Instant opens must not clamp the anchor** (done)

begin() now always anchors on the raw origin centre; the provider's clampToViewport helper was removed. The finger follow clamp inside the frame callback (tracking phase only) is untouched, matching the web.

**5. Freeze all cover motion when the closing fade starts** (done)

Spring integration in the frame callback is guarded with phaseSV.value !== 2, and the closing effect (plus the loaded at release fast path) also sets target = openness and velocity = 0. Note: the prompt suggested a 'phaseSV.value < 2' guard, but that would also freeze the cancel spring (phase 3), so the not equal 2 form was used.

**6. Faux page text as dashed word strips** (done)

Each line is now a clipped row of small dash Views: dash width 3.6 + ((row*3)%4)*0.5 computed before the row increment (matching the web's sequence exactly), 2.4px gaps, 2px tall, radius 999, constant rgba(74,55,40,0.32), no opacity variation. First lines use a container of w% with paddingLeft 7 and overflow hidden so the right edge lands at w% like the web's calc. Heading mark, line widths, gaps, paragraph spacing, and insets unchanged.

**7. Skip 'committed' when content is already loaded at release** (done)

A loadedRef mirror is set with setLoaded and read synchronously in release(); when already loaded the phase goes straight to 'closing' with phaseSV = 2, target frozen at the current openness and velocity zeroed, so the badge never mounts.

**8. Replace ActivityIndicator with spinning 14px Loader2** (done)

New shared Spinner component (lucide Loader2 inside a reanimated view, withRepeat withTiming 360deg over 1000ms linear, infinite). Used in both the transition badge and the surviving ReaderScreen cold mount badge; both ActivityIndicator usages removed.

**9. Verify the cover scaling model at rest** (done)

Verified on paper: it did NOT coincide at rest. The transform scaled wrap shrinks the 12px/3px corner radii and 1px borders with the cover (a 48px row cover rested at roughly 3.2px visual radius versus the card's 12px, popping at pickup and at cancel settle). Fix applied: an animated style in the Overlay counter scales the four radii by 1/scale on both the page (new pageStyle prop on BookCover) and the cover face (merged into faceStyle), so the on screen radii are constant 12px/3px at every openness, exactly like the web's layout resize model. Border widths were deliberately left scaled: borderWidth is a layout prop in RN and animating it would relayout every frame; the divergence is a fraction of a pixel. Residual divergence noted in the summary (generated cover type size, interior insets); Michael should eyeball pickup on device.

**10. Reader screen navigation animation 'none'** (done)

No change needed: App.tsx already registers Reader with animation: 'none' (landed with the earlier navigation parity package). Verified in the current file; entry and exit are instant swaps around the 240ms cover fade.

### Judgment calls made during implementation

1. The error card state lives in the zustand store (openError, showOpenError, dismissOpenError, never persisted) with the card mounted once at the app root. That lets the transition and the ReaderScreen share one card exactly the way the web shares App level pendingError, instead of duplicating card UI in two places. 2. The prompt's suggested frame callback guard (phaseSV.value < 2) would have frozen the cancel spring too, since cancelling is phase 3; I used phaseSV.value !== 2 and also froze target and velocity on the closing paths, so both suggested mechanisms are effectively in place. 3. For issue 9 I judged that a seam does exist at rest (corner radii and hairline borders shrink with the transform scale) and applied the counter scale the prompt described, but only to the radii: animating borderWidth forces a full layout pass every frame in React Native, which is the exact cost the prompt said to avoid, and the border divergence is under a pixel. Generated cover text still renders about 20 percent smaller than the card at pickup (the overlay draws at 180 wide and scales down while card type is fixed per size); fixing that would mean scaling type dynamically inside the shared BookCover, which I left alone and flagged for an on device look. 4. A cancelled open that finishes downloading mid spring skips the parse and stash entirely, so no orphaned ParsedText is retained. 5. The package 03 decision about cover accessory inks did not come up in this package; nothing was changed there. 6. Error card shadow uses the warm espresso shadow color the toast already uses rather than pure black, keeping the two bottom cards consistent; metrics follow the web exactly.

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
