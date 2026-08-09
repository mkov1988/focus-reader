# Input Sources Brainstorm
*The moat is in the ingest*

---

## The Thesis

Speed reading tech is commoditized. The **input pipeline** is the differentiator. If Focus Reader can drink from *any* content source — social, books, newsletters, work docs — it becomes indispensable.

> "I don't go to Twitter anymore. I just Focus Read my feed every morning."

---

## Content Source Ideas

### 🐦 Social Media

| Source | How It Works | Why It's Compelling |
|--------|--------------|---------------------|
| **Twitter/X** | OAuth → Fetch timeline → RSVP through tweets | Consume your entire feed in 10 min instead of doomscrolling for an hour |
| **Threads** | Similar to Twitter | Same benefit |
| **LinkedIn** | Feed + articles | "Professional development" in 15 min |
| **Reddit** | Subreddit threads, top posts | Deep-dive a subreddit without the rabbit hole |
| **Hacker News** | Front page + comments | Stay current without context-switching |

**Killer insight**: Social is *designed* for slow drip addiction. RSVP is the antidote — consume the info, skip the dopamine trap.

---

### 📚 Books & Long-form

| Source | Integration Method | Notes |
|--------|-------------------|-------|
| **Kindle/Amazon** | Whispercast? Kindle API (limited) | The holy grail — most ebook market share |
| **EPUB sideload** | Direct file upload | Already planned |
| **Apple Books** | No API, manual export only | Tough |
| **Google Play Books** | API exists, complex auth | Possible |
| **Libby/OverDrive** | EPUB export | Library books! |
| **Calibre library** | Local files | Power users |

**Challenge**: DRM. Amazon locks books down hard. May need browser extension approach.

---

### 📰 News & Articles

| Source | Integration | UX Idea |
|--------|-------------|---------|
| **RSS feeds** | User pastes feed URL | "Focus Read my morning news" |
| **Pocket/Instapaper** | OAuth integration | Saved-for-later → actually read |
| **Newsletter backlog** | Gmail integration / forward-to-email | Those 47 unread Substacks |
| **Readwise** | API available | Reader exports |
| **Any URL** | Paste URL → article extraction | Mercury Parser style |

---

### 💼 Work Content

| Source | Integration | Use Case |
|--------|-------------|----------|
| **Slack** | Catch up on channels you've ignored | "Focus Read #engineering from yesterday" |
| **Email inbox** | Newsletter digest mode | Morning email speed-read |
| **Google Docs** | API integration | Review long docs without skimming |
| **Notion** | Export or API | Read your notes back |
| **Confluence** | Nightmare (but possible) | Enterprise play |

---

### 📧 EMAIL DEEP-DIVE — The Killer Input?

Email is broken. The average professional receives **120+ emails/day**. Most are skimmed, misunderstood, or ignored entirely.

**What if you could Focus Read your inbox?**

#### Use Cases

| Scenario | Pain Today | Focus Reader Solution |
|----------|-----------|----------------------|
| **Newsletter backlog** | 47 unread Substacks collecting dust | RSVP through all of them in 30 min |
| **Long email threads** | Scroll, scroll, lose context, scroll | Linear word-by-word, full context |
| **TL;DR work emails** | Skip to bottom, miss critical details | Actually absorb the whole thing |
| **Catching up after PTO** | 500 emails, panic, declare bankruptcy | Queue → Speed-read → Done |
| **Legal/contract emails** | Dense, important, boring | Forced attention, can't skip |

#### Integration Options

| Method | Complexity | UX |
|--------|-----------|-----|
| **Forward-to-read** | Low | User forwards email to `read@focusreader.app` → appears in queue |
| **Gmail extension** | Medium | "Focus Read" button in Gmail UI |
| **Gmail API full sync** | High | Connect inbox, AI picks what matters |
| **Apple Mail plugin** | High | Native macOS integration |
| **Outlook Add-in** | Medium | Enterprise market |

#### The "Focus Inbox" Concept

```
📥 Your Focus Inbox

┌──────────────────────────────────────────────────────┐
│  Today's Reading                       ⏱️ 22 min     │
├──────────────────────────────────────────────────────┤
│  📰 Morning Brew                        3 min        │
│  📰 Stratechery Daily Update            8 min        │
│  📧 Q4 Planning Thread (14 messages)    5 min        │
│  📧 Legal: Contract Amendment           4 min        │
│  📧 Newsletter: Lenny's Newsletter      2 min        │
├──────────────────────────────────────────────────────┤
│  [▶️ Start Session]                                  │
└──────────────────────────────────────────────────────┘
```

