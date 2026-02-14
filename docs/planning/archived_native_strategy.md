# Strategy Analysis: Web Prototype vs. Native Build

**User Proposal**: Perfect the UX in the current React stack, then rewrite in Native code.

## 1. The "Prototyping" Advantage (Why this isn't crazy)
-   **Velocity**: We can iterate on the "Feel" (timing, colors, typography) 10x faster in React/CSS than in Swift/Kotlin.
-   **Living Spec**: Instead of writing a document saying "pause for 300ms," you can just point to the React app and say "Make the native app feel like *this*."
-   **Low Risk**: If you decide a feature (e.g., "Speed Dial") is bad, we deleted 10 lines of JS, not 100 lines of complex Swift.

## 2. The "Double Work" Risk (The Trap)
-   **Throwaway Code**: Every line of UI code verify write in React will be thrown away. It cannot be copy-pasted to Swift.
-   **Touch vs. Mouse**: A "perfect" desktop web experience often relies on hovers or precise clicks. Native requires gestures (swipes, pinches). We must build the React app with *Touch* in mind, even if we are on desktop.
-   **Sunk Cost**: We must **STOP** doing "Web Polish" tasks (SEO, PWA Service Workers, Browser Caching) because those don't help the Native App.

## 3. Recommendation
**This is a solid strategy IF we treat the React App as a "High-Fidelity Prototype," not the Final Product.**

### New Rules of Engagement:
1.  **Focus on Core Mechanics**: Spend time perfecting the RSVP algorithm, the eye-tracking, and the file parsing.
2.  **Skip "Web Glue"**: Do not waste time on PWA manifests, Service Workers, or SEO.
3.  **Simulate Mobile**: We should develop using Mobile Viewport mode to ensure the UX targets touch, not mouse.

### Verdict
I support this direction. It prioritizes **Product Definition** over **Code Reuse**.
