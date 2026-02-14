# Focus Reader: Research Readout

> **Purpose:** Synthesize all research into a single, actionable source of truth for product decisions.
> **Date:** 2026-02-08 | **Status:** v1.1 (Merged)

---

## 1. Executive Summary

**Focus Reader's core bet:** RSVP can become *sustainable* for real reading if it is built around **pixel-stable focal centering** and **comprehension-first pacing**, not raw speed.

**Strategic Positioning:** Focus Reader is a **Cognitive Efficiency** tool, not a speed-reading app. This reframe is critical for trust, messaging, and feature prioritization.

**Key Research Insight:** Speed reading apps fail because they prioritize *Rote Memory* (seeing words) over *Logical Memory* (understanding meaning). Our engine must give the brain time to encode, not just scan.

**Recommended MVP:** A **Complexity-Aware RSVP** reader that adapts timing to difficulty signals, supports paste + .txt + best-effort PDF with clear fallback, and includes strong recovery primitives.

---

## 2. Scientific Foundations (Why RSVP Fails)

This section provides the cognitive science "why" behind our design decisions. It draws from Pyle (1921), William James, and modern user feedback.

### A. Attention is "Sensory Clearness"
*   **Principle:** The brain cannot attend to multiple complex stimuli simultaneously without a loss of clarity (Pyle).
*   **Implication:** Any UI element that "competes" for attention (ads, complex menus, unstable layouts) directly reduces reading comprehension.
*   **Design Rule:** The focal point must be **pixel-stable**. Any jitter breaks immersion and triggers the "strobe light" feeling.

### B. Logical Memory vs. Rote Memory
*   **Principle:** "One can have a good rote memory without understanding, [but] one cannot have a good logical memory without understanding."
*   **The RSVP Failure Mode:** High-speed RSVP forces the brain into *rote* processing (seeing words) at a speed that outpaces *logical* processing (connecting ideas). Users report "not remembering anything."
*   **Design Rule:** **Rhythm > Raw Speed.** Punctuation pauses, paragraph breaks (5x delay), and complexity-aware slow-downs are not optional polish—they are the core mechanism for comprehension.

### C. Habit Formation: The "No Exceptions" Rule
*   **Principle:** "Allowing exceptions... weakens much the newly-made connection."
*   **Implication:** If Focus Reader helps users build a daily reading habit, the app becomes sticky. Sessions must be reliable and low-friction.
*   **Design Rule:** Prioritize **"Time to First Read"** (target: <10 seconds). Minimize friction. Protect reading time from interruption.

### D. The Cost of Fatigue
*   **Principle:** "When we become fatigued we make errors... [forming] connections which we do not wish to make."
*   **Implication:** Pushing through reading fatigue creates bad habits (skimming, zoning out). The app should not celebrate marathon sessions.
*   **Design Rule:** Consider optional break reminders and fatigue mitigation.

---

## 3. User Behavior & Mental Models

### Recurring Behavioral Patterns
| Pattern | Description | Implication |
|:---|:---|:---|
| **Binge & Burnout** | Discover RSVP, binge 1000 WPM for a week, get headaches, abandon tool. | Avoid "1000 WPM" marketing. Default to sustainable speed (300-400 WPM). |
| **Workarounds** | Users narrow browser windows (chunking) or use cursor as pacer. | Desire for *chunking* and *gentle guidance*, not pure word-flashing. |
| **"Guilt of Skimming"** | Users slow down for fiction/high-value texts, feeling speed reading is "cheating." | Position speed as **efficient focus**, not a replacement for deep reading. |

### Mental Models to Design Against
| Model | User Belief | Our Counter-Position |
|:---|:---|:---|
| **Speed vs. Comprehension is Zero-Sum** | "Fast = Shallow, Slow = Deep" | Frame speed as "Understanding at Speed." |
| **"Strobe Light" Effect** | Users feel passive, like watching words flash. | Increase agency via recovery controls, predictable rhythm. |
| **Subvocalization is the Enemy** | "I must stop my inner voice." | **Reject this.** Let users read at the speed of their *fastest* inner voice. Suppression causes fatigue/mind-wandering. |

