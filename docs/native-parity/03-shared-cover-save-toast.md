# Native parity 03: shared components (BookCover, save ribbon, skeleton, toast)

> **Status: implemented and committed 2026-07-13.** Commit `30a2cd4` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings. Michael chose to KEEP the native pinned cover inks (issue 3, option b); the matching web port landed separately in the web repo the same day.


## Mission

Bring four shared visual components of the native Focus Reader app to pixel and behavior parity with the web app: BookCover (generated cover type sizes, ruled page lines, loading face, failed image retry, accessory ink colors), the leather save ribbon (grain texture and touch zones), CoverSkeleton (pulse animation and Today shelf sizing), and the Toast (exit motion). Nine issues, each described below with exact constants. Work only in the native repo.

## Context

Focus Reader is a cozy speed reading app for public domain books. Two codebases exist:

- Web app (source of truth): `C:/Users/Michael/Desktop/Focus Reader`. This repo is READ ONLY for you. Open its files to check look and behavior, never modify anything in it.
- Native app (where all changes go): `C:/Users/Michael/Desktop/Focus Reader Android`. Expo SDK 54, React Native 0.81, reanimated 4, gesture-handler 2.28, zustand, expo-image, expo-haptics, lucide-react-native, react-navigation native-stack.

This is a full React Native app. Never introduce a WebView. The goal for every issue is that the native component matches the web component exactly, using the same constants, copy strings, and timings.

## Before you start

1. Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect branch `feat/native-ui-web-parity`.
2. Another session may hold uncommitted changes in `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, `src/reader/useReelEngine.ts`, and `app.json`. Read the current state of any file before editing it, and do not revert changes you did not make.
3. Line numbers below were verified recently but files move. If a listed line number has drifted, trust the described behavior and re-locate the code.

## Issues to fix

### 1. Generated cover title size must be fixed, not scaled by width

Web (`src/components/Input/BookCover.tsx:69-71`): titleSize is fixed per size prop. `sm` = 11px, `md` = 15px, regardless of rendered cover width. A 176px staff pick cover and a 144px card both use 15px; a 48px wide recent row cover (StoreFront.tsx:231-232 uses size='sm' inside a 48px slot) uses 11px. Eyebrow (7px sm / 8px md) and author (8px sm / 10px md) are fixed too. The web also applies `leading-tight` (line height 1.25) to cover titles (BookCover.tsx:104, 118, 132).

Native (`src/components/BookCover.tsx:77`): `titleSize = sm ? Math.max(9, width * 0.125) : Math.max(11, width * 0.104)`. At width 144 this lands at about 15 and happens to match, but at width 176 (shelf cards) it becomes about 18.3px, and at width 48 (sm rows) it becomes 9px instead of 11px. Eyebrow and author sizes are already fixed at 7/8 and 8/10 and match.

Change: `const titleSize = sm ? 11 : 15;`. Also give the title Text a line height of `titleSize * 1.25` (the `s.title` style at BookCover.tsx:213 has no lineHeight today; set it inline next to fontSize since it depends on titleSize).

### 2. Ruled page lines must fill the whole revealed region

Web (`src/components/Input/BookCover.tsx:146-155`): the page revealed under the cover draws `repeating-linear-gradient(to bottom, rgba(107,85,68,0.30) 0 1px, transparent 1px 6px)` across a region inset 14% top and bottom, 40% left, 10% right, at opacity 0.5. That is a 1px line every 6px filling the whole region no matter the cover height. Visible whenever the cover peels during the open transition.

Native (`src/components/BookCover.tsx:180-186` RuledLines, region style `s.ruled` at line 198): renders exactly 14 one pixel Views with marginBottom 5, so 84px of lines total. For a 144px wide cover the page is 216px tall and the ruled region is about 155px tall, so lines cover only the top 54% and the lower half of the revealed page is blank. Colors, 6px pitch, region insets (14% / 40% / 10%), and 0.5 opacity already match.

Change: derive the line count from the region height. Pass the cover height (which is `width * 1.5`) into `RuledLines` and render `Math.ceil(height * 0.72 / 6)` lines (0.72 because 14% is inset top and bottom), keeping the 1px line, 5px gap, `rgba(107,85,68,0.30)` color, and the existing container. The region already has `overflow: 'hidden'` so a slight overshoot is fine. An SVG pattern that tiles the region is an acceptable alternative.

### 3. Cover accessory inks: pinned vs theme derived

This was originally a divergence: the web app resolved cover styling tokens dynamically against the theme (leading to a dark mode issue where label text was drawn cream-on-white and was nearly unreadable). The native app resolved this by pinning label inks to fixed light-mode colors.

This has been reconciled. The web app was updated (in `src/components/Input/BookCover.tsx`) to match the native app's pinned behavior:
* Image and label cover stitches and spines now use pinned RGBA colors (`rgba(251,245,234,0.4)` and `rgba(58,42,30,0.2)` / `rgba(58,42,30,0.15)`) rather than theme tokens.
* Label author text is pinned to `#6B5544` and label title text is pinned to `#3A2A1E`.
* Page edge and gutter shadow are pinned to `rgba(58,42,30,0.1)` and `rgba(58,42,30,0.15)`.