#### Why This Could Be Huge

1. **Everyone has email** — Universal pain point
2. **Newsletters are underread** — People subscribe, then ignore
3. **Work email is liability** — Missing details = mistakes
4. **Habit opportunity** — "Morning Focus Read" becomes ritual
5. **Premium conversion path** — Free = paste, Pro = email sync

#### Revenue Angle

```
Free:     Paste email text manually
Pro ($9): Forward-to-read inbox
Team($15): Gmail/Outlook sync + shared digests
```

#### Technical Considerations

- **Gmail API**: OAuth, must handle token refresh, rate limits
- **Email parsing**: HTML → clean text extraction (tricky with signatures, threads)
- **Thread handling**: Collapse quoted replies, show only new content
- **Privacy**: End-to-end encryption? Or trust model like Superhuman?
- **Spam filtering**: Don't let junk into the queue

---

### 🎓 Learning & Reference

| Source | Integration | Notes |
|--------|-------------|-------|
| **YouTube transcripts** | Auto-captions API | Watch videos in 5 min |
| **Podcast transcripts** | Whisper or existing | Listen at 10x |
| **Wikipedia** | API | Research sprints |
| **Arxiv papers** | PDF extraction | Academic speed-read |
| **Course material** | Coursera, edX transcripts | Study faster |

---

## Platform Plays

### Browser Extension (Short-term Win)
1. User highlights text on any webpage
2. Click "Focus Read" → opens overlay
3. Text flows through RSVP display
4. Works *everywhere*

**This is probably the MVP for input expansion.**

### Desktop App (Medium-term)
- Global hotkey: Cmd+Shift+F → paste anything → read
- Menubar quick-access
- File watcher for specific folders (e.g., Downloads)

### Mobile PWA (High Impact)
- Share sheet integration: Share → Focus Reader
- Offline queue
- "Morning focus session" (queued content)

---

## The "Feed" Concept

Instead of one-off inputs, what if Focus Reader maintained a **reading queue**?

```
Your Focus Queue (23 items, ~45 min)
├── 8 Twitter highlights (AI-curated)
├── 3 saved articles (Pocket)
├── 2 newsletter issues (Substack)
├── 1 book chapter (Kindle)
└── 9 Reddit threads (r/programming)
```

One button: **"Start Session"** — flows through everything with natural breaks.

---

## Wild Ideas

1. **"Focus Inbox"** — Email address you forward things to. They appear in your queue.

2. **AI-curated daily digest** — Connect sources, AI picks the important bits.

3. **Voice control** — "Hey Focus, read me the top of Hacker News"

4. **Speed dial for content** — Shortcuts: "1" = Twitter, "2" = Pocket, "3" = Kindle

5. **Collaborative reading** — Sync position with a friend, discuss after

6. **Spaced repetition mode** — Re-surface important content at intervals

7. **"Focus Feed" subscription** — We curate content for you (newsletter of newsletters)

---

## Competitive Analysis on Input

| Competitor | Input Sources | Weakness |
|------------|--------------|----------|
| Spritz SDK | Embedded only | No standalone, B2B focus |
| Spreeder | Paste text, upload file | No integrations |
| SwiftRead | Chrome extension (highlight) | Extension-only, no mobile |
| Reedy | Local files, clipboard | Android only, no cloud |
| Bionic Reading | PDF/EPUB conversion | No speed reading, just formatting |

**Gap**: Nobody owns the **connected reading experience** across all sources.

---

## Prioritization Thoughts

| Quick wins (weeks) | Medium lift (months) | Long game (quarters) |
|-------------------|---------------------|---------------------|
| URL → article extraction | RSS feeds | Twitter OAuth |
| Browser extension MVP | Pocket/Instapaper | Kindle workaround |
| Drag-drop file improvement | Gmail newsletters | Slack integration |
| Clipboard global hotkey | Reading queue | AI curation |

---

## Open Questions

1. **Auth fatigue** — How many OAuth flows before users give up?
2. **Rate limits** — Twitter API is expensive now. Workarounds?
3. **Content licensing** — Kindle ToS probably forbids this. Risk tolerance?
4. **Mobile share sheet** — Can PWAs receive share intents on iOS?
5. **Premium model** — Free = paste text, Pro = integrations?

---

## Next Brainstorm: The Chrome Extension

This feels like the fastest path to "read anything." Scope it out?
