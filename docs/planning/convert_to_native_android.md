# Focus Reader: Android Native Conversion Strategy (React Native)

> **Status (2026-08-09): the migration this plan describes was executed.** The
> native app lives at `../../../Focus Reader Android` (v0.7.x, all parity
> packs complete per docs/native-parity/00-INDEX.md). This doc is now the
> historical rationale for the choices made, not a forward looking plan.

This guide defines the migration path from our React-DOM web prototype to a high-performance native Android application (APK/AAB) for the Google Play Store, using the Android Material Design playbook.

> **Audited and refreshed 2026-07-05.** The original plan was written when the app was a storefront plus two reading views driven by keyboard keys. Since then the app gained: the kinetic finger-scrub engine (`useKineticScrub`), five visualization modes, the immersive auto-hide reading controls, a Today-home navigation model with inner pages, persisted state with versioned migrations, save-for-later, reading stats, scene recaps, vibe pages, and a three-tier book loading ladder backed by a full-catalog mirror (~56k books, headed to R2). Each section below is tagged **[still holds]**, **[updated]**, or **[new]**.

> **How to read the "Native counterpart" notes.** Most sections end with a block recommending the specific native library or platform feature to reach for. **These are suggestions and starting points only, not decisions.** Every one of them must get its own due diligence before any code is built on it: check that the library is actively maintained, that it supports the React Native New Architecture, how big its community is, and above all how it actually performs on a cheap physical Android phone. If a suggestion fails that check, the section's *requirement* still stands; only the tool changes.

## 1. Current State Context [updated]

What actually exists today, and therefore what the port must carry:

- **Reading engine**: `useRSVP` drives all modes on a recursive `requestAnimationFrame` loop with cognitive pacing (verified in `src/App.tsx`: `SENTENCE_START_MULTIPLIER = 1.8`, `SENTENCE_START_OFFSET = 500`, `LINE_START_MULTIPLIER = 1.5`, applied in sentence mode).
- **Five visualization modes** (`ReaderView.tsx`): `rsvp` (word reel), `trail` (GhostTrailDisplay), `paragraph` (scrollable text, word highlight, edge-advance to adjacent paragraphs), `sentence` (teleprompter with line-wrap pacing), `hybrid` (RSVP over a faded paragraph at half font size).
- **Touch-first interaction**: the app is NOT keyboard-driven anymore. `useReaderGestures` (tap to peek controls, horizontal swipe to skip sentences, strong swipe-down to exit, with scroll-region detection so paragraph scrolling never dismisses the reader) plus `useKineticScrub` (a tuned inertial physics engine attached in RSVP, trail, and sentence modes). `useKeyboardShortcuts` still exists as a desktop convenience only.
- **Immersive reading**: `useImmersiveMode` hides all controls after ~3s of playback; a tap peeks them back.
- **Word fitting**: `fitMode` system (`centerAll` default, `centerBig`, `shrink`, `compact`) in `textProcessing.ts` (`getFocalIndex`, `splitWord`, `effectiveBaseFontSize`) + `useFitFontSize` DOM measurement. Design constraint (non-negotiable): the focal letter is always centred on screen; nothing clips.
- **Navigation model**: Today is the only home. Library, Notebook, reader, results, vibe pages, and stats are inner pages you back out of. The menu drawer state lives in the store (`menuOpen`).
- **State**: zustand + `persist` middleware, schema version 5 with a migration chain; per-book progress map, saved-for-later map, cumulative reading stats.
- **Content**: three-tier book loading (device cache → our mirror → live Gutenberg), curated mirror complete, full-catalog mirror (~56k books after the quality gate) being built for R2. Covers are mirrored with a generated-cover fallback (`BookCover.tsx`).
- **Styling**: Tailwind classes throughout; Fraunces Variable + Inter Variable fonts; dark mode is the default; multiple warm themes via `themeIndex`.

