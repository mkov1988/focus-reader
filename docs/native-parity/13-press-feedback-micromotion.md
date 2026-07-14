# Native parity 13: press feedback animation and header/search polish

> **Status: implemented and committed 2026-07-13.** Commit `07605cf` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings.


**Mission.** Give the native Android app the web app's press micromotion and top bar polish. Every storefront press state should ease in and out over 150ms with the web's curve instead of snapping, the vibe hero's Start reading button should lose its extra pressed dim, the resume hero's progress bar should animate its width, and the search pills should gain the web's inset shadow, focus ring, 16px text, and correct height. Eleven precise deltas, all verified against current code on both sides.

## Context

Focus Reader is a cozy speed reading app for public domain books. It has a warm coffeeshop feel: cream and espresso tones, a coral accent, serif titles, book covers on shelves.

Two repos are involved:

- **Web app (source of truth, READ ONLY): `C:/Users/Michael/Desktop/Focus Reader`.** A React + Tailwind PWA. It defines exactly how everything should look and behave. Open its files to check details, but **never modify anything in this repo**.
- **Native app (all changes go here): `C:/Users/Michael/Desktop/Focus Reader Android`.** Expo SDK 54, React Native 0.81, `react-native-reanimated` 4, `react-native-gesture-handler` 2.28, zustand, `expo-image`, `expo-haptics`, `expo-linear-gradient`, `lucide-react-native`, react-navigation native stack. This is a full React Native app. **Never introduce a WebView.**

Useful mappings between the two:

- Web Tailwind tokens map to the native theme object from `useTheme()` in `src/theme`: `espresso` = `t.text` / `t.inkA(x)` for alpha, `mocha` = `t.textMuted` / `t.mutedA(x)`, `cream` = `t.surface` (and `t.paperA(x)`), `coral-accent` = `t.accent` / `t.accentA(x)`, accent text = `t.accentText`, `warm-beige` = `t.bg`.
- The espresso ink rgb is `58,42,30`, so web shadows like `rgba(58,42,30,0.08)` equal `t.inkA(0.08)`.
- Tailwind's default transition curve (used by every `transition-*` utility) is `cubic-bezier(0.4, 0, 0.2, 1)`. Tailwind 3.4's `ease-out` utility is `cubic-bezier(0, 0, 0.2, 1)`. The CSS `ease` keyword is `cubic-bezier(0.25, 0.1, 0.25, 1)`. These three curves each appear below; do not mix them up.

## Before you start

1. Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect branch `feat/native-ui-web-parity`.
2. **Another session may hold uncommitted changes** in `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, `src/reader/useReelEngine.ts`, and `app.json`. Read the current state of any file before editing it, and do not revert changes you did not make. None of the fixes below require touching those reader files; if a fix seems to lead there, stop and stay inside the files named in each issue.
3. Line numbers below were verified against both repos on 2026-07-13. If a listed line has drifted, trust the described behavior and re-locate the code.

### Suggested shared hook (covers issues 1 through 4, 6, 7)

Most of the deltas are one bug repeated: native `Pressable` style functions swap pressed values instantly, while the web tweens them over 150ms. Build one small hook (for example `src/components/usePressScale.ts`) and use it at every call site:

```tsx
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const PRESS_MS = 150;
const PRESS_EASE = Easing.bezier(0.4, 0, 0.2, 1); // Tailwind's default transition curve

