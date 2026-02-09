# Focus Reader: Comprehensive Use Cases
*Reimagining reading for every context*

---

## Philosophy

RSVP is the engine. The experience around it defines the product.

Different content types demand different mental modes:
- **Books**: Linear, completionist, reflective
- **Email**: Triage-focused, action-oriented, interruptible  
- **Social**: Discovery-driven, scan-and-dive, ephemeral
- **Work Docs**: Precision-focused, collaborative, versioned

One interface cannot serve all these. We need **context-aware UX** that adapts to the content type.

---

## 📚 Use Case 1: Books & Long-form

### The Reader's Journey

**Sarah is reading "Thinking, Fast and Slow" on her commute**

#### Entry Point
- Opens Focus Reader → sees "Continue Reading" card showing book cover, current chapter, and "67% complete"
- One tap starts exactly where she left off, mid-sentence from yesterday

#### During Reading
- At 350 WPM, she's in flow state
- Encounters a dense paragraph about System 1 vs System 2 thinking
- **Action**: Taps spacebar to pause, then presses `N` for Note
  - RSVP pauses
  - Last 2 sentences expand above the focal point
  - Note field appears below with cursor ready
  - She types: "Key distinction - automatic vs effortful thinking"
  - Presses Enter → note saved with timestamp + location
  - RSVP resumes seamlessly

**10 minutes later...**
- Reaches end of chapter
- Screen shows: "Chapter 4 complete. Take a break or continue?"
- She selects "3 min break"
  - Screen dims
  - Shows her notes from this chapter (3 highlights)
  - Offers to generate a chapter summary (AI)

#### After Reading Session
- Wants to share an insight with a colleague
- **Action**: Opens "My Library" → "Thinking Fast and Slow" → "Highlights"
  - Sees all 14 notes organized by chapter
  - Selects one about cognitive biases
  - Taps "Share"
  - Generates beautiful card:
    ```
    [Book cover thumbnail]
    "People tend to assess the relative importance of issues 
     by the ease with which they are retrieved from memory..."
    
    — Daniel Kahneman, Thinking Fast and Slow
    Chapter 12, p.187
    ```
  - Exports to clipboard, Twitter, or sends to Readwise/Notion

### Key Features for Books

| Feature | Why It Matters |
|---------|----------------|
| **Persistent Position** | Resume mid-sentence across devices |
| **Chapter Boundaries** | Natural pause points with context recap |
| **Inline Annotation** | Capture thoughts without breaking flow |
| **Highlight Gallery** | Review and export insights |
| **Reading Stats** | Track daily streaks, WPM progress, completion |
| **Pre-session Warmup** | 3-second countdown + last-read context |

### Advanced: Study Mode

**Mark is reading a textbook**
- Enables "Study Mode"
  - After each section, quiz questions appear
  - Must answer correctly to proceed
  - Spaced repetition schedule for review
  - Export flashcards to Anki

---

## 📧 Use Case 2: Email

### The Email Power User

**David has 47 unread emails and 3 newsletter subscriptions he never reads**

#### Morning Ritual: "Focus Inbox"

**8:00 AM - Opens Focus Reader**
- Sees aggregated view:
  ```
  Today's Reading Queue
  ─────────────────────────
  📰 3 Newsletters (22 min)
  📧 12 Work Emails (8 min)
  📬 2 Long Threads (5 min)
  ─────────────────────────
  Total: 35 minutes
  ```

#### Reading Flow

**Starting with newsletters:**
1. **Triage View** first - shows:
   - Morning Brew: "Tech layoffs, Fed interest rates, new AI model"
   - Stratechery: "Apple's Services Strategy"
   - Lenny's Newsletter: "Product prioritization frameworks"

2. **Selective Reading**
   - Marks "Apple's Services Strategy" as "Focus Read"
   - The other two as "Skim Headlines"

3. **RSVP Flow**
   - Opens Stratechery article
   - Before starting: AI summary appears
     > "This 3,200-word article argues Apple is shifting from hardware to recurring revenue. Main points: App Store dominance, iCloud lock-in, services margin expansion."
   - David knows this is worth his time → starts RSVP
   - Halfway through, encounters a complex financial table
   - **Action**: RSVP auto-pauses on non-text content
     - Table displays in full
     - "Next" button appears when he's ready
   - Continues reading