**Reuse principle for the whole port:** everything visual is rebuilt with native components; everything that only computes (parsing, pacing math, fit-mode math, store logic, catalog data, download/strip logic) is reused as-is. The gesture and pacing *feel constants* carry over verbatim as the starting tune; the machinery around them is rebuilt native.

## 2. Technical Migration Phases

### Phase 0: Project Foundation [new]

The original plan skipped the very first decision: what kind of React Native project.

> **Native counterpart (starting point, needs due diligence):** an **Expo project using development builds and EAS Build**, on a recent React Native version with the **New Architecture** and **Hermes** enabled (both are the modern defaults). Expo's managed tooling covers fonts, haptics, file system, system bars, and store submission without hand-maintaining native project files, and development builds mean we are never limited to what "Expo Go" allows. The due diligence: confirm every library chosen in later sections works under the New Architecture, and prove the whole stack once on a real budget phone before committing. The alternative if Expo fights us anywhere: a bare React Native app; every recommendation below works there too.

### Phase 1: Android-First Architecture & Hermes [still holds]
**The Hermes engine** must be enabled in the Android build. Hermes ahead-of-time compilation keeps the reader engine free of garbage-collection stutter at 600+ WPM on weak single-core Android devices. (With current React Native versions Hermes is the default; the task is verifying it stays on, not turning it on.)

### Phase 2: DOM to Android View Mapping [updated]
HTML maps to `ViewGroup`/`TextView` primitives; CSS grid/float layouts are rewritten in Flexbox.

1. **Virtualize everything, sized for 56k.** The storefront, vibe swimlanes, search results, and any "all books" surface must be virtualized lists with tight windows. The catalog is no longer ~1,400 books; browse and search must assume tens of thousands of rows.
2. **Styling translation.** The entire app is styled with Tailwind utility classes.

> **Native counterpart (starting point, needs due diligence):**
> - Element mapping: `div` → `View`, text nodes → `Text` (all text must live inside `Text` in RN), `img` → `expo-image` (disk caching built in, matters for covers).
> - Lists: **`@shopify/flash-list`** as the default for every shelf and results list, falling back to core `FlatList` where FlashList's item-size estimation fights a layout. Due diligence: measure both on a low-end device with real cover images before standardizing.
> - Styling: spike **NativeWind** on one real screen (StoreFront). It compiles the existing Tailwind class names to native style objects at build time (no web technology at runtime). If the spike shows friction with our theme system, fall back to hand-written `StyleSheet` objects fed by a JS theme table. Shadow classes become `elevation` either way (Phase 3).

### Phase 3: Material Design Integration [updated]
1. **Elevation**: replace Tailwind `shadow-*` with the `elevation` style prop.
2. **Ripple**: `Pressable` with `android_ripple` for touch feedback.
3. **Physical Back Button** [updated]: the app has a real navigation stack, and back must walk it in order:
   ```
   menu drawer open        → close drawer            (menuOpen=false)
   reader open             → close reader            (viewMode INPUT), progress already saved
   inner page open         → back out to Today       (Library/Notebook/vibe/stats/results)
   on Today                → let the OS exit the app
   ```

> **Native counterpart (starting point, needs due diligence):** **React Navigation with the native stack navigator** (`@react-navigation/native-stack`), which drives real Android screen transitions and gives back-button handling largely for free; model Today as the stack root and inner pages as pushed screens, with the drawer and reader as modal layers. Core `BackHandler` remains the escape hatch for the layers the navigator doesn't own (drawer, reader). Due diligence: confirm the navigator plays well with Android 13+ predictive back, and that our custom book-open transition can either live inside it or suppress it per screen. The alternative is keeping the app's current hand-rolled navigation state in zustand and using `BackHandler` alone, which is simpler conceptually but forfeits native transitions and predictive back.

