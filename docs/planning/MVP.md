# Focus Reader MVP: Gutenberg Streaming & Core Experience

## 1. Executive Summary
The Goal of this MVP is to establish the "Golden Path" for Focus Reader: **Search → Stream → Read**. We will integrate a direct pipeline to Project Gutenberg's 70,000+ free books, allowing users to start reading instantly without file management, while providing a robust set of reading modes and quality-of-life enhancements.

---

## 2. The Gutenberg "Streaming" Engine

### A. Instant Search & Discovery
*   **Search Interface**: A clean, fast omnibar to search Project Gutenberg metadata (Title, Author).
*   **Data Source**: Use **Gutendex API** (open-source Project Gutenberg JSON API) for metadata.
    *   *Endpoint*: `https://gutendex.com/books?search={query}`
*   **Result Display**:
    *   Book Cover (if available)
    *   Title & Author
    *   Download Count (social proof/quality proxy)

### B. "Streaming" Content Delivery
*   **Concept**: Eliminate the "Download -> Find File -> Upload" friction.
*   **Mechanism**:
    1.  **Fetch**: Direct CORS fetch of the `.txt` (UTF-8) version from Gutenberg mirrors.
    2.  **Sanitize**: Auto-strip the "Project Gutenberg" legal headers/footers (approx first 50 lines and last 300 lines) to jump straight to the content.
    3.  **Store**: Cache the book text in `IndexedDB` immediately upon fetch.
*   **User Experience**: Click a book → Spinner (<1s) → Reading starts at Chapter 1.

---

## 3. Reading Modes (The Views)
The MVP includes all four core visualizations to support different cognitive styles.

### A. RSVP Mode (The "Spritz" Style)
*   **Method**: Single word display.
*   **Key Mechanic**: **Perfect Focal Centering**. The Optimal Recognition Point (ORP) of the word (red letter) is fixed at the exact screen center.
*   **Use Case**: Maximum speed (500-1000 WPM).

### B. Sentence View ("Karaoke" Mode)
*   **Method**: Displays the current sentence in full.
*   **Key Mechanic**: The active word is highlighted. The sentence stays static until the next sentence is reached.
*   **Use Case**: Complex texts requiring local context.

### C. Paragraph View (Stream Reader)
*   **Method**: Continuous text flow.
*   **Key Mechanic**:
    *   Active word highlight moves through the paragraph.
    *   **Auto-Scroll**: The container scrolls smoothly to keep the active line vertically centered.
*   **Use Case**: Casual reading, "Savoring" mode.

### D. Hybrid View
*   **Method**: RSVP display on top, faded paragraph context below.
*   **Key Mechanic**: Peripheral context addresses the "loss of tracking" anxiety in pure RSVP.
*   **Use Case**: Speed reading with safety rails.

---

## 4. Quality of Life (QoL) Features

### A. Session & Progress
*   **Auto-Resume**: "Pickup where you left off." App remembers `wordIndex` for every unique Book ID.
*   **History**: Home screen "Continue Reading" shelf showing the last 3 opened books.

### B. Theme & Visuals
*   **Light / Dark Mode**:
    *   Toggle switch in settings.
    *   Respects system preference on first load.
*   **Font Customization**:
    *   **Size**: Slider control (24px to 96px).
    *   **Family**: Toggle between Serif (e.g., Merriweather/Georgia), Sans (Inter/Roboto), and Mono (JetBrains/Fira).

### C. Playback Controls
*   **WPM Control**: Granular control (100 - 1000 WPM) with acceleration steps (+25 / +50).
*   **Navigation**:
    *   **Seek Bar**: Visual scrubber for total progress.
    *   **Skip**: Back/Forward 10s (or sentence-based skipping).
    *   **Pause/Play**: Spacebar toggle.

### D. Pacing Engine
*   **Punctuation Pauses**:
    *   Comma: 2x delay.
    *   Period/Paragraph: 3x delay.
*   **Long Word Delay**: Subtle slowdown for words >10 characters.

---

## 5. Technical Requirements for MVP

### A. API & Networking
*   **CORS Proxy**: We may need a lightweight proxy (Netlify Function / Vercel Edge) if Gutenberg mirrors block direct client-side requests, although many mirrors are CORS-friendly.
*   **Offline First**: Once a book is "streamed," it lives in the browser. Zero network required for second read.

### B. State Management
*   **Global State**: Must track:
    *   `CurrentBook` (ID, Content, Metadata)
    *   `ReadingSettings` (WPM, Mode, Theme)
    *   `SessionProgress` (Map of BookID -> Index)

### C. Performance
*   **60 FPS Rendering**: No layout shifts during WPM ticks. Use of `transform` and `opacity` over `margin/padding` updates.
*   **Virtualization**: For "Paragraph View" on long books, render only the active viewport of text to prevent DOM bloat.