Native (`src/components/BookCover.tsx`): matches the above pinned colors exactly. The solid variant's on tint text is set to `t.surface` in both modes for all tints.

### 4. Cover image loading face, fade, and fetch priority

Web (`src/components/Input/BookCover.tsx:79-97` and `46-48`): while a cover image loads, the cover face has no background (`coverBg = ''`), so the under cover page (ruled lines, gutter shadow) shows through. The img pops in with no transition. `loading` is `'lazy'` (offscreen shelf covers do not fetch until scrolled near) unless `priority` is true (hero slots), which is eager plus `fetchPriority="high"`. The web passes `priority` on exactly three hero slots: the hero pick (StoreFront.tsx:831), the resume hero (StoreFront.tsx:992), and today's pick (StoreFront.tsx:1065).

Native (`src/components/BookCover.tsx:95-106`): `coverBg = t.surfaceSunken` paints a solid sunken block while loading; expo-image `transition={150}` crossfades the image in; every mounted cover fetches immediately (shelves are plain ScrollViews so all children mount), and BookCover exposes no priority prop.

Change, three parts:

1. When `showImage`, set `coverBg = 'transparent'` so the ruled page beneath shows through during load.
2. Set `transition={0}` on the expo-image so the image pops in like the web.
3. Add a `priority?: 'high' | 'low'` prop to native BookCover, default `'low'`, passed straight to expo-image's `priority` prop. Pass `priority="high"` at the native hero call sites: `src/screens/TodayScreen.tsx:330` (resume hero), `src/screens/TodayScreen.tsx:385` (today's pick hero), and `src/screens/VibeScreen.tsx:177` (vibe hero pick). This approximates the web's lazy versus eager tiering.

Leave `cachePolicy="disk"` alone; it is the right native translation of the browser HTTP cache.

### 5. Failed cover flag must reset when the URI changes

Web (`src/components/Input/BookCover.tsx:62-66`): failure state is the failed URL string, not a boolean. `showImage = !!coverUrl && failedUrl !== coverUrl`, so when the same mounted BookCover is handed a different coverUrl the image is attempted again automatically.

Native (`src/components/BookCover.tsx:60, 71-72, 105`): `const [failed, setFailed] = useState(false)` is set true in onError and never reset; `showImage = !!uri && !failed`, so a reused component instance whose `id` or `coverUrl` prop changes (recycled row, rotating hero slot) keeps the generated fallback forever.

Change: track the failed URI. `const [failedUri, setFailedUri] = useState<string | null>(null)`, `showImage = !!uri && failedUri !== uri`, and `onError={() => setFailedUri(uri!)}`. No effect needed; the string comparison self resets exactly like the web.

### 6. Leather ribbon grain texture (bake PNGs) and drape shadow blur