### Phase 4: Font & Text Rendering [updated]
- The app ships **Fraunces Variable** and **Inter Variable** (`@fontsource-variable/*`). RN's variable-font axis support is inconsistent on Android; bundle **static instances of the weights actually used** (audit with a grep for `font-` classes) unless an early spike proves variable axes render correctly.
- `line-clamp-2` → `<Text numberOfLines={2} ellipsizeMode="tail">`.

> **Native counterpart (starting point, needs due diligence):** **`expo-font`** for loading bundled static `.ttf` cuts of Inter and Fraunces. Due diligence: render the reader and storefront side by side with the web app on the same phone and compare; typography is a huge part of this app's cozy identity, and font rendering differs subtly between the web and Android text engines. Only revisit variable fonts if static cuts bloat the APK or a needed weight is missing.

### Phase 5: The Reader Engine Port (RSVP core) [still holds, one addition]
1. **UI-thread worklets**: rewrite the `useRSVP` tick so word pacing runs on the UI thread and never crosses the JS bridge during playback. The pacing math (`delayMultiplier`, sentence-start multiplier and offset, line-start multiplier) is pure arithmetic and transfers unchanged.
2. **Focal letter centering via shared values**, not layout callbacks (avoids 1-frame jitter).
3. **Nested `<Text>`** for the focal letter styling; maps 1:1.

**Addition — the fitMode system must ride along.** `getFocalIndex`, `splitWord`, and `effectiveBaseFontSize` implement four user-selectable fit modes and are pure TypeScript (reusable as-is, including inside worklets). What does NOT transfer is `useFitFontSize`, which measures rendered DOM width to shrink long words. The design constraint carries over verbatim: the focal letter stays centred on screen and no word ever clips, in every mode.

> **Native counterpart (starting point, needs due diligence):** **`react-native-reanimated`** — `useFrameCallback` for the pacing tick, `SharedValue`s for the current word and its focal offset, so playback lives entirely on the UI thread. For long-word measurement, two candidate replacements for `useFitFontSize`: (a) `<Text onTextLayout>` measurement done off-screen one word ahead, or (b) a precomputed per-character width table for the exact shipped font cuts, which makes width a pure lookup and worklet-friendly. Due diligence: this is the number-one item for the Phase A feel spike (see Port Order); if Reanimated cannot hold 600+ WPM flawlessly on a budget phone, the fallback direction is a small custom native module for the word-flip loop, and that's a decision to make early, not after five screens are built.

### Phase 6: Sentence View & Line-Wrap Pacing [still holds]
- Teleprompter centering by scrolling the active sentence to the vertical middle.
- **Line-wrap detection**: the web reads span `offsetTop`; Android uses `<Text onTextLayout>` → `e.nativeEvent.lines` to build `lineStartIndices`. The wiring already exists end to end in the web app (`SentenceDisplay` → `onLineBreaksChange` → `App` state → `useRSVP` option), so the port is a drop-in replacement of the measurement source.
- Pacing constants verified current (1.8× / 500ms / 1.5×, sentence mode only).

> **Native counterpart (starting point, needs due diligence):** a virtualized list with `scrollToIndex({ viewPosition: 0.5, animated: true })` for the teleprompter, and `onTextLayout` as the line-break source. Due diligence: `scrollToIndex` needs measured or estimated row heights to be reliable; test with real book text where sentence lengths vary wildly, and verify `onTextLayout` fires consistently for restyled text on the Android text engine.

### Phase 7: Haptics [updated]
The web app already has a haptics layer: `src/utils/haptics.ts` fires `navigator.vibrate` on commit moments only (never on every tap). Port = swap the transport behind the same module interface and keep the same restraint.

> **Native counterpart (starting point, needs due diligence):** **`expo-haptics`**, which drives Android's proper haptic effects rather than raw vibration lengths. Map the current patterns to its semantic types (selection tick, light impact, success/error notification). Due diligence: haptic hardware quality varies enormously across Android phones; test the chosen effects on at least one cheap device and keep the "commit moments only" rule.

### Phase 8: System Architecture & Interaction [heavily updated]

