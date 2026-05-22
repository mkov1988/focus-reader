# Focus Reader: iOS Native Conversion Strategy (React Native)

This comprehensive guide outlines the architectural bridge between our current React-DOM web prototype and a fully compiled, App Store-ready native iOS application.

## 1. Current State (Web Prototype completed Feb 2026)
- **UI/UX Architecture**: The DOM-based `StoreFront` replicates iOS App Store density using 4 horizontal book scrollers (`Popular`, `Latest`, etc.) and a vertical `Browse Categories` list.
- **Reading Engine**: A highly-tuned RSVP engine utilizing Web API `requestAnimationFrame` to achieve strict 60fps word-delivery up to 1000 WPM without layout thrashing.
- **Visual Rhythm**: Tailored text typography (Inter font) and mathematically computed focal-letter alignment using CSS `translate(-50%)` offsets.

## 2. Technical Migration Phases

### Phase 1: Toolchain & Infrastructure
For a text-rendering app requiring 60fps locking, **Expo (SDK 50+) with the Hermes engine** is unconditionally recommended over the Bare React Native CLI.
- **Why Expo?**: It provides flawless pre-compiled native modules for safe-areas, system fonts, and haptics out-of-the-box.
- **Router**: Use `Expo Router` (file-based navigation) or `@react-navigation/native` to map our `viewMode` state into a true native `UINavigationController` stack (giving users the iOS-standard right-swipe-to-go-back gesture for free).

### Phase 2: Replacing the DOM (Storefront Migration)
All generic HTML tags must be converted to native UI primitives (`div` -> `View`, `span` -> `Text`).

#### The `<BookScroller>` Translation
The web CSS `overflow-x-auto snap-x` relies on browser scroll physics. On iOS, we must explicitly map to `<FlatList>` to hook directly into the native iOS `UIScrollView`.

**Web React (Current):**
```tsx
<div className="flex gap-3 overflow-x-auto snap-x">
  {books.map(book => <BookCard key={book.id} />)}
</div>
```

**React Native iOS (Future):**
```tsx
<FlatList
  horizontal
  data={books}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <BookCard title={item.title} />}
  showsHorizontalScrollIndicator={false}
  snapToInterval={CARD_WIDTH + SPACING} // Enables crispy Apple-like snapping
  decelerationRate="fast"
  contentContainerStyle={{ paddingHorizontal: 16 }}
/>
```

### Phase 3: iOS-Specific Paradigm Shifts
1. **The Dynamic Island / Notch (`SafeAreaView`)**:
   Instead of hardcoded CSS `pt-3` top padding, wrap the `StoreFront` root in `react-native-safe-area-context` `<SafeAreaView>`. This prevents our header and Search Bar from rendering underneath the iOS hardware notch or over the bottom home indicator.
2. **Apple Proprietary Shadows**:
   Web CSS `box-shadow` is ignored by the iOS CoreAnimation compilation engine. Convert all Tailwind shadows to iOS properties on the `StyleSheet`:
   ```javascript
   shadowColor: '#000',
   shadowOffset: { width: 0, height: 4 },
   shadowOpacity: 0.1,
   shadowRadius: 12,
   ```
3. **Glassmorphism (Blur Effects)**:
   For the bottom navigation bar or reading overlay backgrounds, replace CSS `backdrop-filter: blur()` with `expo-blur`'s `<BlurView intensity={50} tint="light" />`, which physically calls `UIVisualEffectView` in native Swift.

### Phase 4: The Core Focus Reader Engine Port (RSVP)
Migrating the high-speed RSVP (Rapid Serial Visual Presentation) reading engine from the web DOM to iOS entails distinct performance and rendering challenges.

1. **The Pacing Loop (`requestAnimationFrame` vs Reanimated)**:
   - **The Web constraints**: On the web, `useRSVP` uses `requestAnimationFrame` (rAF) sync'd to the 60Hz browser paint cycle. 
   - **The JS Bridge bottleneck**: React Native runs Javascript on a separate thread from the UI. If the bridge gets congested by API calls or state updates, the RSVP engine will stutter, causing words to "hang" and disrupting the reader's cognitive flow.
   - **The Native Solution**: Rewrite the core reading loop using **`react-native-reanimated` (v3)**. Move the focal letter computation algorithms and the word-rendering loop off the JS thread entirely. Push them onto the **UI Thread** using Reanimated worklets (`useFrameCallback`). This guarantees the reading speed never drops a single frame, perfectly matching the 120Hz ProMotion displays on modern iPhones.

2. **Focal Letter Centering (CSS to Native View)**:
   - **The Web Way**: We currently use CSS `transform: translateX(-50%)` calculated from the DOM text width.
   - **The iOS Way**: React Native layout relies on `onLayout` events to measure width, but these fire asynchronously *after* the render frame, causing a 1-frame jitter. To fix this for the Focal Letter:
     - Use a highly predictable Monospaced or strictly-tracked font (like purely measured `Inter`) to mathematically Pre-calculate the exact DP pixel width of the `left` offset before the render pass.
     - Translate the CSS math to `style={{ transform: [{ translateX: -measuredWidth / 2 }] }}` explicitly.