Web (`src/components/Input/LeatherBookmark.tsx:20-60`): the strap is rasterized once per theme to a PNG at 120x278 (3x of the 36px on cover width; viewBox 64x148) from an SVG that layers a base fill (`#6e4a2b` light, `#e7ddc9` dark) through a feTurbulence fractalNoise grain (baseFrequency `0.5 0.55` light, `0.42 0.46` dark, numOctaves 4, seed 11) lit by feDiffuseLighting (surfaceScale 1.7 light / 1.05 dark, diffuseConstant 1.05, lighting color `#ffffff`, distant light azimuth 235, elevation 58 light / 60 dark) blended multiply, giving visibly textured leather, plus the sheen gradient, loop highlight, fold shade, edge stroke (`#34200f` / `#9a8a6c`, opacity 0.55, width 1.6), and dashed stitching (`#ecd7a8` / `#5d3f23`, width 1.7, dasharray `3 3.4`). The full SVG string is built by `leatherSvgMarkup()` in that file. Separately, the drape's cast shadow is blurred: `filter: blur(3px)` on the radial gradient span (web `src/components/Input/SaveButton.tsx:82`).

Native (`src/components/SaveButton.tsx:36-66`): same strap and stitch paths, sheen, loop highlight, fold shade, and stroke colors drawn with react-native-svg, but no grain layer at all; the component's own comment concedes the leather reads flatter. The drape shadow SVG (SaveButton.tsx:136-146, radial gradient stopping at opacity 0.34 center, 0 at 72%) has no blur.

Change: bake the two themed bookmark PNGs offline and bundle them as assets, exactly what the web does at runtime.

1. Copy `leatherSvgMarkup()` from the web file and emit two SVG files (light and dark) at 120x278.
2. Rasterize each to PNG. A dependable route is a tiny node script using `@resvg/resvg-js` (it supports feTurbulence and feDiffuseLighting); headless Chrome screenshotting the SVG also works. Do the baking in a scratch folder, not the repo, and only commit the PNGs.
3. Read the generated PNGs with your image reading tool to confirm the grain is actually visible before bundling (a silent filter failure yields a flat fill, which defeats the purpose).
4. Put them in the native repo assets (for example `assets/bookmark-light.png` and `assets/bookmark-dark.png`), `require()` them, and render with expo-image at width RIBBON_W (36) and height `RIBBON_W * 148 / 64`, replacing the `LeatherArt` SVG component. Keep the same clip window reveal animation.
5. Soften the drape shadow to match the web's 3px blur: either widen the radial gradient falloff (push the transparent stop outward and lower the peak slightly so edges feel diffuse) or bake a small blurred shadow image alongside the straps.

### 7. Ribbon touch exclusion zone must track the ribbon's live bounds

Web (`src/components/Input/SaveButton.tsx:41-48, 69-95`): the ribbon button's own onPointerDown calls stopPropagation for its full live bounds. Geometry: width 36 at left 16%; edge = 40 * 36 / 64 = 22.5 (the tip pokes 22.5px above the cover top, `top: -edge`); when unsaved the button height is `edge + 14`, so it reaches 14px below the cover top; when saved the height is the full bookmark, 148 * 36 / 64 = 83.25, so it reaches 60.75px below the cover top. A tap anywhere on the visible ribbon only toggles the save and can never start the gesture that opens the book.

Native (`src/components/BookCard.tsx:50-89`, `src/components/SaveButton.tsx:111-156`): BookCard's lift and tap gestures fail themselves only when the touch is inside `x in [width*0.16 - 8, width*0.16 + 44], y <= 36` (card coordinates, 8px slop each side horizontally, matching the Pressable's hitSlop of 8). Two bugs follow. When SAVED, the ribbon Pressable extends about 60.75px below the cover top (68.75 with hitSlop), so touches in the y band 36 to 68.75 land on both the ribbon Pressable (zIndex 10, a sibling of the GestureDetector) and the card's gestures, likely unsaving AND opening at once. When UNSAVED, the Pressable only responds down to about 22px below the cover top (14px overhang plus 8px hitSlop), so y 22 to 36 in that column is a dead strip where the web would open the book but native does nothing.