### Cognitive Load Friction Points
*   **Subvocalization Suppression:** High effort, leads to fatigue and failure. We will *never* tell users to suppress their inner voice.
*   **Loss of Preview/Review:** RSVP removes the natural "glance back" (saccades). This creates anxiety and FOMO. Solution: Strong recovery primitives.

---

## 4. Personas & Jobs-to-be-Done

### Persona A: "The Recovery Skeptic"
*   **Profile:** Burned by "3x your speed" scams. Smart, analytical. Developer or academic.
*   **Motivation:** Wants efficiency but refuses to sacrifice 1% of comprehension.
*   **Needs:** Smart pausing, rock-solid dark mode, EPUB support, predictable recovery.

### Persona B: "The Content Crusher" (Student)
*   **Profile:** Overwhelmed by volume (textbooks, papers).
*   **Motivation:** "I need to get the gist of this chapter in 20 minutes."
*   **Needs:** Fast triage, skimmable modes, exportable takeaways (beyond MVP).

### Persona C: "The Literary Savorer"
*   **Profile:** Reads for emotional connection and solace.
*   **Motivation:** "Comfort found in good old books."
*   **Needs:** Clean, distraction-free typography. Often *hates* RSVP.
*   **Implication:** Win this segment later via a gentler "hybrid" approach (toggle to full-page view).

### Jobs-to-be-Done (JTBD)
1.  **Functional:** "Help me process this PDF documentation before my 3 PM meeting."
2.  **Emotional:** "Make me feel productive and focused, not scattered."
3.  **Social:** "Help me keep up with the books my colleagues are discussing."

---

## 5. Competitive Intelligence

### Synthesized Competitor Feedback (Spreeder, Outread, Reedy, SwiftRead, Spritz)
| Theme | User Sentiment | Implication |
|:---|:---|:---|
| **Comprehension > Speed** | Users quit when they feel like they're "processing words, not meaning." | Comprehension is the product, speed is the interface. |
| **Regressions Matter** | Inability to go back is a top complaint. | Recovery primitives are a moat. |
| **Technical Reliability is Trust** | Crashes, stutters, and parsing failures are fatal. | Parsing quality is a quality gate. |
| **PDF/EPUB Support** | Make-or-break capability. | Table stakes. Best-effort with clear fallback. |
| **Paywall Backlash** | Paywalls create backlash when core value can't be tried. | Freemium with generous free tier. |

### White Space
*   **Email workflows** are largely not solved by competitors. (Beyond MVP)
*   **Hybrid reading** (toggle between RSVP and standard view) is rare.

---

## 6. What We Built (P0 Done)

| Feature | Why It Matters (Cognitive Basis) |
|:---|:---|
| **Pixel-Stable Focal Centering** | Trust anchor. If it moves, users feel physical discomfort. Prerequisite for *any* meaningful speed increase. |
| **Guide Frame** | Gives the eye a stable "home," reducing visual search and lowering perceived motion. |
| **WPM Control (100-1000)** | Lets readers find a sustainable pace. Prevents "1000 WPM" burnout. |
| **Play/Pause, Skip ±10** | Gives agency. Users don't want to feel like they're "watching words flash." |
| **Punctuation-Aware Timing** | Restores sentence rhythm so the brain can assemble meaning. 3x for `.!?`, 2x for `,`. |
| **Paragraph-Aware Timing** | 5x pause on `\n\n` to signal logical breaks and allow encoding. |
| **Paste Text Input** | Minimizes time-to-first-read. Reliable baseline when file parsing fails. |
| **Dark Mode (Default)** | Reduces eye strain; mitigates migraine/comfort concerns. |

---

## 7. MVP Definition (v0)

