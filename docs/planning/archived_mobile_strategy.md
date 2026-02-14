# Mobile Strategy Options

Given your experience with cross-platform ("magical") tools, here are realistic alternatives for launching `Focus Reader` on mobile, ranked from "Least Magical" (most control/native) to "Most Efficient".

## Option 1: Progressive Web App (PWA)
Launch as an installable website manually added to the Home Screen.
- **Pros**: 
  - Zero "magic" abstraction layers; it's just your existing web code.
  - Updates are instant (no App Store review).
  - Works offline if configured properly.
- **Cons**: 
  - No Apple App Store presence (harder discovery).
  - Limited access to native APIs (e.g., background sync on iOS is tricky).
- **Verdict**: **Recommended Step 1**. Low effort, high reward, no new tech stack.

## Option 2: React Native (with Expo)
Use React to build *truly native* UI components, not a web view.
- **Difference**: Unlike Cordova/Ionic/Capacitor, this does NOT run your website in a wrapper. It maps React components to real iOS `UIView` and Android `View` widgets.
- **Pros**: 
  - Shared logic (JavaScript/TypeScript), but native performance and feel.
  - Huge ecosystem (Meta backed).
- **Cons**: 
  - Still a "write once" abstraction. Upgrades can be painful if you rely on many native modules.
  - You cannot reuse your HTML/CSS directly; you must rewrite the UI in React Native primitives (`<View>`, `<Text>`).

## Option 3: Fully Native (Swift & Kotlin)
Build two separate apps: one in Swift (iOS) and one in Kotlin (Android).
- **Pros**: 
  - **Zero Compromise**. Perfect performance, full API access, 100% platform standard UI.
  - Easier to debug platform-specific issues (no bridge layer).
- **Cons**: 
  - **Maximum Effort**. Two codebases to maintain.
  - Need to learn/know Swift and Kotlin.
  - Logic must be duplicated (or shared via advanced methods like Kotlin Multiplatform, which is another "magic" tool).
- **Verdict**: Best for quality, worst for velocity.

## Option 4: Capacitor / Ionic (The "Web View" Wrapper)
*This was the original suggestion.*
- **Mechanism**: Wraps your *existing* build in a native web view container.
- **Pros**: 100% code reuse.
- **Cons**: Can feel "janky" if the web app isn't perfectly optimized for touch/animations. (This is likely the "magical tool" experience you disliked).

## Recommendation
Since you dislike the "magical" one-codebase tools:

1.  **Immediate**: Let's polish the PWA experience. It's honest web tech, no wrapper.
2.  **Next**: If you need an App Store presence, I suggest **React Native** (Expo) over a web-wrapper. It's a rewrite of the *UI*, but it feels native.
    - *Or*, if you are willing to learn/write Swift/Kotlin, we can start a pure native iOS app first.
