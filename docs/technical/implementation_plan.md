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
│   ├── Reader/           # The high-performance RSVP engine
│   │   ├── RSVPDisplay.tsx
│   │   ├── Controls.tsx
│   │   └── ProgressBar.tsx
│   ├── Input/            # File upload & text paste
│   │   ├── FileUpload.tsx
│   │   └── TextInput.tsx
│   └── Settings/         # Config options
│       └── SettingsModal.tsx
├── hooks/
│   ├── useRSVP.ts        # The "Brain": handles the WPM timer loop
│   └── useFileParser.ts  # Handles .pdf / .epub extraction
├── utils/
│   ├── textProcessing.ts # Splitting text, finding focal points
│   └── alignment.ts      # The math for "Perfect Center"
└── App.tsx
```

## 4. Specific Implementation Details

### The "Perfect Alignment" Logic (Crucial)
To meet the specific requirement where the red letter *never moves* and letters don't overlap:
1.  **Monospace assumption?** No, variable width fonts are allowed.
2.  **Measurement Strategy**:
    -   Render the active word invisibly to measure the width of the characters *before* the focal letter.
    -   Calculate `offset = width_of_preceding_portion + (width_of_focal_letter / 2)`.
    -   Apply `transform: translateX(-offset)` to the container of the word, assuming the container's left edge starts at the screen center.
    -   **Alternative (Simpler)**:
        -   Flex container tailored for each word split into: `[Prefix] [Focal] [Suffix]`.
        -   `Prefix`: Align text-right, fixed width (50% of screen).
        -   `Focal`: Fixed center.
        -   `Suffix`: Align text-left, fixed width (50% of screen).
        -   *Correction*: This creates gaps if not careful. The explicit `translateX` method ensures natural kerneling.

### RSVP Engine (`useRSVP`)
-   `useEffect` using `requestAnimationFrame` for smooth, jitter-free timing.
-   **WPM Calculation**: `delay = 60000 / WPM`.
-   **Pause on Punctuation**: Intelligent delays for comprehension:
    -   Sentence endings (`.` `!` `?`): **3x pause**
    -   Commas (`,`): **2x pause**
    -   Minor punctuation (`;` `:`): **1.5x pause**
    -   Long words (8+ chars): **+0.2x**, (12+ chars): **+0.5x**

### Data Flow
1.  **Input Phase**: User inputs text -> Processed into `string[]` (words) -> Stored in Global Context or Main State.
2.  **Reading Phase**: `currentIndex` integer tracks position. `RSVPDisplay` component receives `words[currentIndex]`.

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