4. **Post-Read Actions**
   - Article ends
   - Prompt: **"What next?"**
     - [ ] Archive
     - [ ] Add to Reading List  
     - [ ] Share
     - [ ] Create Task
   - He chooses "Create Task"
     - Pre-filled: "Research Apple Services revenue trends"
     - Syncs to Todoist via integration

#### Work Email Mode

**Switching to work emails:**
- Different UX paradigm - not completionist

**Email from his boss: Re: Q1 Budget Review (14-email thread)**

1. **Thread Intelligence**
   - Focus Reader doesn't show the entire thread
   - AI extracts: "3 people discussing. Main question: Should we hire 2 contractors or 1 FTE?"
   - Shows only the **new** messages since he last read
   - Highlights action items in red during RSVP

2. **During Reading**
   - Word "URGENT" appears
   - RSVP slows down automatically
   - Keyword appears in red instead of focal color
   - David knows to pay attention

3. **Reply Without Leaving**
   - Email ends with "Let me know your thoughts by EOD"
   - **Action**: Button appears: **[Reply]**
   - Clicks → mic icon activates
   - "I think we should go with one FTE for stability. Happy to discuss."
   - Voice-to-text → email drafted
   - One more click → sent

### Key Features for Email

| Feature | Why It Matters |
|---------|----------------|
| **AI Triage Summary** | Know before you read |
| **Thread Condensing** | Skip quoted replies, see only new content |
| **Action Detection** | Highlight dates, questions, links |
| **Quick Reply** | Voice or quick-text without context switch |
| **Smart Filtering** | Auto-skip signatures, disclaimers, footers |
| **Keyword Alerts** | Slow down or highlight on "budget", "urgent", "deadline" |

---

## 🐦 Use Case 3: Social Media

### The Intentional Scroller

**Emma wants to stay current on tech Twitter without losing 2 hours**

#### The Discord Problem
**She follows 300 accounts. 80% is noise.**

#### Focus Reader's Answer: "Curated Burst"

**Opens Focus Reader Social Mode:**

1. **Feed Selection**
   - Connected accounts: Twitter, Threads, LinkedIn
   - Chooses: "Twitter: Tech" (a custom list of 50 accounts)
   - Time budget: 15 minutes

2. **The Deck Interface**
   - Not a feed. Not RSVP yet.
   - Shows tweet cards (text-only preview)
   - Swipe gestures:
     - **Swipe Left**: Skip
     - **Swipe Right**: Read in RSVP mode
     - **Swipe Up**: Save for later
   - AI sorts by "signal" (engagement from people she interacts with most)

3. **Thread RSVP**
   - She swipes right on a 20-tweet thread about AI regulation
   - **RSVP Mode activates:**
     - Tweets flow continuously (no avatars, no UI chrome)
     - Small visual separator between tweets (fade effect)
     - At the end: "Thread complete. 2 minutes."

4. **Visual Content Handling**
   - A tweet contains a screenshot
   - RSVP pauses
   - Image fills screen for 3 seconds
   - Auto-resumes or she can tap to continue

5. **Engagement Flow**
   - After reading a great insight, she wants to save it
   - **Action**: During RSVP, presses `B` for Bookmark
   - Tweet saved to "Reading Highlights" collection
   - Can export later to Notion or share

6. **Session Complete**
   - 15 minutes up
   - Summary screen:
     ```
     Today's Focus Session
     ─────────────────────
     ✓ Read 47 tweets across 8 threads
     ✓ Saved 3 bookmarks
     ✓ Skipped 120 low-signal posts
     
     Time saved vs traditional scroll: ~45 minutes
     ```

### Key Features for Social

| Feature | Why It Matters |
|---------|----------------|
| **Deck Triage** | Choose what to read before committing |
| **Continuous Thread Flow** | No UI chrome between related posts |
| **Visual Pause** | Handle images/videos without breaking rhythm |
| **Time-box Sessions** | Prevent infinite scroll |
| **Signal Sorting** | AI learns what you care about |
| **Engagement Shortcuts** | Bookmark, share, reply without leaving |

---

## 📄 Use Case 4: Work Documents & PDFs

### The Precision Reader

**Jessica needs to review a 40-page legal contract**

