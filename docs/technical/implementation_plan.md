# Focus Reader - Implementation Plan

## 1. User Requirements

### Core Purpose
A web-based RSVP (Rapid Serial Visual Presentation) speed-reading application designed to minimize eye movement by presenting text one word at a time with a fixed focal point.

### Target Audience
- Professionals, students, and avid readers seeking efficiency.
- Biohackers interested in reading optimization.

### Key Features
1.  **Text Input**:
    - Paste text directly.
    - Upload PDF or EPUB files.
    - Live preview of content.
2.  **Reading Mode (RSVP)**:
    - **Visual Style**:
        - Words displayed one at a time.
        - **Critical Requirement**: The "Focal Letter" (highlighted in red) must be **absolutely centered** on the screen.
        - The rest of the word flows naturally around this fixed center point (no overlapping letters, normal spacing).
        - **Instant Transitions**: No fade or slide animations between words; updates must be immediate.
        - **Progressive Bolding**: Letters before the focal point slightly bolder to guide the eye (optional/configurable based on spec, but "Focal Letter" is the priority).
    - **Controls**:
        - Adjustable Speed: 100 - 1000 WPM.
        - Play/Pause (Spacebar).
        - Navigation: Rewind/Forward by 10 words (Arrow keys).
        - Progress bar and time remaining.
3.  **Customization**:
    - Font Size (24px - 96px).
    - Font Family (Sans-serif options).
    - Theme (Light/Dark).
4.  **Accessibility**:
    - High contrast support.
    - Keyboard shortcuts.

## 2. Technical Stack (Performance Optimized)

-   **Core**: React 18+ (Vite) + TypeScript.
    -   *Why?* Virtual DOM + `requestAnimationFrame` hooks ensure 60fps rendering without "jitter" at high speeds.
-   **Styling**: Tailwind CSS.
    -   *Why?* rapid UI development with a consistent design system (colors, spacing).
-   **State Management**: React `useState` / `useReducer` (or `Zustand` if complex).
-   **File Parsing**: `pdfjs-dist` (PDFs), `epubjs` (EPUBs).
-   **Icons**: `lucide-react`.

## 3. Architecture & Standards

### File Structure
```
src/
├── components/
│   ├── Layout/           # Main page structure
│   │   ├── Canvas/           # NEW: The 3D World
│   │   │   ├── Scene.tsx     # Lights, Camera, Environment
│   │   │   ├── Library.tsx   # The Shelves and Floating Islands
│   │   │   └── BookMesh.tsx  # The interactive 3D book object
│   ├── UI/               # NEW: 2D Overlay (HUD)
│   │   ├── Navigation.tsx    # "Home", "Search", "Settings"
│   │   └── SearchBar.tsx     # Floating search input
│   ├── Reader/           # The high-performance RSVP engine
│   │   ├── RSVPDisplay.tsx   # 2D reading view (overlay)
│   │   ├── Controls.tsx
│   │   └── ProgressBar.tsx
│   ├── Input/            # File upload & text paste
│   │   ├── FileUpload.tsx
│   │   └── TextInput.tsx
│   └── Settings/         # Config options
│       └── SettingsModal.tsx
├── hooks/
│   ├── useRSVP.ts        # The "Brain": handles the WPM timer loop
│   ├── useFileParser.ts  # Handles .pdf / .epub extraction
│   └── useLibrary3D.ts   # NEW: Handles 3D interactions (raycasting, selection)
├── utils/
│   ├── textProcessing.ts # Splitting text, finding focal points
│   └── alignment.ts      # The math for "Perfect Center"
└── App.tsx
```

## 4. Technical Stack (Updated for 3D Pivot)

-   **Core**: React 18+ (Vite) + TypeScript.
-   **3D Engine**: **React Three Fiber (R3F)**.
    -   *Why?* Declarative simplified Three.js integration that shares React state.
    -   **@react-three/drei**: For pre-built abstractions (Text, OrbitControls, Environment).
    -   **React Spring / Framer Motion**: For smooth transitions between "Shelf View" and "Reading View".
-   **Styling**: Tailwind CSS (for the 2D UI overlay).
-   **State Management**: Zustand.
    -   *Why?* We need to share state between the 3D Canvas (outside React context usually) and the 2D DOM. Zustand handles this transient state updates better than Context for high-frequency changes (like scroll or WPM).
-   **Performance**: `use-asset` or `Suspense` for lazy loading book textures.

## 4. Specific Implementation Details

## 4. Specific Implementation Details (The "Slug Through" Strategy)

### A. The 3D Scene Architecture (R3F)
We will build a "Hybrid" scene where the environment is 3D, but content is optimized for readability.

#### 1. The Environment (`<Library />`)
*   **Geometry**: Low-poly "Stone Slabs" created programmatically (Extruded Shapes) or via simple glTF assets.
*   **Optimization**:
    *   **InstancedMesh**: For repetitive elements like stone blocks or shelf segments to keep draw calls low (<50).
    *   **Baked Lighting**: Use generic "matcaps" or simple ambient light + directional light. No expensive real-time shadows if possible; bake AO into vertex colors or textures.
    *   **Mist**: `fog` attached to the scene to blend distant shelves into the background hue.