### 4 Non-Negotiables
1.  **Pixel-stable focal point:** The trust anchor.
2.  **Comprehension-first pacing:** Breaks the "Fast = Shallow" model.
3.  **Instant recovery:** Getting lost must be cheap. Reduces anxiety.
4.  **Text integrity:** No missing or scrambled content.

### MVP Scope (In)
| Feature | Rationale |
|:---|:---|
| **Paste text** | Zero-failure input path. |
| **Drag-and-drop `.txt`** | Fast, local-first, no lock-in. |
| **Best-effort PDF extraction** | Table stakes. Transparent fallback preserves trust. |
| **Complexity-aware pacing** | The MVP wedge. Addresses *why* RSVP fails. |
| **Minimal session memory** | Resume position. Supports interruptible reading. |

### Complexity Signals (v1 Implementation)
*   Long words (8+ chars: +20%, 12+ chars: +50%)
*   Sentence-ending punctuation (`.!?`): 3x delay
*   Commas (`,`): 2x delay
*   Paragraph breaks (`\n\n`): 5x delay
*   **Future:** Numbers/numeric patterns, clause density, acronyms, unknown vocabulary heuristic.

### MVP Scope (Explicitly NOT In)
*   Email integration
*   Social media workflows
*   Browser extension
*   AI summaries / tasks / sharing / library systems
*   EPUB (P1)

---

## 8. Risks & Open Questions

| Risk | Question | Status |
|:---|:---|:---|
| **Unknown-Vocabulary Detection** | What is the simplest offline heuristic that feels accurate? | Open |
| **Micro-Chunking Thresholds** | Always chunk numbers (`$12,450`) or only on high difficulty? | Open |
| **Preview/Context Aids** | Does a faint sentence preview improve comprehension or distract? | Needs Testing |
| **PDF Reality** | How much effort for "good enough"? What fallback preserves trust? | Needs Validation |
| **Bionic Reading** | Would bolding first portion of words compete with the red focal? | Under Consideration |

---

## 9. Next Steps (Research + Product)

1.  **Define a Small Benchmark Set**
    *   20-30 text samples: prose, dense academic, numeric-heavy, parentheses-heavy, acronym-heavy.
2.  **Lightweight Usability Study (5-7 participants)**
    *   Tasks: Read for gist vs. read for detail, recover from distraction, numeric passage accuracy.
    *   Measures: Perceived comprehension, rewind frequency, fatigue, preference vs. baseline.
3.  **PDF Extraction Validation Pass**
    *   Test with a batch of real-world PDFs and classify failure modes.
4.  **Finalize "Unknown Vocab" Heuristic**
    *   Pick one approach and tune it using the benchmark set.

---

## 10. Longer-Term Product Horizon

These are compelling but explicitly beyond MVP:

| Feature | User Need |
|:---|:---|
| **Books Mode** | Persistent position, chapter boundaries, notes, highlight gallery. |
| **Email Mode** | Triage summaries, thread condensing, quick reply. |
| **Social "Deck Triage"** | Burst reading for Twitter/news feeds. |
| **Work Doc Scanner** | Keyword alerts, compare mode for contracts/legal. |
| **Browser Extension** | Research queue + export. |

---

## 11. Accessibility & Comfort Defaults

*   **Dyslexia:** RSVP can help by reducing crowding. Consider dyslexia-friendly font options.
*   **Photosensitivity:** Avoid harsh high-contrast flashing. Default to soft-contrast (Dark Grey on Off-White for light mode).

---

## 12. Positioning & Messaging

*   **Target Wedge:** Knowledge workers (devs, researchers), graduate students.
*   **Go-To-Market Message:** **"Read to understand, faster."**
*   **Anti-Messages:** Avoid "1000 WPM." Never say "suppress your inner voice."

---

> **Bottom Line:** Ship a rock-solid, comprehension-first, complexity-adaptive reader before expanding to workflows like email, books, or extensions.