#### The Challenge
- Can't skim - might miss critical clauses
- Can't read slowly - deadline in 2 hours
- Needs to spot differences from last version

#### Document Mode

1. **Upload & Scan**
   - Drags PDF into Focus Reader
   - AI scans document structure:
     - 12 sections
     - 3 exhibits
     - Standard legal boilerplate detected

2. **Scanning Mode**
   - Instead of reading every word, she enables "Keyword Scan"
   - Defines keywords: "liability", "termination", "indemnification", "fee"
   - RSVP runs at 800 WPM
   - **Auto-stops** when keywords appear
   - She reads those paragraphs at 300 WPM
   - Resumes scanning

3. **Compare Mode** (Advanced)
   - Uploads previous version
   - Focus Reader highlights only changed text during RSVP
   - New text appears in blue
   - Deleted text appears as strikethrough for 1 second

4. **Annotation for Review**
   - Section 7.3 looks problematic
   - **Action**: Presses `!` during RSVP
   - Adds flag: "Needs legal review - indemnification scope too broad"
   - Can export annotated PDF with flags as comments

### Key Features for Work Docs

| Feature | Why It Matters |
|---------|----------------|
| **Keyword Scanner** | Stop on important terms automatically |
| **Version Compare** | See only what changed |
| **Hierarchical Navigation** | Jump to sections/chapters |
| **Collaboration Flags** | Team can review same doc with shared notes |
| **Export Annotations** | Highlights → PDF comments or Google Doc suggestions |

---

## 🎧 Use Case 5: Audio Content (Future)

### The Podcast Speedrunner

**Mike wants to "read" a Joe Rogan episode in 10 minutes instead of listening for 3 hours**

1. **Auto-Transcription**
   - Pastes YouTube URL
   - Focus Reader fetches transcript
   - Cleans filler words ("um", "like", "you know")

2. **Speaker Intelligence**
   - Detects speaker changes
   - Shows "Joe:" vs "Guest:" as visual separator during RSVP

3. **Skip the Ads**
   - AI detects sponsorship segments
   - Auto-skips or offers "Skip ad read?" prompt

4. **Topic Navigation**
   - AI generates chapter markers
   - "00:45 - Discussion on AI safety"
   - "01:23 - Personal anecdotes about comedy"
   - Can jump to specific topics

---

## 🌐 Use Case 6: Web Articles via Extension

### The Research Sprint

**Anna is writing a blog post and needs to absorb 10 source articles**

1. **Browser Extension**
   - Reading article in Chrome
   - Highlights a long paragraph
   - Right-click → "Focus Read Selection"
   - Overlay opens with RSVP of just that selection

2. **Full Article Mode**
   - Clicks extension icon
   - "Focus Read This Page"
   - Article parsed (Mercury Reader style)
   - Ads stripped, just content
   - RSVP starts

3. **Research Queue**
   - Opens 10 tabs of articles
   - Extension aggregates them
   - "You have 10 articles queued (estimated 45 min)"
   - Reads all sequentially with source markers

4. **Export Notes**
   - While reading, hits `N` to capture quotes
   - At end: "Export 7 highlights to Notion?"
   - Creates page with sources automatically formatted

---

## Summary: The UX Philosophy

| Content Type | Mental Mode | Key Interaction | Success Metric |
|--------------|-------------|-----------------|----------------|
| **Books** | Completionist | Pause → Annotate → Resume | Finishing books, retaining insights |
| **Email** | Processor | Scan → Decide → Act | Inbox zero in less time |
| **Social** | Curator | Swipe → Burst Read → Save | High signal, low waste |
| **Docs** | Auditor | Scan → Stop on keywords → Flag | Catching critical details |
| **Podcasts** | Speedrunner | Skip ads → Jump topics | 10x time compression |
| **Web** | Researcher | Highlight → Queue → Export | More sources, better notes |

---

## What's Different From "Just RSVP"?

Most speed readers stop at the engine. We're building the **complete consumption workflow**:

- Before: Context setting, triage, warmup
- During: Smart pausing, annotations, keyword detection
- After: Export, share, action, reflect

**The moat isn't speed. It's understanding that reading isn't atomic - it's part of a larger workflow.**

---

## Next Steps

Which mode should we prototype first?
- Book Mode with persistent position + notes?
- Email Mode with forward-to-read?
- Browser extension MVP?
