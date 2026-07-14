# App identity, page washes, and shell spacing

> **Status: implemented and committed 2026-07-13.** Commit `d34a4d3` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings. expo-splash-screen was installed and the stock blue adaptiveIcon backgroundImage removed so the warm beige plate shows.


## Mission

Bring the native Android app's shell up to exact parity with the web app in six places: the app's launcher identity (name, adaptive icon background, splash), the warm radial page washes (they must scroll away with content and appear as a single mustard wash on the More pages), PageShell's bottom padding formula, the missing end-of-scroll whitespace on vibe pages, and a 300ms cross-fade of the page background and text color when the theme or light/dark mode changes. Every change happens in the native repo. The web repo is read only reference.

## Context

Focus Reader is a cozy speed-reading app for public-domain books, with a warm coffeeshop visual identity (warm beige pages, espresso ink, mustard and coral accent glows).

There are two repos:

- **Web app (READ ONLY source of truth):** `C:/Users/Michael/Desktop/Focus Reader`. This is a React + Vite web app. It defines the exact look and behavior you are matching. Open its files to check constants, copy, and timings, but never modify anything in this repo.
- **Native app (where ALL changes go):** `C:/Users/Michael/Desktop/Focus Reader Android`. Expo SDK 54, React Native 0.81, reanimated 4, gesture-handler 2.28, zustand, expo-image, expo-haptics, lucide-react-native, react-navigation native-stack.

This is a full React Native app. Never introduce a WebView, and never suggest one.

Key native files for this task:

- `app.json` at the repo root (Expo config, launcher identity).
- `src/components/ui.tsx` holds `PageWash` (roughly lines 136 to 157) and `PageShell` (roughly lines 159 to 189). PageShell is the shared page scaffold used by every storefront-style screen.
- `src/screens/` holds `TodayScreen.tsx`, `LibraryScreen.tsx`, `NotebookScreen.tsx`, `VibeScreen.tsx`, `ResultsScreen.tsx`, `StatsScreen.tsx`, `SettingsScreen.tsx`, `AboutScreen.tsx`, `ReaderScreen.tsx`.
- `src/theme.ts` holds `useTheme()` (roughly lines 140 to 156), which returns plain color strings from zustand state.

Key web files for this task (read only):

- `vite.config.ts` lines 56 to 63 (PWA manifest branding).
- `src/components/Input/StoreFront.tsx` lines 682 to 689 (page shell with both washes), 139 to 153 (OverlayPage for Settings/About), 1356 to 1373 (Stats layer), 737 to 740 (home main padding), 753 (vibe section margin).
- `src/index.css` lines 42 to 49 (body color transition).
- `src/App.tsx` lines 69 to 87 (theme variables applied on change).

## Before you start

Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect the branch `feat/native-ui-web-parity`.

**Important warning:** another session may hold uncommitted working-tree changes in `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, `src/reader/useReelEngine.ts`, and `app.json`. In particular, `app.json` already carries an uncommitted `"predictiveBackGestureEnabled": false` entry under `expo.android`. Read the current state of every file before editing it, merge your edits into what is there, and do not revert or overwrite changes you did not make. This matters most for `app.json`, which you must edit for issue 1.

If any line number in this document has drifted, trust the described behavior and re-locate the code by searching for the constants or identifiers quoted here.

## Issues to fix

### 1. App identity is still the default Expo template (high severity)

**What the web does.** The PWA manifest in `vite.config.ts` lines 56 to 63 brands the app: name `Focus Reader`, short_name `Focus Reader`, description `A calm, focused reader for public-domain books.`, theme_color `#3a2a1e` (espresso), background_color `#f3ead9` (warm beige), display `standalone`. Note the web has NO branded icon art of its own: `index.html` line 5 still links the stock `/vite.svg` favicon and the manifest declares no icons array.

**What the native app does.** In `app.json`, `expo.name` and `expo.slug` are both `focus-reader-android`, so the Android launcher shows the raw slug as the app name. `expo.android.adaptiveIcon.backgroundColor` is `#E6F4FE`, the Expo default pale blue. `assets/icon.png` and the `android-icon-*` files are the stock Expo blue blueprint-chevron placeholder. There is no splash configuration at all (no `expo-splash-screen` plugin and no `expo.splash` block); `assets/splash-icon.png` exists but is the stock grid-and-circles placeholder and is unreferenced by `app.json`.

**What to change.**

