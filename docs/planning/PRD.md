# Focus Reader — Product Requirements Document

## Vision
**One sentence**: A **Cognitive Efficiency** tool that enables deep focus and high-speed comprehension by aligning with the brain's natural reading mechanics.

**The problem**: Traditional reading requires constant eye movement — saccades across lines, re-fixations on complex words, and cognitive overhead managing where your eyes "should" be. This is exhausting at scale.

**The solution**: RSVP (Rapid Serial Visual Presentation) eliminates eye movement entirely. The reader's gaze stays fixed on a single point while words flow through it. The "focal letter" (optimal recognition point) is always centered, reducing cognitive load and enabling sustainable high-speed reading.

---

## Target Users

| Persona | Need | Why Focus Reader |
|---------|------|-----------------|
| **The Recovery Skeptic** | Burned by "speed reading" scams; needs retention | **Logical Memory focus**: Prioritizes understanding over raw WPM |
| **The Content Crusher** | Overwhelmed by volume (students/researchers) | **High Throughput**: 2.5x speed without the "strobe light" fatigue |
| **The Literary Savorer** | Comfort in books; hates flashing text | **Deep Focus Mode**: Distraction-free, aesthetic reading environment |
| **Knowledge Workers** | Documentation and technical reports | **Pace-Aware RSVP**: Slows down for complex syntax and punctuation |

---

## Core UX Principles

### 1. The Focal Point is Sacred
The red letter **never moves**. Not by a pixel. This is the anchor for the reader's visual system. Any jitter breaks immersion and causes eye fatigue.

### 2. Rhythm > Raw Speed
Reading isn't just about WPM — it's about *comprehension flow*. Punctuation pauses let the brain catch up:
- **Sentence end (. ! ?)** → 3x pause (let meaning land)
- **Clause break (,)** → 2x pause (mini-breath)
- **Long words** → slight extra time (recognition cost)

### 3. Zero Friction Input
"Ingest anything" means:
- Paste text instantly
- Drop a file (PDF, EPUB, TXT)
- Eventually: browser extension, URL paste, email forward

### 4. Distraction-Free Reading
During active reading:
- No UI chrome except essential controls
- Dark mode to reduce eye strain
- Full-screen capability
- Minimal motion (no animations during word transitions)

---

## Feature Requirements

### P0 — Core Experience (MVP) ✅

| Feature | Status | UX Rationale |
|---------|--------|--------------|
| RSVP display with perfect focal centering | ✅ Done | The entire product hinges on this |
| Guide frame (Spritz-style) | ✅ Done | Visual anchor for the eye |
| WPM control (100-1000) | ✅ Done | Users need to find their sweet spot |
| Play/Pause (Space) | ✅ Done | Instant control is essential |
| Skip forward/back (← →) | ✅ Done | Recovery from distraction |
| Punctuation-aware pausing | ✅ Done | Comprehension rhythm |
| Text paste input | ✅ Done | Zero friction entry point |
| Dark mode | ✅ Done | Reduce eye strain |

### P1 — Input Expansion

| Feature | Status | UX Rationale |
|---------|--------|--------------|
| PDF text extraction | 🔜 Pending | Major content source |
| EPUB text extraction | 🔜 Pending | Books are the ultimate use case |
| Drag-and-drop files | ✅ Done | Faster than file picker |
| URL paste → article extraction | ❌ Not started | Web reading is huge |

### P2 — Reading Experience Polish

| Feature | Priority | UX Rationale |
|---------|----------|--------------|
| **Sentence preview** | High | Show next sentence faintly below focal point |
| **Progress memory** | High | Resume where you left off |
| **Adjustable font** | Medium | Personalization reduces friction |
| **Serif/Sans toggle** | Medium | Preference varies by reader |
| **Full-screen mode** | Medium | Total immersion |
| **Reading stats** | Low | Gamification (words read, time saved) |

### P3 — Platform Expansion

| Feature | Notes |
|---------|-------|
| **Responsive Mobile Layout** | Desktop-class experience on phone screens (no separate app) |
| **Native Mobile Apps (P4)** | Full rewrite in Swift/Kotlin using React app as spec |
| Browser extension | Highlight text → Read in Focus Reader query param |
| Keyboard-only navigation | Accessibility requirement |
| Voice speed control | "Faster" / "Slower" / "Pause" |

---

## Anti-Requirements (What We Won't Do)

1. **No flashy animations** — Transitions must be instant. Fades/slides cause nausea at high WPM.
2. **No audio sync** — TTS is a different product. Focus Reader is about visual speed.
3. **No social features** — This is a tool, not a platform.
4. **No mandatory accounts** — Works offline, no login required.

---

## Success Metrics

| Metric | Target | Why |
|--------|--------|-----|
| Time to first read | < 10 seconds | Paste → Reading with no barriers |
| Sustained reading session | > 5 minutes | Users actually use it, not just try it |
| Return usage | 3+ sessions/week | Habit formation |
| WPM increase over time | +100 WPM after 1 week | Skill building |

---

## Open Questions

1. **Optimal focal index algorithm** — ✅ **Resolved**: Research confirms ORP at ~30-35%. Implementation verified against Pyle (1921) findings on visual spans.

2. **Paragraph breaks** — ✅ **Resolved**: Essential for "Logical Memory" encoding. We will implement mandatory mini-pauses (5x delay) between paragraphs.

3. **Comprehension mode** — ✅ **Resolved**: We reject "1000 WPM" as a goal. Success is measured by retention. We will implement "Checkpoint Mode" (comprehension checks).

4. **Bionic Reading integration** — Under consideration. Research suggests it may compete for attention with the red focal point if not balanced correctly.

---

## Appendix: Competitive Landscape

| Product | Strength | Weakness |
|---------|----------|----------|
| Spritz | Pioneered RSVP on web | Proprietary, requires SDK |
| Spreeder | Free, simple | Dated UI, no mobile app |
| Reedy (Android) | Good mobile UX | Android only |
| SwiftRead | Browser extension | Extension-only, no standalone |

**Focus Reader's edge**: Modern stack, open, premium UX, "ingest anything" philosophy.