Change: make the exclusion zone depend on saved state.

1. In `src/components/SaveButton.tsx`, extend the exported `RIBBON_HITBOX` (line 156) with the below cover extents: `belowCoverUnsaved: 14`, `belowCoverSaved: ((VIEW.h - EDGE) * RIBBON_W) / VIEW.w` (60.75), and `hitSlop: 8`.
2. In `src/components/BookCard.tsx`, make `inRibbon` read the live saved state, `useStore.getState().savedById[book.id]`, inside the onTouchesDown check (an imperative read keeps the gesture memo stable), and gate y at `belowCoverUnsaved + hitSlop` (22) when unsaved and `belowCoverSaved + hitSlop` (68.75) when saved. Both the lift and tap gestures use the same check.

Result: exactly the ribbon toggles, everything else opens. Note for the device pass: the saved drape double trigger depends on gesture-handler hit testing of overlapping siblings, so it must be confirmed on the phone.

### 8. Toast exit motion: drop 8px, ease out

Web (`tailwind.config.js:47` and `60-65`): `toastPop` runs 2.4s with the CSS `ease-out` keyword (cubic-bezier(0, 0, 0.58, 1), applied per keyframe segment). It enters from translateY(16px) and opacity 0 to 0 and 1 by 12% (288ms), holds to 85% (2040ms), then fades out while moving to translateY(8px). The exit drop is half the entry distance.

Native (`src/components/Toast.tsx:20-33`): the timing envelope matches (290ms in, 1750ms hold, 360ms fade out ending at 2400ms) but translateY is tied to `(1 - visible.value) * 16`, so the exit drops the full 16px, and each withTiming uses the default in out easing.

Change: drive translateY with its own shared value (enter 16 to 0 over 290ms, hold, exit 0 to 8 over the 360ms fade), and pass `Easing.bezier(0, 0, 0.58, 1)` (or `Easing.out(Easing.quad)`) to every withTiming call. Everything else about the toast already matches (pill metrics, colors, medallion, 13px semibold text, bottom `max(28, inset + 16)`, z order, non interactive, re trigger on a new toast id).

### 9. CoverSkeleton pulse and Today shelf sizing

Web (`src/components/Input/StoreFront.tsx:91-97`): CoverSkeleton is a 144px wide block (`w-36`): cover block with aspect 2:3, rounded left 3px and right 12px, background espresso at 0.07; a 12px tall title bar at 75% width with 10px top margin; a 10px tall author bar at 50% width, espresso at 0.05, with 6px top margin. Every block runs Tailwind's `animate-pulse`: opacity 1 to 0.5 to 1 over 2s, cubic-bezier(0.4, 0, 0.6, 1), infinite. On the Today Popular shelf (`StoreFront.tsx:1115-1116`), 4 skeletons render, each inside a 176px (`w-44`) snap slot, while the skeleton itself stays 144px.

Native (`src/components/ui.tsx:124-134`, `src/screens/TodayScreen.tsx:155-156`): CoverSkeleton draws the same static blocks (sizes and radii already match) with no pulse, and TodayScreen passes `width={176}` so the skeleton fills the whole slot.

Change: wrap the skeleton in an Animated.View whose opacity loops 1 to 0.5 to 1 over 2s, `Easing.bezier(0.4, 0, 0.6, 1)` on both halves, `withRepeat(..., -1)`. In TodayScreen, render each skeleton at width 144 inside a 176px wide slot View so spacing matches the loaded cards. On native the Today catalog is bundled so this loading state is nearly unreachable there, but CoverSkeleton is shared with vibe pages where loading is visible, so it matters.

## Acceptance checklist