- Set `expo.name` to `Focus Reader`. Leave `expo.slug` as `focus-reader-android` (the slug is a project identifier, changing it would repoint the Expo project).
- Set `expo.android.adaptiveIcon.backgroundColor` to warm beige `#F3EAD9` (espresso `#3A2A1E` is the acceptable alternative if a dark plate reads better behind the current foreground art, but warm beige is the default choice).
- Add a splash configuration in the same palette so launch matches the cozy theme: add the `expo-splash-screen` plugin to `expo.plugins` with `backgroundColor` `#F3EAD9`, referencing `./assets/splash-icon.png` as the image. The splash image itself is still placeholder art; wiring it up with the warm background is the parity fix.
- Do NOT attempt to draw replacement icon art. Replacing `icon.png`, the `android-icon-*` set, and `splash-icon.png` with Focus Reader artwork needs a new design asset. The web has no branded icon to copy (its favicon is stock vite.svg), so the art itself is branding work, not web parity. The name and the colors are the direct parity fixes here. If you want, leave a short TODO comment or note for Michael that icon art is still stock.
- Merge carefully: `app.json` has uncommitted changes from another session (`predictiveBackGestureEnabled`). Preserve everything already in the file.

### 2. Page washes are a fixed 420px viewport overlay instead of page-sized scrolling backgrounds

**What the web does.** The storefront page div (`StoreFront.tsx` lines 682 to 689) carries two background radial gradients sized against the full page element: mustard `radial-gradient(120% 80% at 50% -10%, rgba(212,154,63,0.10), transparent 55%)` plus coral `radial-gradient(90% 60% at 100% 0%, rgba(194,103,75,0.07), transparent 50%)`. Because they are backgrounds of the scrolled container, the glow scrolls up and away with the content. When you scroll down a long page the warm glow leaves the screen.

