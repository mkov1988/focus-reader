# Focus Reader MVP: Gutenberg Streaming & Core Experience

## 1. Executive Summary
The Goal of this MVP is to establish the "Golden Path" for Focus Reader: **Search → Stream → Read**. We will integrate a direct pipeline to Project Gutenberg's 70,000+ free books, allowing users to start reading instantly without file management, while providing a robust set of reading modes and quality-of-life enhancements.

---

## 1.5. The User Experience Map
This ASCII map visuals the core MVP "Golden Path" broken down by phases.

```text
    [ DISCOVERY ]           [ ENGAGEMENT ]          [ CONSUMPTION ]         [ RETENTION ]
    (StoreFront)           (Book Selection)         (Reader View)           (Library)

         |                       |                       |                       |
    [ CONTINUE ] --------------------------------------> |                       |
   (1-Tap Resume)                |                       |                       |
         |                       |                       |                       |
  [ QUICK START ] -------------------------------------> |                       |
 (Cover Play Btn)                |                       |                       |
         |                       |                       |                       |
   [ SEARCH BAR ] --------> [ BOOK OVERVIEW ] ----> [ CORE ENGINE ] ----> [ PROGRESS SAVE ]
         |                       |                       |                       |
         v                       v                       v                       v
   (Keywords/Authors)       (Synopsis/Stats)        (RSVP/Sentence)        (Persistent Pos)
         |                       |                       |                       |
         |                       |                       |----------------> [ HABIT LOOP ]
         |                       |                       |                       |
  [ CATEGORY TABS ]              |                [ PACING MODS ]         (Daily Streaks)
         |                       |                       |                       |
         v                       v                       v                       v
  (History, Romance)        [ DOWNLOAD ]           (WPM / Font)            [ ANNOTATIONS ]
         |                       |                       |                       |
         |                       |                       |                       |
 [ QUAD-SCROLLER ]               |                [ GESTURE NAV ]         [ EXPORT NOTES ]
         |                       |                       |                       |
         v                       v                       v                       v
  (Popular, Latest)        [ START READ ]          (Play/Pause/Skip)       (Notion/Obsidian)
         |                       |                       |                       |
         +-----------------------+-----------------------+-----------------------+
```

### Phase Breakdown
1. **Discovery (The Entrance)**: Minimalist StoreFront. Touchpoints: "Continue Reading" (1-Tap Fast Track), "Quick Start" Cover Buttons (1-Tap New Read), Search Bar, Category Icons, Quad-Scrollers. Feeling: Organized and vast without cognitive overload. Aim: Minimized Time on Task.
2. **Engagement (The Commitment)**: Title inspection. Touchpoints: Book Metadata and "Quick Preview" snippets. Feeling: Curiosity, preparing for deep focus. (Bypassed if using Continue/Quick Start).
3. **Consumption (Flow State)**: The Reading Engine. Touchpoints: Perfectly anchored Red Focal Letter, WPM sliders, Gesture Pausing. Feeling: Rhythmic immersion, high cognitive velocity.
4. **Retention (Growth)**: Exiting the app. Touchpoints: Persistent "Continue Reading" shelf linking back to Discovery. Feeling: Accomplishment and habit formation.

---

## 1.6. Detailed System User Flow (ASCII)

This granular flowchart details the exact paths, states, and gesture controls from App Launch through the Reading Engine.

```text
                                         +-----------------------+
                                         |     APP LAUNCH        |
                                         +-----------------------+
                                                    |
                                         +-----------------------+
                                         |  STOREFRONT (HOME)    |
                                         | - Search Bar          |
                                         | - Scrollers           |
                                         +-----------------------+
                                         /          |            \
                         [FAST TRACK 1] /           |             \ [EXPLORE]
                +----------------------+            |              +----------------------+
                | 'Quick Start' /      |            |              | Search / Browse Book |
                | 'Continue' Button    |            |              +----------------------+
                +----------------------+            |                         |
                         |                          |              +----------------------+
                         |                          |              | Book Overview Modal  |
                         |                          |              +----------------------+
                         |                          |                         |
                         \                          |                        /
                          \                         v                       /
                           \             +-----------------------+         /
                            +----------> | ⚙️ PARSING ENGINE    | <-------+
                                         | (Split 50k+ words)    |
                                         +-----------------------+
                                         /          |
                               [ERROR]  /           | [SUCCESS]
                     +-----------------+            v
                     | Toast:          | +-----------------------+
                     | Corrupted File  | |    READER VIEW        |
                     +-----------------+ | - Red Focal Letter    |
                                         | - Invisible Controls  |
                                         +-----------------------+
                                                    |
                  +---------------------------------+---------------------------------+
                  |                                 |                                 |
         [ DOUBLE TAP ]                      [ SWIPE L/R ]                      [ SWIPE DOWN ]
                  |                                 |                                 |
                  v                                 v                                 v
       +-----------------------+         +-----------------------+         +-----------------------+
       | Pause/Play Overlay    |         | Skip Sentence         |         | Save Progress & Exit  |
       +-----------------------+         +-----------------------+         +-----------------------+
                  |                                 |                                 |
                  +------------> (Return) <---------+                                 v
                                                                           +-----------------------+
                                                                           |     STOREFRONT        |
                                                                           +-----------------------+
```

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