- [ ] 1. Generated covers show 15px titles on md covers and 11px on sm covers at every width (176px shelf cards no longer oversize, 48px rows no longer undersize), with line height 1.25 on the title.
- [ ] 2. During the cover peel of the open transition, faint ruled lines fill the revealed page from 14% down to 14% up, with no blank lower half, at any cover size.
- [ ] 3. Michael was asked about pinned versus theme derived cover inks and his choice is implemented (or explicitly left pinned); the solid cover's text, rule, and Leaf use the surface color on every tint in both light and dark mode.
- [ ] 4. A loading cover shows the ruled page through a transparent face (no sunken block), the image pops in with no crossfade, and hero covers on Today and vibe pages load at high priority while shelf covers load at low priority.
- [ ] 5. A cover that failed to load retries automatically when the same mounted component receives a different cover URI (recycled rows and rotating hero slots recover).
- [ ] 6. The save ribbon shows visible leather grain texture from bundled baked PNGs (brown strap in light themes, cream in dark), and the drape's cast shadow looks soft edged like the web's 3px blur.
- [ ] 7. Tapping anywhere on a saved ribbon's lower drape only toggles the save (never also opens the book), and tapping the strip just below an unsaved ribbon's tip opens the book instead of doing nothing.
- [ ] 8. The toast slides up 16px on entry and drops only 8px on exit, both with ease out timing, inside the same 2.4s envelope.
- [ ] 9. Skeleton placeholders pulse (opacity 1 to 0.5 to 1 every 2s), and Today's four shelf skeletons are 144px wide sitting in 176px slots.

## Verification

- Type check the native repo: `npx tsc --noEmit` in `C:/Users/Michael/Desktop/Focus Reader Android`. Fix any errors you introduced.
- Reason through the running behavior carefully for each issue: trace the gesture math for issue 7 with concrete numbers (a 144 wide card: ribbon x band roughly 15 to 67, y limit 22 unsaved and 68.75 saved), the animation timelines for issues 8 and 9, and the state transitions for issue 5.
- Do NOT use the Expo web build to verify anything. Its dev server opens blank localhost tabs in Michael's real browser and the web bundle breaks on zustand's import.meta. All on device checking is done by Michael on his Android phone.
- Read the two baked bookmark PNGs as images to confirm the grain rendered before you bundle them.

End your session by telling Michael exactly what to look at on his phone, in plain everyday English. Cover at least these:

1. Open Today and look at the book shelf. Titles on the made up covers (the ones without real cover art) should look a touch smaller and match the smaller cards elsewhere.
2. Press and hold a book so the cover lifts and starts to peel. The notebook style lines on the page underneath should now run all the way down instead of stopping halfway.
3. On a fresh install or after clearing the app's storage, watch covers load. You should briefly see the page lines behind a see through cover instead of a gray block, and the picture should appear instantly rather than fading in.
4. Look at the little leather bookmark on any book cover. It should now have a subtle leathery texture instead of looking flat, in both light and dark theme.
5. Save a book so the bookmark drapes down the cover, then tap the long draped part. It should only unsave the book. Before this fix it could unsave and open the book at the same time.
6. With a book unsaved, tap just below the bookmark's little tip. The book should open normally, no dead spot.
7. Save or unsave any book and watch the little confirmation bubble at the bottom. When it leaves it should settle down gently by a small amount, not slide away as far as it came in.
8. Open a vibe page on a slow connection. The gray placeholder cards should gently pulse while things load.

## Final note

When summarizing your work for Michael, use plain everyday language and avoid dashes in prose. Explain what changed in terms of what he will see, not in terms of code internals.

---

## Outcome, recorded 2026-07-13

Implemented in commit `30a2cd4` on `feat/native-ui-web-parity` in the native repo.

Files changed: `src/components/BookCard.tsx`, `src/components/BookCover.tsx`, `src/components/SaveButton.tsx`, `src/components/Toast.tsx`, `src/components/ui.tsx`, `src/screens/TodayScreen.tsx`, `src/screens/VibeScreen.tsx`, `assets/bookmark-dark.png`, `assets/bookmark-light.png`.

### Issue by issue

**1. Generated cover title size fixed per size prop, not scaled by width** (done)

titleSize is now 11 for sm and 15 for md at every width, with lineHeight titleSize * 1.25 set inline on all three variant titles (solid, label, framed).