**What the native app does.** `PageWash` (`src/components/ui.tsx` lines 136 to 157) is an absolutely positioned 420px-tall SVG rendered BEHIND the ScrollView (PageShell renders `<PageWash />` as a sibling before the ScrollView, lines 170 to 186). So the glow never scrolls: it stays glued to the viewport top while content scrolls over it. Its ellipse geometry also only approximates the web (washA uses rx `width*0.75`, ry `h`, washB uses rx `width*0.6`, ry `h*0.7` at x = width, versus the web's 120%w by 80%h and 90%w by 60%h). The colors and stop offsets already match: washA `#D49A3F` at opacity 0.10 fading to 0 at stop 0.55, washB `#C2674B` at opacity 0.07 fading to 0 at stop 0.5.

**What to change.** Move the wash SVG inside the ScrollView's content, as the first child, absolutely positioned at the top, so it scrolls away with the content. Size it against the content like the web's percentages: washA spans 120% of the width and 80% of the page height centered at x 50% y minus 10%, washB spans 90% of the width and 60% of the height anchored at x 100% y 0%. If measuring true content height is awkward, sizing against at least the viewport (window) height is the acceptable floor, but never the hardcoded 420. Keep the existing colors and stop offsets, they are already correct. Remember the wash must not block touches (`pointerEvents="none"`) and must sit behind the page content (zIndex or render order).

### 3. Stats, Settings, and About should get only the mustard wash

**What the web does.** The storefront page shell uses TWO gradients (mustard top-center plus coral top-right, exact strings in issue 2). But the More overlays use ONLY the mustard gradient: `OverlayPage` (`StoreFront.tsx` line 146) and the Stats layer (line 1362) both set `backgroundImage: 'radial-gradient(120% 80% at 50% -10%, rgba(212,154,63,0.10), transparent 55%)'` with no coral top-right wash.

**What the native app does.** `PageShell` always renders `PageWash`, which draws both ellipses (washA `#D49A3F` at 0.10 and washB `#C2674B` at 0.07) on every screen, including `StatsScreen.tsx`, `SettingsScreen.tsx`, and `AboutScreen.tsx` (all three use PageShell).

**What to change.** Give PageWash and PageShell a prop, for example `wash?: 'single' | 'double'` defaulting to `'double'`, and pass `wash="single"` from StatsScreen, SettingsScreen, and AboutScreen so only the mustard ellipse renders there. washB's web geometry is 90% by 60% at 100% 0%; the native ellipse is an approximation and that is fine, the fix on these three pages is simply omitting it.

### 4. PageShell bottom padding adds 16px the web does not have

**What the web does.** Every page column uses `paddingBottom: 'max(3rem, env(safe-area-inset-bottom))'`, that is max(48px, inset) with nothing added on top of the inset. Verified in three places: the home main (`StoreFront.tsx` lines 737 to 740), the Stats overlay main (lines 1370 to 1373), and OverlayPage's main (line 149).

**What the native app does.** PageShell's ScrollView `contentContainerStyle` uses `paddingBottom: Math.max(48, insets.bottom + 16)` (`src/components/ui.tsx` line 182). On devices where the bottom inset exceeds 32 (for example 48dp three-button navigation) the native page gets up to 16px more bottom padding than the web.

**What to change.** Change the formula to `Math.max(48, insets.bottom)`. This affects every screen using PageShell, which is intended. The two formulas are identical when `insets.bottom <= 32`, so the change only shows on taller nav bars.

### 5. Vibe pages end with 28px less bottom whitespace

**What the web does.** The vibe content is a `<section className="mb-7">` (28px bottom margin, `StoreFront.tsx` line 753) inside a main whose padding-bottom is `max(3rem, env(safe-area-inset-bottom))` (lines 737 to 740). Scrolled to the end there is 28px + 48px = 76px of space after the last swimlane.

**What the native app does.** `VibeScreen.tsx` (content starts around line 141) renders its children straight into PageShell with no trailing margin, so the end-of-scroll gap is just PageShell's 48px.

**What to change.** Add 28px of bottom margin to the VibeScreen content (a wrapper style or an `extraBottom` style hook on PageShell, whichever is cleaner) so the end-of-scroll gap is 76px like the web. Do this after issue 4 so the base is the corrected 48px formula. Other inner pages built on the same web section pattern may share this gap; if you notice one while working, check the web wrapper for that specific page before copying the margin, since some web tabs use different wrappers.

### 6. Theme and light/dark switches snap instead of cross-fading over 300ms

**What the web does.** The body element carries `transition: background-color 0.3s ease, color 0.3s ease` (`src/index.css` lines 42 to 49). When `App.tsx` (lines 69 to 87) rewrites the CSS variables on a theme or mode change, the page background and default ink cross-fade over 300ms. Individual components without their own transitions still snap; only the body layer fades.

**What the native app does.** `useTheme()` (`src/theme.ts` lines 140 to 156) returns plain color strings; every backgroundColor and color re-renders to the new value in one frame, so the whole app snaps instantly.

**What to change.** Animate at least the page-level background (PageShell or the screen root) and the default text color across theme changes with a 300ms ease timing. A clean approach with reanimated 4: keep a shared progress value, snapshot the previous palette when `themeIndex` or `mode` changes, kick the progress from 0 to 1 with `withTiming(1, { duration: 300, easing: Easing.ease })`, and drive the shell's colors through `interpolateColor(progress, [0, 1], [prevColor, nextColor])`. The web only fades the body layer, so a full app-wide animated color system is NOT required; matching the page shell background and its default text color is faithful parity. Make sure the reader screen's own background does not double-animate if it manages its own colors.

## Acceptance checklist

- [ ] The Android launcher shows the app as `Focus Reader`, the adaptive icon plate behind the (still stock) foreground art is warm beige `#F3EAD9`, and the splash screen background is warm beige instead of plain white, with the existing uncommitted `predictiveBackGestureEnabled` entry in app.json preserved.
- [ ] On any long storefront page, scrolling down carries the warm glow up and off the screen with the content instead of the glow staying pinned to the top of the viewport, and the wash spans page-scale dimensions rather than a fixed 420px band.
- [ ] Stats, Settings, and About show only the mustard top-center glow with no coral glow in the top-right corner, while Today, Library, Notebook, Vibe, and Results still show both.
- [ ] On a device with a tall bottom nav bar (inset above 32), the space under the last item of any PageShell screen equals the inset exactly rather than inset plus 16; on gesture-nav devices nothing visibly changes.
- [ ] Scrolled to the very end of a vibe page, there is 76px of empty space after the last swimlane (28px margin plus the 48px shell padding).
- [ ] Changing theme or toggling light/dark in Settings fades the page background and default text color smoothly over about a third of a second instead of snapping, and colors land exactly on the new palette when the fade ends.

## Verification

1. Type-check the native repo: run `npx tsc --noEmit` in `C:/Users/Michael/Desktop/Focus Reader Android` and fix any errors you introduced.
2. Reason through the running behavior carefully: re-read PageShell after your edits and confirm the wash is inside the scroll content, the padding formula is exact, the single-wash prop reaches all three More screens, and the theme fade cannot leave a stale color if the user switches themes twice quickly (the snapshot of the previous palette must update per switch).
3. Do NOT use the Expo web build to verify anything. Its dev server opens blank localhost tabs in the real browser and the web bundle breaks on zustand's import.meta. It proves nothing about the Android app.
4. On-device checking is done by Michael on his Android phone. End your session by telling him exactly what to look at, in plain everyday English, along these lines: check that the app on your home screen is now called Focus Reader and the icon sits on a warm beige circle instead of pale blue. Open the app and watch the very first flash of the launch screen, it should be warm beige, not white. Scroll down a long page like Library and watch the warm glow at the top, it should slide up and away with the page instead of staying put. Open Stats, Settings, and About and look at the top right corner, the faint reddish glow should be gone there but still present on the home page. Open a vibe page like Bedtime and scroll to the very bottom, there should be a bit more breathing room after the last row of books. Finally go to Settings and switch the theme and light or dark mode, the page color should melt into the new one over a blink rather than jumping instantly.

## Final note

When summarizing your work for Michael, use plain everyday language, skip jargon, and avoid dashes in prose sentences (use commas or periods instead). Hyphens are fine inside file paths and code identifiers.

---

## Outcome, recorded 2026-07-13

Implemented in commit `d34a4d3` on `feat/native-ui-web-parity` in the native repo.

Files changed: `app.json`, `package.json`, `package-lock.json`, `src/components/ui.tsx`, `src/theme.ts`, `src/screens/ResultsScreen.tsx`, `src/screens/StatsScreen.tsx`, `src/screens/SettingsScreen.tsx`, `src/screens/AboutScreen.tsx`, `src/screens/VibeScreen.tsx`.

### Issue by issue

**1. App identity (name, adaptive icon color, splash)** (done)

expo.name is now Focus Reader, slug untouched, adaptive icon plate is warm beige #F3EAD9, expo-splash-screen plugin added with the existing splash-icon.png on a #F3EAD9 background. predictiveBackGestureEnabled preserved. The stock blueprint backgroundImage was removed so the beige plate can actually show (Android prefers the image over the color). Icon foreground, monochrome, and splash image remain stock Expo art, which the prompt said not to redraw.

**2. Washes scroll away with content and use page scale dimensions** (done)

PageWash now renders inside the scroll content as a zero height first child slot, so the glow slides off with the page. Geometry matches the web exactly: mustard 120% width by 80% page height at (50%, minus 10%), coral 90% by 60% at (100%, 0%), with page height measured from the ScrollView content (floored at window height). Results, being a virtualized FlatList, puts the wash in its list header sized on the window floor, which the prompt allows.

**3. Stats, Settings, About get only the mustard wash** (done)

PageWash and PageShell gained wash?: 'single' | 'double' defaulting to 'double'; the three More screens pass wash="single" so the coral top right ellipse is omitted there.

**4. PageShell bottom padding formula** (done)

Now Math.max(48, insets.bottom) in PageShell, and ResultsScreen's hand rolled copy became 28 + Math.max(48, insets.bottom) to drop the same extra 16.

**5. Vibe pages end with 76px of whitespace** (done)

All VibeScreen content is wrapped in a View with marginBottom 28, mirroring the web's section mb-7, on top of the corrected 48px shell padding.

**6. 300ms theme cross fade** (done)

New useThemeFade hook in src/theme.ts drives the page shell background through interpolateColor with withTiming 300ms on the CSS ease curve bezier(0.25, 0.1, 0.25, 1). A second switch mid fade snapshots the color currently on screen as the new start, so it always lands exactly on the new palette. Applied in PageShell and the Results root. Text color is not animated because React Native has no inherited default text color (see decisions). The reader keeps its own plain colors, so no double animation.

### Judgment calls made during implementation

1) Removed expo.android.adaptiveIcon.backgroundImage (the stock pale blue blueprint PNG). Android uses the image instead of the color when both exist, so keeping it would have made the beige plate invisible. Foreground and monochrome stock art kept, per the prompt. 2) Installed expo-splash-screen ~31.0.13 via npx expo install, since the config plugin cannot resolve without the package; used the template defaults (imageWidth 200, resizeMode contain) with the warm beige background. Verified with npx expo config --type prebuild that the plugin resolves. 3) Bumped expo.version 0.7.8 to 0.7.9 per the standing version bump rule. The tree was clean at 0.7.8 when I started (the expected uncommitted 0.7.3 bump had already been committed by earlier rounds), so nothing was overwritten. 4) The fade animates the page background only, not a default text color. React Native has no inherited body text color, every Text already sets an explicit theme color, and on the web those same texts snap too because their colors come straight from the CSS variables. Background only is therefore the faithful twin of the web's body layer fade. 5) Results page: the wash is sized on the window height floor because the Browse list is virtualized (988 cards, tens of thousands of pixels of content), so content height sizing would allocate an absurd SVG. Also set removeClippedSubviews to false on that FlatList so Android does not clip the header slot's overflowing glow early. 6) The wash now starts at the top of the scroll content, just below the header, whereas the web's gradient origin includes the header band. Both headers are opaque theme background on both platforms, so the only difference is the glow sitting a header height lower, which I accepted as the clean approximation. 7) SVG canvas is capped at 35 percent of the page height, the point past which both gradients are fully transparent, so tall pages do not allocate huge empty layers.

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
