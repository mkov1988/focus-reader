# Focus Reader: Android Native Conversion Strategy (React Native)

This comprehensive guide defines the absolute migration path from our React-DOM web prototypes to a high-performance, native Android application (APK/AAB), fully utilizing the Android Material Design playbook.

## 1. Current State Context
- The `StoreFront` DOM implements massive horizontal density (quad-scrollers loaded with titles) and vertically stacked categories.
- The `useRSVP` engine achieves sub-millisecond precision for speed-reading via recursive `requestAnimationFrame` loops.
- CSS-driven styling (`tailwind`) currently handles all interactions, layouts, shadows, and hover states.

## 2. Technical Migration Phases

### Phase 1: Android-First Architecture & Hermes
Initialize the project via standard React Native bindings. **The Hermes Engine** (the JS engine explicitly optimized for React Native execution on Android) MUST be enabled in `android/app/build.gradle`. Android devices possess drastically varying single-core CPU power compared to iOS; Hermes AOT (Ahead-of-Time) compilation ensures the RSVP engine boots instantly onto the phone's memory and bypasses garbage-collection stutters while reading at 600+ WPM.

### Phase 2: DOM to Android View Mapping
HTML tags must map to `ViewGroup` and `TextView` primitives via React Native components. CSS grids and floats do not exist; everything must be structurally rewritten using Flexbox.

#### Virtualized Lists for Memory Safety
A low-end Android device will quickly crash with `OutOfMemory` exceptions if we attempt to mount 100+ raw DOM nodes representing BookCards simultaneously on the screen.

**Web React (Current):**
```tsx
// Renders all items into the DOM immediately, regardless of scroll position
{books.map(book => <BookCard title={book.title} />)}
```

**React Native Android (Future):**
```tsx
// Only calculates memory for the ~3 books currently intersecting the view frustum
<FlatList
  horizontal
  data={books}
  renderItem={({ item }) => <BookCard title={item.title} />}
  initialNumToRender={3}
  windowSize={5}
  removeClippedSubviews={true} // Aggressively shreds off-screen memory
/>
```

### Phase 3: Material Design Integration (Android Exclusives)
1. **Elevation & True Geometry**:
   Web CSS `box-shadow` simply simulates lighting. Android uses a physical OS-level Z-axis projection engine to draw shadows. We must replace all Tailwind shadow classes (`shadow-sm`, `shadow-md`) strictly with the `elevation` style prop:
   ```javascript
   elevation: 4, // Android auto-generates ambient and spot shadows based on this Z-depth
   ```
2. **Ripple Touch Feedback**:
   Android OS users expect kinetic interaction feedback. Replace CSS `:hover` and `:active` states with `Pressable` components utilizing the generic Material ink-ripple:
   ```tsx
   <Pressable android_ripple={{ color: 'rgba(232, 106, 107, 0.2)', borderless: false }}>
     <BookCard />
   </Pressable>
   ```
3. **Physical Back Button Interception**:
   Unlike iOS (which relies primarily on software UI "Back" buttons or edge-swipes), 90% of Android navigation relies on the physical/system Back button at the bottom of the device frame. 
   You MUST implement `BackHandler` hooks inside the `ReaderView` to hijack this behavior, otherwise tapping "Back" will accidentally close the entire app!
   ```javascript
   import { BackHandler } from 'react-native';
   
   useEffect(() => {
     const backAction = () => {
       if (viewMode === 'READING') {
         setViewMode('INPUT'); // Intercept back button, close book instead
         return true; // Return true to explicitly prevent the Android OS from exiting the app
       }
       return false;
     };
     const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
     return () => backHandler.remove();
   }, [viewMode]);
   ```

### Phase 4: Font & Text Rendering Overrides
- **System Fonts**: Android defaults to Google's `Roboto`. If retaining the web's customized `Inter` aesthetic, target `.ttf` font files must be explicitly bundled into the `android/app/src/main/assets/fonts/` directory and linked natively.
- **Text Truncation**: Our web `line-clamp-2` translates perfectly to the native Android text engine via the `<Text numberOfLines={2} ellipsizeMode="tail">` property combination.

### Phase 5: The Core Focus Reader Engine Port (RSVP)
Migrating the high-speed RSVP (Rapid Serial Visual Presentation) reading engine from the web DOM to Android entails distinct performance and rendering challenges, primarily bottlenecked by the JS-to-Java bridge overhead.

1. **Hardware Acceleration via Worklets (`requestAnimationFrame` vs Reanimated)**:
   - **The Problem**: If the RSVP reading engine runs on the Javascript thread, it must constantly send string updates (`"The"`, `"quick"`, `"brown"`) across the React Native bridge to the Android Java UI thread at 60fps. At 1000 WPM, garbage collection stutters on the JS thread will cause dropped frames, destroying the reader's cognitive rhythm.
   - **The Solution**: Rewrite `useRSVP` using `react-native-reanimated`. Utilize `useFrameCallback` to execute the word-pacing algorithms strictly on the Android UI Thread via C++ worklets, completely bypassing the Javascript bridge during playback.

2. **Focal Letter Centering (CSS to Native View)**:
   - **The Web constraints**: We use CSS `transform: translateX(-50%)` calculated directly from DOM element metrics.
   - **The Android Solution**: Android text rendering pipelines do not instantly compute width before painting like the web does. Instead of `onLayout` (which causes 1-frame jitter), construct the RSVP Display using `Reanimated` Shared Values. Update the layout `translateX` matrix in unison with the word change on the UI thread to guarantee pixel-perfect Focal Red Letter alignment.