3. **String Highlighting (Nesting `<Text>`)**:
   - The web RSVP engine renders `<span className="focal-letter text-red-500">`. 
   - On iOS, React Native `<Text>` tags can be nested inherently to apply focal styling. The exact syntax will be:
     ```tsx
     <Text style={styles.baseWord}>
       {word.before}
       <Text style={styles.focalLetter}>{word.focal}</Text>
       {word.after}
     </Text>
     ```

### Phase 5: Multi-View Rendering & Line Wrap Pacing
Our MVP includes advanced reading ergonomics ("Sentence View" alongside pure "RSVP") defined by `VisualizationMode`. 

1. **Rendering Sentence View**:
   - **The Web constraints**: We render the active sentence in the center of the viewport, with previous and next sentences grayed out.
   - **The iOS Solution**: React Native `<FlatList>` or Reanimated carousels can be used to render the array of parsed sentences. Scroll the flatlist to index using `scrollToIndex({ animated: true, index: activeSentenceIndex })` to keep the active sentence vertically centered exactly like a teleprompter, matching the web implementation.

2. **Line-Wrap Detection (`onTextLayout`)**:
   - **The Web Way**: We currently use `SPAN` bounding boxes and `offsetTop` compared against the parent container to detect when a sentence visually wraps to the next line.
   - **The iOS Way**: You *cannot* read raw bounding box data synchronously on Native. Instead, use React Native's `<Text onTextLayout={(e) => { ... }}>` prop. 
   - `e.nativeEvent.lines` returns an array of exact line objects generated by the iOS CoreText engine. You can iterate through this array to determine exactly which word indexes trigger a visual line wrap, populating the `lineStartIndices` Set natively.

3. **Cognitive Pacing Algorithms**:
   - Ensure the `useRSVP` Reanimated worklet (from Phase 4) carries over our heavily tuned Cognitive Multipliers:
     - `SENTENCE_START_MULTIPLIER` (1.8x)
     - `SENTENCE_START_OFFSET` (500ms fixed delay)
     - `LINE_START_MULTIPLIER` (1.5x delay when a word trips the `lineStartIndices` check)
   - These multipliers are purely mathematical and will translate 1:1 into the C++ worklet tick calculation.

### Phase 6: Haptics & Accessibility Integration
- **Haptic Feedback**: Introduce `expo-haptics`. Trigger a `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` event every time a chapter ends or major punctuation (like a period with a 3x Pause Multiplier) hits the screen. This physical tactile "tap" grounds the speed-reading experience into reality.
- **Dynamic Type**: Ensure all text components respect the user's OS-level accessibility "Larger Text" settings by utilizing `allowFontScaling={true}`.

### Phase 7: System Architecture & Interaction Modifiers
Four critical web paradigms exist in our codebase that physically cannot transparently map to a mobile device without explicit native re-working:

1. **Gestures vs Keyboards (`useKeyboardShortcuts.ts`)**:
   - The web app relies entirely on `Space` (Play/Pause) and `Arrow` keys (Skip sentences/Adjust WPM).
   - **iOS Conversion**: Install `react-native-gesture-handler`. The reading overlay must become a `<TapGestureHandler>` (Double tap for Play/Pause) overlaid with `<PanGestureHandler>` components (Swipe left/right to skip sentences, swipe down to return to the Storefront).
2. **The Progress Slider (`Controls.tsx`)**:
   - The web app calculates reading position via `onClick={handleProgressClick}` leveraging exact DOM `getBoundingClientRect()` width math.
   - **iOS Conversion**: You cannot rely on synchronous bounding boxes in Native. You must replace the web slider with `@react-native-community/slider` or a custom Reanimated layout-tracking component that updates the `wpm` and `progress` state directly from native drag events.
3. **Regex Parsing on the JS Thread (`textProcessing.ts`)**:
   - The `parseText()` function explodes 50,000 word novels using regex rules for punctuation tracking. On a browser, this executes in 15ms. On a mobile phone JS bridge, this can momentarily block the UI thread during routing.
   - **iOS Conversion**: Execute `parseText()` inside an `InteractionManager.runAfterInteractions` block so screen transitions finish animating *before* parsing blocks the CPU. 
4. **App Lifecycle Management (`AppState`)**:
   - **Critical Bug Prevention**: On the web, users "pause" by switching tabs, and the browser throttles `rAF`. On an iPhone, if the user receives a phone call or locks the screen, the iOS system suspends the app. 
   - **iOS Conversion**: You must hook into React Native's `AppState` listener. Specifically, when `appState.match(/inactive|background/)` triggers, you must force the `rsvp.pause()` method so the book doesn't silently keep reading itself while the phone is locked.