1. **Gestures** [rewritten]. The web app is already fully touch-first; the port task is *faithful translation of a tuned system*, not invention. Inventory to port:

   - **`useReaderGestures`** (reader-wide): tap (≤8px move, ≤250ms) peeks controls; horizontal swipe past 70px skips a sentence (left = forward); downward swipe past 110px exits the reader, suppressed when the gesture starts inside a vertical scroller so paragraph scrolling never ejects the user.
   - **`useKineticScrub`** (the signature interaction; attached in rsvp, trail, and sentence modes): finger drag maps pixels to fractional word index (`pxPerStep`); release velocity is sampled over a 90ms trailing window; flicks coast under exponential friction (`v *= exp(-0.0035·dt)`), capped at 0.4 steps/ms, and hand off below 0.004 steps/ms to a 260ms ease-out settle onto a whole word. Emits per-frame position + speed so views fade motion cues. **These feel constants are the product**: the native engine is new code, but it starts from these exact numbers and is then re-tuned on device.
   - **Paragraph edge-advance**: over-scrolling a paragraph edge jumps to the adjacent paragraph; flick strength jumps further (`onAdvanceParagraph(dir, count)`).
   - **Control passthrough**: both web hooks bail out when the touch starts on a button or slider.
   - **Keyboard shortcuts**: not a launch requirement; revisit only for hardware keyboards.

> **Native counterpart (starting point, needs due diligence):** **`react-native-gesture-handler` v2 (the `Gesture.*` API) + Reanimated worklets.** Tap/swipe/exit compose with `Gesture.Exclusive`; the scrub is a `Gesture.Pan` whose handlers run as worklets writing to a `SharedValue`, with the friction/settle loop implemented in a `useFrameCallback` so finger tracking and coasting never leave the UI thread. Do NOT reach for the built-in `withDecay` first: its friction model differs from our exponential-decay tune, so reimplement our loop verbatim, then A/B against `withDecay` on device and keep whichever feels closer to the web original. Control passthrough is restructured with gesture composition (`blocksExternalGesture` / `simultaneousWithExternalGesture`) instead of DOM-style target sniffing. Scroller suppression: mark the paragraph scroll view and let its native scroll gesture win vertical drags. Reduced motion: `AccessibilityInfo.isReduceMotionEnabled()`. Due diligence: this whole block is the other half of the Phase A feel spike; budget real tuning days on a physical phone.

2. **Progress slider / Controls** [scope grew]: `Controls.tsx` is a ~400-line surface (play/pause, WPM, seek bar, sentence skip, chapters, paragraph markers). Budget it as a real screen, not a widget.

> **Native counterpart (starting point, needs due diligence):** a custom seek bar built from `Gesture.Pan` + Reanimated (we already need that stack), rather than `@react-native-community/slider`, because the bar draws chapter and paragraph markers and needs custom hit behavior. Keep the community slider in mind as the boring fallback if the custom one misbehaves with accessibility services. Due diligence: TalkBack support for whichever wins.

3. **Text parsing off the UI thread** [still holds, scope grew]: `parseText` (now with chapter detection via `chapterDetection.ts` and readable-bounds calculation) is pure TS and reused as-is; only *where it runs* changes.

> **Native counterpart (starting point, needs due diligence):** start with the built-in `InteractionManager.runAfterInteractions` so parsing waits for the open-book transition to finish; if profiling still shows a blocked frame on 300k-token books, move parsing to a background worker thread (worklet runtime or a worker library). Due diligence: profile on device with the largest book in the catalog before adding any threading dependency; the simple answer may be enough.

4. **App lifecycle** [still holds, one addition]: hook `AppState`; on `inactive|background` force `rsvp.pause()`. Addition: also flush reading progress and the stats session on background, since Android may kill the process without warning.