**2. Ruled page lines fill the whole revealed region** (done)

RuledLines now takes the cover height and renders Math.ceil(height * 0.72 / 6) lines; a 144 wide cover gets 26 lines (156px) covering the whole 155.5px region, clipped by the existing overflow hidden.

**3. Cover accessory inks: pinned vs theme derived** (done)

Per Michael's pre made decision the pinned inks stay as they are. The uncontested change is applied: the solid variant's onTint is now t.surface in both modes for every tint. Reminder recorded that the web needs a matching follow up to port the pinning back (separate task).

**4. Cover image loading face, fade, and fetch priority** (done)

coverBg is 'transparent' while the image shows, transition is 0 (pop in), and a priority prop ('high'/'low', default 'low') feeds expo-image. priority="high" passed at the resume hero and today's pick hero in TodayScreen and the vibe hero pick in VibeScreen. cachePolicy="disk" left alone.

**5. Failed cover flag resets when the URI changes** (done)

Boolean failed state replaced with failedUri string; showImage = !!uri && failedUri !== uri; onError stores the failing uri. Self resets exactly like the web.

**6. Leather ribbon grain texture (baked PNGs) and drape shadow blur** (done)

Baked light and dark 120x278 PNGs in the scratchpad with @resvg/resvg-js from the web's leatherSvgMarkup (turbulence grain plus diffuse lighting rendered correctly; both PNGs visually inspected, grain clearly visible, ~50KB each which also confirms noise content). Bundled at assets/bookmark-light.png and bookmark-dark.png, rendered via expo-image inside the same clip reveal animation. Drape shadow softened by widening the radial falloff (peak 0.30, mid stops 0.16/0.05, transparent at the rim, rx/ry widened to 58%/62%) to approximate the web's 3px blur.

**7. Ribbon touch exclusion zone tracks live bounds** (done)

RIBBON_HITBOX extended with belowCoverUnsaved: 14, belowCoverSaved: 60.75, hitSlop: 8. BookCard's inRibbon now reads useStore.getState().savedById[book.id] imperatively and gates y at 22 unsaved / 68.75 saved (144 card x band 15.04 to 67.04). Both lift and tap gestures share the check. The saved drape double trigger still needs confirming on the phone per the prompt.

**8. Toast exit motion: drop 8px, ease out** (done)

translateY now has its own shared value (16 to 0 over 290ms, hold 1750ms, 0 to 8 over the 360ms fade) and every withTiming uses Easing.bezier(0, 0, 0.58, 1), the CSS ease-out curve, inside the same 2.4s envelope.

**9. CoverSkeleton pulse and Today shelf sizing** (done)

Skeleton wrapped in an Animated.View pulsing opacity 1 to 0.5 to 1 over 2s with Easing.bezier(0.4, 0, 0.6, 1) on both halves, repeated forever. Today's four shelf skeletons render at 144 wide inside 176 wide slot Views. ResultsScreen's grid skeletons (already 144) pick up the pulse for free.

### Judgment calls made during implementation

1) Issue 3 was resolved per the instructions given for this run: the native pinned label and page inks stay pinned, and only the solid cover's on tint color changed to the surface token in both modes. The web still needs a follow up task to port the pinning back so the two apps match. 2) Drape shadow blur: instead of baking a separate shadow image, I widened the radial gradient falloff (lower peak, two mid stops, transparent stop at the rim, slightly larger radii) which reads as a diffuse soft edge without a runtime blur filter; exact stop values are a judgment call that should be eyeballed on the phone. 3) The baked strap PNG renders through expo-image with contentFit fill at 36 by 83.25, keeping the exact geometry the old SVG used, so the clip reveal animation needed no changes. 4) In BookCard the saved state is read imperatively inside the touch check rather than subscribed, exactly as the prompt asked, so the gesture memo stays stable. 5) ResultsScreen's skeletons also gained the pulse since CoverSkeleton is shared; that matches the web, which pulses skeletons everywhere.

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