#### 2. The Books (`<BookShelf />` & `<BookItem />`)
*   **The Mesh**: A thick, chunky book geometry (BoxBufferGeometry).
*   **The "Holographic" Cover (Scanability Fix)**:
    *   Instead of just mapping the texture to the angled book face, we will use a **`Billboard`** component (from `@react-three/drei`) or a slightly detached plane that rotates to face the camera more directly when hovering or by default.
    *   *Alternative*: Keep the book isometric but map high-contrast, large-type generated covers, not just raw Gutenberg scans.

#### 3. Text & UI in 3D (Contrast Fix)
*   **Labels**: Use `@react-three/drei/Text` for "Popular", "eBooks".
*   **The Inset Technique**: Render a dark generic plane *behind* the white text to simulate a "carved plaque". This guarantees contrast regardless of the stone texture brightness.
*   **Interaction**: `onPointerOver` triggers a spring-based scale up (x1.1) and a cyan emissive glow on the book spine/edges.

### B. State Management (Zustand)
*   **Store**: `useStore`
    *   `viewMode`: 'LIBRARY' | 'READING'
    *   `hoveredBookId`: string | null
    *   `books`: Array<BookMetadata>
*   **Bridge**: The 3D canvas pushes events to the Zustand store, which updates the 2D overlay (e.g., showing a detailed tooltip or the Search bar).

### C. Performance (The "Slug")
*   **Lazy Loading**: Gutenberg covers are fetched only when the shelf comes into view (Intersection Observer for the Canvas or `useInView` for 3D objects).
*   **Texture Recycling**: Reuse geometry and materials (`useMemo`). All books share the same geometry, just different textures/uniforms.

### D. The Reading "Portal"
*   Transition from Library -> Reader:
    *   Camera zooms *into* the selected book.
    *   Screen fades to the Reader background color.
    *   2D RSVP interface mounts on top.
    *   3D Canvas unmounts or pauses rendering loop to save battery while reading.

### Visualization Modes
To support different reading styles, the `RSVPDisplay` component will support three modes via a selector:

1.  **Default (RSVP)**:
    -   Standard single-word display with fixed center alignment.
    -   Clean, distraction-free.

2.  **Paragraph View**:
    -   Renders the full current paragraph as a block of text.
    -   **Active Word Highlight**: A visual marker (background highlight or bold color) moves through the text in sync with the WPM timer.
    -   **Auto-Scroll**: Container ensures the active line is always visible.
    -   **Transition**: When a paragraph ends (`[P]` token), smooth scroll/fade to the next paragraph block.

3.  **Sentence View**:
    -   Displays only the *current sentence*.
    -   **Karaoke Style**: Words highlight in sequence.
    -   **Context**: Prevents overwhelming the reader with a full wall of text, but offers more context than a single word.

4.  **Hybrid View**:
    -   **Top**: Standard RSVP display (the "Driver").
    -   **Bottom**: Paragraph context (faded/smaller text) showing where the reader is in the flow.
    -   *Purpose*: Combines speed of RSVP with the context of traditional reading.

### Data Flow (Updated)
1.  **Input Phase**: Text processed into `string[]` (words) including `[P]` tokens for paragraph breaks.
2.  **Reading Phase**: `currentIndex` drives the state. All views react to `currentIndex`.

## 5. Implementation Roadmap (Revised Strategy: Responsive Web App)

### Phase 1: Core Mechanics & Responsiveness (Desktop First)
*Goal: A perfect desktop experience that adapts gracefully to smaller screens.*
-   [x] Project Setup (React + Vite + Tailwind).
-   [x] Basic RSVP Component.
-   [ ] **Responsive Typography**: Ensure text scales readable on all devices (clamp/fluid type).
-   [ ] **Layout Adaptation**: Controls stack/move for mobile viewports without breaking desktop flow.
-   [ ] **Frame-Perfect Timing**: Ensure loop is jitter-free at 1000 WPM.

### Phase 2: Content Pipeline (The "Moat")
*Goal: Ensure we can actually ingest real-world content.*
-   [ ] **PDF Extraction**: Implement robust parsing.
-   [ ] **EPUB Parsing**: Extract chapter text cleanly.
-   [ ] **"Smart Splitting"**: Algorithm to chunk text intelligently.

### Phase 3: Mobile Interactions (Future)
*Goal: Add touch-specific gestures once layout is stable.*
-   [ ] Swipe to rewind/forward.
-   [ ] Touch-friendly hit areas.

### Phase 4: Native Migration (Long Term)
*Goal: Port the perfected logic to a truly Native App.*
-   [ ] **iOS (Swift)**: Rebuild UI using SwiftUI, porting `textProcessing.ts` logic.
-   [ ] **Android (Kotlin)**: Rebuild UI using Jetpack Compose.
-   [ ] **Note**: The React app serves as the "Living Spec" for these native builds.