3. **String Highlighting (Nesting `<Text>`)**:
   - The web RSVP engine renders `<span className="focal-letter text-red-500">` inside a Flex container.
   - On Android, React Native `<Text>` tags can be nested inherently to apply focal styling without breaking layout bounds. The syntax maps 1:1:
     ```tsx
     <Text style={styles.baseWord}>
       {word.before}
       <Text style={styles.focalLetter}>{word.focal}</Text>
       {word.after}
     </Text>
     ```

### Phase 6: Multi-View Rendering & Line Wrap Pacing (Sentence View)
Our MVP includes advanced reading ergonomics ("Sentence View" alongside pure "RSVP") defined by `VisualizationMode`. 

1. **Rendering Sentence View**:
   - **The Web constraints**: We render the active sentence in the center of the viewport, with previous and next sentences grayed out.
   - **The Android Solution**: Built-in Android `RecyclerView` (via React Native `<FlatList>`) can easily render parsed sentences. Trigger `scrollToIndex({ animated: true, viewPosition: 0.5 })` whenever the active index increments to keep the current sentence physically fixed in the center of the Android screen, imitating teleprompter mechanics.

2. **Line-Wrap Detection (`onTextLayout`)**:
   - **The Web Way**: We currently use HTML `SPAN` bounding boxes (`offsetTop`) compared against the parent container to detect when sentences visually wrap.
   - **The Android Way**: Native Android cannot synchronously export exact X/Y positioning mid-render. Instead, utilize React Native's `<Text onTextLayout={(e) => { ... }}>` prop. 
   - `e.nativeEvent.lines` returns an array of line objects mapped from the native Android `Layout` engine. By scanning this event payload, you can deduce exactly which array index triggers a hardware UI wrap and populate the `lineStartIndices` array organically.

3. **Cognitive Pacing Algorithms**:
   - The heavily tested pacing math must translate precisely into the `useRSVP` Reanimated worklet tick execution:
     - `SENTENCE_START_MULTIPLIER` (1.8x delay)
     - `SENTENCE_START_OFFSET` (500ms fixed block)
     - `LINE_START_MULTIPLIER` (1.5x delay triggered by `lineStartIndices`)
   - Because Reanimated runs on the UI thread, these multipliers remain strictly mathematical and will operate identically to our DOM implementation.

### Phase 7: Haptics & Accessibility Integration
- Implement `expo-haptics` or `Vibration` modules to physically pulse the Android device lightly when crossing section breaks or massive focal pauses to tactfully communicate reading rhythm structural changes.

### Phase 8: System Architecture & Interaction Modifiers
Four critical web paradigms exist in our codebase that physically cannot transparently map to a mobile device without explicit native re-working:

1. **Gestures vs Keyboards (`useKeyboardShortcuts.ts`)**:
   - The web app relies entirely on `Space` (Play/Pause) and `Arrow` keys (Skip sentences/Adjust WPM).
   - **Android Conversion**: Install `react-native-gesture-handler`. The reading overlay must become a `<TapGestureHandler>` (Double tap for Play/Pause) overlaid with `<PanGestureHandler>` components (Swipe left/right to skip sentences, swipe down to return to the Storefront).
2. **The Progress Slider (`Controls.tsx`)**:
   - The web app calculates reading position via `onClick={handleProgressClick}` leveraging exact DOM `getBoundingClientRect()` width math.
   - **Android Conversion**: You cannot rely on synchronous bounding boxes in Native. You must replace the web slider with `@react-native-community/slider` or a custom Reanimated layout-tracking component that updates the `wpm` and `progress` state directly from native drag events.
3. **Regex Parsing on the JS Thread (`textProcessing.ts`)**:
   - The `parseText()` function explodes 50,000 word novels using regex rules for punctuation tracking. On a browser, this executes in 15ms. On a mobile phone JS bridge, this can momentarily block the UI thread during routing.
   - **Android Conversion**: Because Android CPU performance varies wildly, execute `parseText()` inside an `InteractionManager.runAfterInteractions` block or explicitly offload to a WebWorker thread (`react-native-threads`) so screen transitions finish animating *before* the regex parsing blocks the CPU. 
4. **App Lifecycle Management (`AppState`)**:
   - **Critical Bug Prevention**: On the web, users "pause" by switching tabs, and the browser gracefully throttles `rAF`. On Android, if the user receives a phone call or locks the screen, the OS suspends the app. 
   - **Android Conversion**: You must hook into React Native's `AppState` listener. Specifically, when `appState.match(/inactive|background/)` triggers, you must force the `rsvp.pause()` method so the book doesn't silently keep reading itself while the phone is locked.

## 9. Asset Strategy: Cover Images

The web prototype originally hotlinked book covers from gutenberg.org at paint time, which throttles and drops connections and left shelves blank. The web app now mirrors curated covers to a static host (see `docs/planning/book_access_strategy.md` §5) and points at it via `VITE_COVER_BASE`, with a generated cover fallback in `BookCover` for any miss.

For the native port, keep that model and lean on the platform:
- **Point at the static cover host**, a CDN URL, not gutenberg. The same `<id>.webp` files the web app uses.
- **Use a caching image component.** React Native `<Image>` already caches to disk; `expo-image` or `react-native-fast-image` give finer control. Each cover is then fetched once and afterwards served from the device cache, offline and instant.
- **Cache a book's cover alongside its downloaded content**, so books in "My Library" always render their covers with no network.
- **Keep the generated cover as the fallback** for any cover not cached yet, mirroring the web `BookCover` behavior.