### Phase 9: Immersive Reading [new]
`useImmersiveMode` (3s idle fade, peek on tap, reset on control interaction) ports as-is; it is plain state + timers. The Android-only addition: while the reader is open, also hide the **system** bars (status + navigation) and restore them on exit. Respect display cutouts. Dark mode is the app default, so set the status bar style accordingly from day one.

> **Native counterpart (starting point, needs due diligence):** **`react-native-edge-to-edge`** (or Expo's `expo-status-bar` + `expo-navigation-bar` pair) for edge-to-edge layout and hiding/showing system bars, with `SafeAreaView`/insets handling around cutouts. Due diligence: system-bar behavior is one of Android's most fragmented areas (gesture navigation vs 3-button navigation, cutout shapes, OEM quirks); test on both navigation styles before calling it done.

### Phase 10: State, Storage, and Caches [new]
- **zustand works in RN unchanged.** The `persist` middleware needs only a storage adapter swap. Keep the existing `version: 5` + `migrate` chain as the single source of schema history.
- **`bookCache` (IndexedDB) → file system** behind the same interface (`getCachedBook`/`putCachedBook`).
- **Service worker caches have no RN equivalent and need none**: covers move to the caching image component, book text is covered by the file-based `bookCache`.
- **PWA auto-update disappears**: updates flow through Play Store releases (or over-the-air JS updates). Keep the `version.json` build stamp on the About page.

> **Native counterpart (starting point, needs due diligence):** **`react-native-mmkv`** as the zustand persist storage (fast, synchronous, well suited to the small settings/progress payload), with `@react-native-async-storage/async-storage` as the boring fallback. **`expo-file-system`** for the book text cache, one file per book id, mirroring today's `<id>.txt` shape. **`expo-image`** disk cache for covers. **`expo-updates`** if over-the-air JS updates prove worth having. Due diligence: MMKV's New Architecture compatibility on the chosen RN version, and a corruption story for the book cache (a half-written file must fail the read and refetch, same as the web tier logic).

### Phase 11: Book Content on Native [new]
The three-tier `fetchContent` ladder maps cleanly and gets *better* on native:
1. **Tier 1 — device**: file system cache (Phase 10).
2. **Tier 2 — our mirror**: the R2 bucket holding the full quality-gated catalog (55,863 books, ~19GB measured after the run; the ~39GB figure was a pre-run estimate — built by `scripts/mirror-all.mjs`). The web app reads it via `VITE_BOOK_BASE`; the native app reads the same bucket via its own config constant. Bundle the hot set (curated front table + user's saved/in-progress, roughly 15 to 30MB) into the APK or first-run download so the home experience is instant offline.
3. **Tier 3 — live Gutenberg**: on native there is **no CORS**, so the direct fetch works in production for the first time. Any book that misses the mirror still opens, with the boilerplate strip applied at runtime as the safety net (`stripGutenbergBoilerplate`, kept in sync across its copies).

> **Native counterpart (starting point, needs due diligence):** RN's built-in `fetch` for tiers 2 and 3 (the ladder logic in `library.ts` ports nearly verbatim), plus `expo-file-system`'s download API when we add visible download-with-progress for "get this book offline" (the App Store style flow in book_access_strategy.md §2). Due diligence: large-response memory behavior on low-RAM phones (a 1.5MB text string is fine; just verify no accidental double-buffering), and R2 CORS/headers config for the app's origin-less requests.

### Phase 12: Surface Inventory [new]
Screens/systems the port must include, beyond the reader:

| Surface | Notes for the port | Native counterpart starting point (due diligence each) |
|---|---|---|
| StoreFront (Today home) | Swimlanes, hero, resume card | `FlashList` rows of horizontal `FlashList`s; `expo-image` covers |
| Generated covers (`BookCover`) | Currently DOM/CSS composition | Rebuild with plain `View`s + `Text` first; `react-native-svg` only if the stitched/framed variants need it |
| Vibe pages | Chips, hero, swimlanes, read-time chips from `vibes.json` | Same list stack as StoreFront; data ports unchanged |
| Library | Reading + Saved-for-later from store maps | Plain sectioned list |
| Notebook / Stats | Inner pages; stats reads cumulative `stats` | Plain screens; no new data |
| Scene recaps | "Previously" recap from `scenes.json` | Pure data + UI; ports unchanged |
| Menu drawer | State already in store (`menuOpen`) | React Navigation drawer, or a Reanimated slide-in view to keep our exact styling |
| InnerPageHeader / nav | Shared back-header pattern | Native stack headers hidden; keep our custom header component for visual continuity |
| BookOpenTransition | 544 lines of DOM/CSS animation | Do NOT port 1:1. Rebuild a simplified Reanimated scale/fade version; evaluate on device whether more is earned |
| Toasts | Transient confirmation bubble | Tiny custom Reanimated view (keeps our styling); library only if needed |
| Themes | `themeIndex` + light/dark, dark default | JS theme token table replacing CSS custom properties; if NativeWind wins Phase 2, its theming hooks |

### Phase 13: Cover & Asset Strategy [still holds, extended]
As originally written: point at the static cover host, use a caching image component, cache covers alongside downloaded books, keep the generated cover as universal fallback. Extended by Phase 11: book text follows the same "our bucket first, origin as fallback" model, and the full-catalog mirror makes the bucket the primary path for essentially everything.

## 3. Recommended Port Order [new]
1. **Phase A — feel spike (go/no-go)**: Phase 5 (RSVP worklet) + Phase 8.1 (kinetic scrub worklet) on a real budget-tier device, with three books. These carry all the product-feel risk; every library bet above gets its first real due diligence here.
2. **Shell + navigation**: Today home, inner-page stack, back handling, drawer, themes.
3. **Reader complete**: all five modes, gestures, immersive system bars, Controls.
4. **Storefront + Library + vibe pages** against the frozen web IA.
5. **Content plumbing**: file cache, R2 base, hot-set bundle, live-Gutenberg tier.
6. **Long tail**: stats, scenes, Notebook, transition polish, haptics pass.

## 4. Native Counterpart Summary [new]

One line per bet, for quick due-diligence tracking. Reminder: **every row is a suggestion, not a decision**; each needs its own check (maintenance, New Architecture support, low-end device performance) before build time.

| Need | Suggested starting point | Fallback |
|---|---|---|
| Project foundation | Expo + dev builds + EAS, New Architecture, Hermes | Bare React Native |
| Long lists (56k catalog) | `@shopify/flash-list` | Core `FlatList` |
| Styling | NativeWind spike on one screen | Hand-written StyleSheets + theme table |
| Navigation + back | React Navigation native stack (+ `BackHandler` for drawer/reader layers) | zustand nav state + `BackHandler` only |
| Fonts | `expo-font`, static Inter/Fraunces cuts | Variable fonts if a spike proves them |
| RSVP engine | Reanimated `useFrameCallback` + SharedValues | Custom native module (decide at spike, not later) |
| Word-width measurement | Precomputed width table per font cut | Off-screen `onTextLayout` |
| Gestures / kinetic scrub | Gesture Handler v2 + custom worklet friction loop (our constants) | `withDecay` if A/B says it feels closer |
| Seek bar with markers | Custom Pan + Reanimated control | `@react-native-community/slider` |
| Parsing offload | `InteractionManager` first | Worker/worklet thread if profiling demands |
| Haptics | `expo-haptics` semantic effects | Core `Vibration` |
| System bars / immersive | `react-native-edge-to-edge` (or expo status/navigation bar) | Direct native flags via config plugin |
| Settings/progress storage | `react-native-mmkv` adapter for zustand persist | AsyncStorage |
| Book/file cache | `expo-file-system`, one file per book id | `react-native-fs` |
| Cover images | `expo-image` (disk cache) | `react-native-fast-image` |
| OTA updates | Play Store releases; `expo-updates` optional | Store releases only |