export function usePressScale(pressedScale: number) {
    const p = useSharedValue(0); // 0 = rest, 1 = pressed
    const onPressIn = () => { p.value = withTiming(1, { duration: PRESS_MS, easing: PRESS_EASE }); };
    const onPressOut = () => { p.value = withTiming(0, { duration: PRESS_MS, easing: PRESS_EASE }); };
    const style = useAnimatedStyle(() => ({
        transform: [{ scale: 1 + (pressedScale - 1) * p.value }],
    }));
    return { progress: p, onPressIn, onPressOut, style };
}
```

Expose `progress` so call sites can derive extra animated styles from the same shared value (border color via `interpolateColor`, a translateX nudge, an overlay opacity). Use `Animated.createAnimatedComponent(Pressable)` or wrap the Pressable content in an `Animated.View`. For animating a lucide icon's color (the vibe row chevron), the simplest robust approach is to stack two icons (rest color and accent color) absolutely and cross fade their opacities from the same shared value; `interpolateColor` plus `useAnimatedProps` on the SVG stroke also works if you prefer.

RN has no native inset box shadow. Approximate the web's inset shadows with an absolutely positioned overlay pinned to the top inside of the rounded container: a `LinearGradient` from `expo-linear-gradient` running top to bottom, from `rgba(58,42,30,0.08)` to transparent, a few pixels tall (or a 1px hairline at `t.inkA(0.08)` if the gradient looks wrong). Give it `pointerEvents="none"` and match the container's border radius.

## Issues to fix

### 1. Today press states snap instantly; the pressed vibe row is missing its inset shadow

**Web** (`src/components/Input/StoreFront.tsx:100-119` Vibe row, `:726-731` menu button):
- The vibe row carries `transition-[transform,box-shadow,border-color] duration-150` with the default `cubic-bezier(0.4,0,0.2,1)` curve. While pressed: ring becomes `coral-accent/40`, scale drops to `0.99`, and an inset shadow appears: `inset 0 1px 4px rgba(58,42,30,0.08)`. Because box shadow and border color are in the transition list, the ring color and inset shadow tween too.
- The icon chip animates to scale `1.10` and rotate `-6deg` over 150ms (`transition-transform duration-150`).
- The chevron animates `translateX` 4px and its color to coral over 150ms (`transition-[transform,color] duration-150`).
- The menu button has `active:scale-90` with `transition-transform` (150ms).

**Native** (`src/screens/TodayScreen.tsx:226-253` VibeRow, `:105-111` menu button): the same pressed values are applied (scale 0.99, border `t.accentA(0.4)`, icon scale 1.1 rotate `-6deg`, chevron translateX 4 plus accent color, menu scale 0.9) but as instant Pressable style swaps with no animation, and the vibe row has no pressed inset shadow at all.

**Fix:** drive every one of those pressed values through `withTiming(150ms, Easing.bezier(0.4, 0, 0.2, 1))` so they ease in AND out (the shared hook plus derived styles from its `progress`). Add the inset shadow approximation to the vibe row, fading it in and out with the same 150ms timing, at `rgba(58,42,30,0.08)` (note the vibe row's blur is 4px where the search pill's is 3px; visually a slightly softer overlay is fine). The recents and book rows are handled in issue 2; `FilterChip` is handled in issue 3.

### 2. Library rows and the plain save button snap instead of animating over 150ms

**Web** (`src/components/Input/StoreFront.tsx:228` RecentRow, `:264` BookRow, `src/components/Input/SaveButton.tsx:50-58`):
- RecentRow and BookRow have `active:scale-[0.99]` with `transition-[transform,border-color] duration-150`, so the 0.99 press scale eases in and out over 150ms. Their ring color change to `coral-accent/40` is **instant**, because the ring is a box shadow and box shadow is not in the transition list.
- The plain SaveButton has `active:scale-90` with `transition-[transform,background-color,color] duration-150`, so its shrink AND its background and icon color flip (cream/mocha when unsaved, coral accent with accent text when saved) all ease over 150ms.

**Native** (`src/components/rows.tsx:48-55` and `:85-94`, `src/components/SaveButton.tsx:87-105`): all three use Pressable style functions that swap scale, border, and background instantly on the pressed flag (and, for SaveButton, on the saved flag); no timing animation.

**Fix:** animate the pressed scale of both rows (1 to 0.99) and the plain SaveButton (1 to 0.9, plus its background and icon color, including the saved flag flip) through `withTiming` at 150ms. **Keep the row border color change instant**, exactly matching the web. The ribbon tone SaveButton already animates its reveal with `withTiming`; only the plain tone and the rows change here.

### 3. Filter chips and other themed press scales snap; ribbon shadow easing is off

**Web** (`src/components/InnerPageHeader.tsx:50` and `:65`, `src/components/Input/SaveButton.tsx:54`, `src/components/Input/StoreFront.tsx:185`):
- Back and menu circles: `active:scale-90` with `transition-[transform,color] duration-150`.
- Plain SaveButton: as in issue 2.
- FilterChip: `active:scale-[0.97]` with a 150ms transition on transform, background color, text color, and border color.
- The ribbon bookmark's drape shadow fades with `opacity .4s ease` (web `SaveButton.tsx:84`), where `ease` is `cubic-bezier(0.25, 0.1, 0.25, 1)`.

**Native** (`src/components/InnerPageHeader.tsx:49-57` and `:67-78`, `src/components/SaveButton.tsx:87-105`, `src/components/ui.tsx:60-77`): all use `transform: [{ scale: pressed ? X : 1 }]` in the Pressable style function, jumping instantly in both directions. The ribbon drape shadow uses `withTiming(saved ? 1 : 0, { duration: 400 })` (native `SaveButton.tsx:122`) with reanimated's default in/out easing instead of the web's `ease` curve.

**Fix:** route `FilterChip`'s pressed scale (0.97) and its color changes through the shared hook (header circles are issue 4's job, SaveButton is issue 2's; this issue owns the chip plus the shadow easing). Add `easing: Easing.bezier(0.25, 0.1, 0.25, 1)` to the ribbon shadow's 400ms `withTiming`.

### 4. InnerPageHeader's round back and menu buttons snap to pressed scale

**Web** (`src/components/InnerPageHeader.tsx:46-53` back, `:60-69` menu): both buttons carry `active:scale-90 transition-[transform,color] duration-150` (the class strings are at lines 50 and 65), so the scale to 0.90 and back tweens over 150ms.

**Native** (`src/components/InnerPageHeader.tsx:49-58` back, `:67-78` menu): the Pressable style callback toggles `transform: [{ scale: pressed ? 0.9 : 1 }]` (lines 54 and 73) instantly with no timing in either direction.

**Fix:** animate the press scale to 0.9 and back with the shared 150ms hook for both buttons. The web's hover color change (`hover:text-coral-accent`) has no native analogue and needs no port.

### 5. InnerPageHeader's reader collapse uses the wrong easing curve

**Web** (`src/components/InnerPageHeader.tsx:36-41`): the collapse animates `grid-template-rows` 1fr to 0fr plus opacity 1 to 0 with `transition-[grid-template-rows,opacity] duration-300 ease-out` (line 37). This project uses Tailwind 3.4.17, whose `ease-out` utility compiles to `cubic-bezier(0, 0, 0.2, 1)`, a strong decelerate: fast start, gentle landing. It is NOT the CSS `ease-out` keyword's `cubic-bezier(0, 0, 0.58, 1)`.

**Native** (`src/components/InnerPageHeader.tsx:29-37`): `withTiming(collapsed ? 0 : 1, { duration: 300 })` at line 31 with no easing specified, so reanimated's default `Easing.inOut(Easing.quad)` applies. It starts slow, which differs visibly at the start of the collapse.

**Fix:** pass `easing: Easing.bezier(0, 0, 0.2, 1)` to that `withTiming`, keeping the 300ms duration. One shared value drives both the height and the opacity, so this single change covers both. Only the reader exercises the `collapsed` prop and the reader chrome has uncommitted changes from another session; edit only `src/components/InnerPageHeader.tsx`, nothing under `src/reader/`.

### 6. Today's Popular "see all" uses the wrong icon and wrong press feedback

**Web** (`src/components/Input/StoreFront.tsx:1110-1112`): "see all" is 13px semibold coral accent with an **ArrowRight** icon (size 14, `ml-1` so 4px left margin). While active the text dims to `coral-accent/70` (this button has `transition-colors`, so the dim tweens) and the arrow translates 4px right (`transition-transform duration-150`, `group-active:translate-x-1`).

**Native** (`src/screens/TodayScreen.tsx:144-147`): renders **ChevronRight** (size 14) instead of ArrowRight, and the pressed style is a flat `opacity: 0.7` on the whole row with no icon slide.

**Fix:** import `ArrowRight` from `lucide-react-native` and use it here. On press, dim the label toward `t.accentA(0.7)` and translate the arrow 4px right, both animated over 150ms with the shared curve, easing back on release. Copy ("see all", lowercase), size 13, semibold weight, and accent color already match; leave them alone.

### 7. Swimlane "see all" arrow never slides while pressed

**Web** (`src/components/Input/StoreFront.tsx:200-204`): the button is coral accent 13px semibold with an ArrowRight size 14 icon (4px left margin). While active the label and icon color drop to `coral-accent/70` **instantly** (no color transition on this button, unlike issue 6's) AND the arrow translates 4px right (`group-active:translate-x-1`) with `transition-transform duration-150`.

**Native** (`src/components/ui.tsx:104-109`): the Pressable applies `opacity: 0.7` to the whole control while pressed; the arrow never moves and nothing animates.

**Fix:** while pressed, animate the ArrowRight 4px to the right over 150ms with `Easing.bezier(0.4, 0, 0.2, 1)`, and animate it back on release. Keep the dim instant: the existing `opacity 0.7` on coral text is a fair stand in for `text-coral-accent/70` and matches the web's instant color drop. This is the shared `Swimlane` component, so the fix lands everywhere it is used.

### 8. Vibe hero's Start reading button has a pressed dim the web does not have

**Web** (`src/components/Input/StoreFront.tsx:840-847`): the "Start reading" button (coral pill, `py-3.5` so 14px vertical padding, 15px semibold, BookOpen size 18, `shadow-md shadow-coral-accent/25`) has NO active or pressed style classes. It shows no visual press feedback; the open animation itself is the response.

**Native** (`src/screens/VibeScreen.tsx:186-192`): the Pressable sets `opacity: pressed ? 0.9 : 1` at line 188.

**Fix:** remove the pressed opacity change so the button is visually inert on press, exactly like the web. Parity direction is web to native; if press feedback ever seems desirable here, it should be added to the web first.

### 9. Resume hero's progress bar fill jumps instead of easing over 300ms

**Web** (`src/components/Input/StoreFront.tsx:1008-1010`): the coral fill inside the 6px tall track has `transition-[width] duration-300` (default curve `cubic-bezier(0.4,0,0.2,1)`), so when the percentage changes, for example returning from the reader with new progress, the bar visibly eases to the new width over 300ms.

**Native** (`src/screens/TodayScreen.tsx:342-344`): a plain View whose width is the template string `${pct}%`, so it jumps instantly when `pct` changes.

**Fix:** animate the fill width with `withTiming` at 300ms whenever `pct` changes. A clean pattern: keep a shared value updated from `pct` in an effect, and build the percent width inside `useAnimatedStyle` (reanimated accepts percentage string widths computed in a worklet). Track and fill geometry (height 6, radius 3, `t.inkA(0.1)` track, `t.accent` fill) and the label row above already match; do not touch them.

### 10. Today's top bar is missing the search pill inset shadow, focus ring, 16px text, and menu button shadow

**Web** (`src/components/Input/StoreFront.tsx:708-733`):
- Search pill: `bg-cream`, `ring-1 ring-espresso/10`, inset shadow `inset 0 1px 3px rgba(58,42,30,0.08)`, and while the input is focused the ring becomes `coral-accent/40` (`focus-within:ring-coral-accent/40`, `transition-shadow`).
- Input text is 16px (the browser base size; the input has no size class) in Inter `font-medium`, espresso color, placeholder `mocha/60`.
- Menu button: 48px circle, `bg-cream`, ring `espresso/10`, plus `shadow-sm` which is `0 1px 2px rgba(0,0,0,0.05)`.

**Native** (`src/screens/TodayScreen.tsx:86-113`, styles at `:423-428`): the pill has border `t.inkA(0.1)` but no inset shadow and the border never changes on focus; the input `fontSize` is 15 (`sansMedium`); the menu button has no shadow props or elevation.

**Fix:**
- Add the inset shadow approximation inside the pill (top inner gradient at `rgba(58,42,30,0.08)`, see the hook section).
- Track focus with `onFocus`/`onBlur` on the TextInput and switch the pill's `borderColor` to `t.accentA(0.4)` while focused.
- Bump the input `fontSize` to 16.
- Give the menu button a subtle shadow: `shadowOpacity` about 0.05, `shadowRadius` 2, `shadowOffset` {width 0, height 1}, `elevation` 1.

Already matching, leave alone: placeholder color, icon sizes (Search 18, Menu 20, X 16), the 48px button, the roughly 68px minimum bar height, and the safe area padding.

### 11. Both search pills (Today and results) lack the web's inset shadow, focus ring, 16px text, and exact height

**Web** (`src/components/Input/StoreFront.tsx:708-724` home pill, `:905-921` results pill): both pills are cream with a 1px `espresso/10` ring, the inset shadow `inset 0 1px 3px rgba(58,42,30,0.08)`, and on focus within, the ring becomes `coral-accent/40` with a shadow transition. Input text is 16px Inter `font-medium`, espresso, placeholder `mocha/60`. The home pill's padding is 20 horizontal by 14 vertical (`px-5 py-3.5`); the results pill's is 20 by 12 (`px-5 py-3`), which with the inherited 1.5 line height on 16px text makes it exactly 12+24+12 = 48px tall. Icons: Search 18 at `mocha/70`; clear X 16 at `mocha/60`.

**Native** (`src/screens/ResultsScreen.tsx:90-106`, styles at `:140-143`; `src/screens/TodayScreen.tsx:88-104`, styles at `:423-427`): the pills are flat, `borderColor` `t.inkA(0.1)` always, no inset shadow, no focus state change. The input is `fontSize` 15 `sansMedium` with `paddingVertical` 10. The results pill has no container vertical padding, so it renders about 40px tall, about 8px shorter than the web. Icon and X sizes and colors match.

**Fix:** on BOTH pills, set the input `fontSize` to 16, add the focus driven border swap to `t.accentA(0.4)` (`onFocus`/`onBlur`), and add the inset shadow approximation. Give the results pill 12px vertical container padding so it lands at about 48px tall. The Today pill already carries `paddingVertical` 4 plus `minHeight` 50, close to the web's 52px home pill, so the height fix is specifically the results pill. This issue and issue 10 describe the same treatment for the Today pill; implement it once (a small shared SearchPill component or a shared style helper is a reasonable refactor, but keep it minimal).

## Acceptance checklist

- [ ] Pressing a Vibe out row on Today eases the row's scale, ring color, icon tilt, and chevron slide in over 150ms and back out on release, and a faint inner shadow along the top edge fades in while held; the Today menu button's shrink to 0.9 also tweens both ways.
- [ ] Recents rows and Library book rows ease their 0.99 press scale in and out over 150ms while the border color change stays instant, and the plain bookmark save button eases its shrink to 0.9 plus its background and icon color flip over 150ms.
- [ ] Filter chips on vibe pages ease their 0.97 press scale and color changes over 150ms, and the ribbon bookmark's drape shadow fades with the web's `ease` curve instead of reanimated's default.
- [ ] The round back and menu buttons in every inner page header tween to 0.9 scale over 150ms on press and back on release.
- [ ] When the reader starts playing, the header collapse starts fast and lands gently (decelerating curve) rather than starting slow.
- [ ] Today's Popular "see all" shows an ArrowRight icon, and while held the label dims and the arrow slides 4px right over 150ms, sliding back on release.
- [ ] Every swimlane "see all" arrow slides 4px right over 150ms while pressed and returns on release; the color dim stays instant.
- [ ] The vibe hero's Start reading button shows no visual change at all while pressed.
- [ ] The resume hero's coral progress fill eases to its new width over 300ms when progress changes, for example after backing out of the reader.
- [ ] Today's search pill has a faint inner top shadow, its border turns coral toned while the keyboard focus is in the input, its text renders at 16px, and the menu circle casts a subtle drop shadow.
- [ ] The results page search pill matches the same treatment and stands about 48px tall with 12px vertical padding.

## Verification

1. Run `npx tsc --noEmit` in `C:/Users/Michael/Desktop/Focus Reader Android` and fix every error you introduced.
2. Reason carefully through runtime behavior: every `withTiming` must fire on both `onPressIn` and `onPressOut` (a press that never releases inside the bounds still gets `onPressOut`), shared values must not be recreated per render, and Pressable callbacks that previously depended on the `pressed` flag should not be left half migrated.
3. Do NOT use the Expo web build to verify anything. It opens blank localhost tabs in the real browser and the web bundle breaks on zustand's `import.meta`. On device checking is done by Michael on his Android phone.

When you finish, tell Michael to check these things on his phone, in plain words like these:

- On the home page, press and hold one of the Vibe out rows. It should squeeze gently instead of jumping, the little icon should tip over smoothly, the arrow should glide right and turn coral, and a soft shading should appear along the top inside edge. Letting go should undo all of it just as smoothly.
- Press and hold a book row in the Library. The row should shrink very slightly and smoothly, not jump.
- Tap and hold the small round bookmark button next to Start reading. It should shrink smoothly, and when it flips to saved the color change should feel soft, not sudden.
- Press and hold the round back button or menu button on any inner page. The shrink should feel like a gentle squeeze, not a snap.
- Start the reader playing. The header should slide away quickly at first and settle softly at the end.
- On the home page, press and hold "see all" next to Popular. The word should fade a touch and the little arrow should scoot to the right, then slide back when you let go. The arrow should now be a straight arrow, not an angle bracket. The same scoot should happen on the "see all" links inside the vibe pages.
- On a vibe page, press the big Start reading button. It should not dim or flicker at all while your finger is on it.
- Read a little, then back out to the home page. The orange progress bar under the book title should stretch smoothly to its new length instead of jumping.
- Tap into the search box on the home page. The rim of the pill should warm up to coral while you type, the text should look a touch bigger, and the pill should have a faint shaded inner edge at the top. The round menu button next to it should sit with a whisper of a shadow under it. The search pill on the results page should look the same and a bit taller than before.

## Final note

When summarizing this work for Michael, use plain everyday language, no jargon, and avoid dashes in prose sentences. Use commas or periods instead.

---

## Outcome, recorded 2026-07-13

Implemented in commit `07605cf` on `feat/native-ui-web-parity` in the native repo.

Files changed: `src/components/usePressScale.ts`, `src/components/ui.tsx`, `src/components/InnerPageHeader.tsx`, `src/components/SaveButton.tsx`, `src/components/rows.tsx`, `src/screens/TodayScreen.tsx`, `src/screens/VibeScreen.tsx`, `src/screens/ResultsScreen.tsx`.

### Issue by issue

**1. Today press states snap; vibe row missing pressed inset shadow** (done)

New shared hook usePressScale drives the vibe row scale to 0.99, the ring color to coral, the icon tilt, the chevron slide plus color cross fade, and a fading top inset shadow, all over 150ms both ways. The Today menu button now tweens its shrink to 0.9 too.

**2. Library rows and plain save button snap** (done)

RecentRow and BookRow ease their 0.99 scale over 150ms while the border color swap stays instant, matching the web. The plain save button eases its 0.9 shrink and its saved color flip (background plus icon, via a cross fade of two bookmark icons) over 150ms; its ring swap stays instant like the web.

**3. Filter chips snap; ribbon shadow easing off** (done)

FilterChip eases its 0.97 press scale and its active color flips (background, border, label) over 150ms with the shared curve. The ribbon drape shadow's 400ms fade now uses the CSS ease curve, bezier 0.25, 0.1, 0.25, 1.

**4. Inner page header round buttons snap** (done)

Back and menu circles tween to 0.9 and back over 150ms via the shared hook.

**5. Reader header collapse wrong easing** (done)

Collapse timing now uses bezier 0, 0, 0.2, 1 at 300ms. The line had drifted (an earlier round added Easing.out quad); replaced with the exact Tailwind ease out curve. Only InnerPageHeader.tsx touched, nothing under src/reader/.

**6. Today Popular see all wrong icon and feedback** (done)

ChevronRight replaced with ArrowRight size 14. While held, the label and arrow fade toward 70 percent and the arrow slides 4px right, both 150ms with the shared curve, easing back on release.

**7. Swimlane see all arrow never slides** (done)

Arrow now slides 4px right over 150ms while pressed and returns on release. The 0.7 dim stays instant via the existing style function, matching the web's untransitioned color drop.

**8. Vibe hero Start reading has extra pressed dim** (done)

Pressed opacity removed; the button is visually inert on press like the web.

**9. Resume hero progress bar jumps** (done)

Fill width now animates through a shared value with withTiming at 300ms and the default Tailwind curve, built as a percent width inside useAnimatedStyle. Track and fill geometry untouched.

**10. Today top bar missing inset shadow, focus ring, 16px text, menu shadow** (done)

Shared TopInsetShadow overlay added inside the pill, border turns to accent at 0.4 alpha while the input is focused, input text bumped to 16, menu button given shadow opacity 0.05, radius 2, offset 0 and 1, elevation 1.

**11. Both search pills lack the web treatment and exact height** (done)

Results pill got the same inset shadow, focus border, and 16px text, plus 12px vertical container padding (input padding dropped to 0, minHeight 48) so it lands at about 48px. Today pill height left alone as instructed; the shared treatment lives in one TopInsetShadow component in ui.tsx.

### Judgment calls made during implementation

1. The inset shadow ink is hardcoded to rgba(58,42,30,0.08) instead of the theme ink helper. The web hardcodes that exact color in its class strings, so in dark mode the shading stays dark. Theme ink would have flipped it into a light highlight in dark mode, which would look wrong for a shadow. 2. Icon color tweens (vibe row chevron, plain save bookmark) use the prompt's suggested two stacked icons cross fading from one shared value, rather than animated SVG props. 3. The rows keep their instant border swap through a tiny pressed state flag set inside onPressIn and onPressOut, since a plain style function cannot ride on an animated pressable cleanly. 4. The Popular see all dim is an opacity fade to 0.7 on the label and arrow, which reads the same as the web's color drop to accent at 70 percent over its color transition. 5. The results pill lands at about 48px by pairing the 12px container padding with zero input padding and a 48 minimum height, since stacking 12px on top of the old 10px input padding would have made it about 64px tall. 6. The header collapse line had drifted from the prompt's snapshot (it already carried a quad ease out); I trusted the described target and set the exact bezier 0, 0, 0.2, 1. 7. No app.json version bump this round: the run's hard rules forbid touching app.json because another session holds changes there. The commit step should bump expo.version. 8. The package 03 cover inks decision did not intersect this package, so nothing was needed for it.

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
