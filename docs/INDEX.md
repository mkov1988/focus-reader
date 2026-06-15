# Documentation Index

*Navigate Focus Reader's documentation*

---

## 📋 Core Documents

### [CHANGELOG.md](../CHANGELOG.md)
Complete version history, feature additions, design iterations, and technical decisions.
- Current version: **v0.1.1** (Cognitive Science Deep-Dive)
- Previous: **v0.1.0** (MVP with core RSVP engine)
- Planned: **v0.2.0** (Book Mode, Email integration, PDF/EPUB support)

### [README.md](../README.md)
Project overview, quick start guide, and installation instructions.

---

## 📖 Planning & Strategy

### [PRD.md](planning/PRD.md) - Product Requirements Document
**Purpose**: Define product vision, target users, and feature roadmap

**Key Sections**:
- Vision: "Cognitive Efficiency" through brain-aligned reading mechanics
- Core UX Principles (Focal Point is Sacred, Rhythm > Raw Speed)
- Persona Deep-Dives (Skeptic, Content Crusher, Savorer)
- Feature prioritization based on Comprehension Checkpoints
- Success metrics
- Competitive analysis

**Use when**: Making product decisions, prioritizing features, understanding "why"

---

### [use-cases.md](planning/use-cases.md) - Comprehensive Use Cases
**Purpose**: Explore UX workflows for different content types

**Key Sections**:
- 📚 **Books Mode**: Sarah reading with annotations and persistent position
- 📧 **Email Mode**: David's "Focus Inbox" with triage and quick replies
- 🐦 **Social Mode**: Emma's time-boxed Twitter deck interface
- 📄 **Work Docs Mode**: Jessica scanning contracts with keyword stops
- 🎧 **Podcast Mode**: Mike's transcript speedrun
- 🌐 **Browser Extension**: Anna's research queue workflow

**Philosophy**: *The moat isn't speed - it's understanding that reading isn't atomic*

**Use when**: Designing new features, understanding user journeys, scoping future work

---

### [brainstorm-input-sources.md](planning/brainstorm-input-sources.md) - Input Strategy
**Purpose**: Explore how Focus Reader becomes the universal reading interface

**Key Ideas**:
- The moat is in the ingest
- Social media as anti-doomscroll tool
- Email deep-dive: "Focus Inbox" concept
- Browser extension as fastest path to "read anything"
- Revenue model (Free = paste, Pro = integrations)

**Key Insight**: Speed reading tech is commoditized. Input pipeline is the differentiator.

**Use when**: Planning integrations, exploring new content sources, pitching the product

---

### [book_access_strategy.md](planning/book_access_strategy.md) - Book & Cover Access
**Purpose**: How we reach Project Gutenberg content and cover images without building runtime web infrastructure

**Key Points**:
- Native first "download once, read offline" model; the Vite proxy only simulates it locally
- Cover images are mirrored to a static host (`npm run mirror:covers` + `VITE_COVER_BASE`), not hotlinked at paint time
- Layered resilience: hosted covers, local cache, generated cover fallback in `BookCover`

**Use when**: Working on book downloads, cover images, offline storage, or the native port

---

## 🔬 Research & Insights

### [research-report.md](research/research-report.md) - The Cognitive Science of Reading
**Purpose**: The 8-point UX framework for Focus Reader

**Key Insights**:
- **Sensory Clearness**: Definition of total focus
- **Logical vs. Rote Memory**: Why speed reading apps fail retention
- **Habit Formation**: The "No Exception" rule for reading habits
- **Persona Context**: Detailed needs of students vs. professionals

### [research-extraction.md](research/research-extraction.md) - Extracted Evidence
**Purpose**: 5,000+ line repository of filtered evidence from 176k words of raw data.

### [user-research-raw.md](research/user-research-raw.md) - The Raw Corpus
**Purpose**: Primary research source (Scott Young, Pyle, US Patents, Reddit, Hacker News).

---

## 🛠️ Technical

### [implementation_plan.md](technical/implementation_plan.md) - Technical Architecture
**Purpose**: Technical specifications and build plan

**Key Sections**:
- Tech stack (React + Vite + TypeScript)
- File structure
- Perfect focal alignment logic (CSS and JS approaches)
- RSVP engine implementation (`requestAnimationFrame`)
- Punctuation-aware pausing algorithm

**Current State**: Matches actual implementation (100-1000 WPM, 3x/2x punctuation delays)

**Use when**: Implementing new features, understanding technical decisions, onboarding developers

---

## 📐 Document Consistency

All documents updated **2026-02-08** to reflect Cognitive Science pivot:

| Spec | implementation_plan.md | PRD.md | use-cases.md | Actual Code |
|------|----------------------|--------|--------------|-------------|
| **WPM Range** | 100-1000 ✅ | 100-1000 ✅ | Variable ✅ | 100-1000 ✅ |
| **Sentence Pause** | 3x ✅ | 3x ✅ | 3x ✅ | 3x ✅ |
| **Comma Pause** | 2x ✅ | 2x ✅ | 2x ✅ | 2x ✅ |
| **Focal Centering** | translateX ✅ | Described ✅ | Described ✅ | translateX ✅ |
| **Dark Mode** | Planned ✅ | Done ✅ | Implied ✅ | Default ✅ |

---

## 🎯 Quick Reference

**Want to know...**
- Why we built this? → [PRD.md](planning/PRD.md#vision)
- How users will interact? → [use-cases.md](planning/use-cases.md)
- What's been built? → [CHANGELOG.md](../CHANGELOG.md#v010---2026-02-07)
- How the engine works? → [implementation_plan.md](technical/implementation_plan.md#rsvp-engine-usersvp)
- What's next? → [PRD.md](planning/PRD.md#p1--input-expansion)
- Revenue strategy? → [brainstorm-input-sources.md](planning/brainstorm-input-sources.md#revenue-angle)

---

## 🚀 Current State (v0.1.0)

**What Works**:
- ✅ Perfect focal centering with Spritz-style guide frame
- ✅ Smooth RSVP engine (60fps at 800+ WPM)
- ✅ Intelligent punctuation pausing (3x sentences, 2x commas)
- ✅ Full playback controls (play/pause, skip, WPM adjust, seek)
- ✅ Keyboard shortcuts (Space, arrows, Esc)
- ✅ Text paste + drag-and-drop file input
- ✅ Dark mode by default

**What's Next** (v0.2.0):
- 📚 Book Mode with persistent position
- 📱 Responsive Mobile Layout (Web)
- 📄 PDF/EPUB text extraction
- 🌐 Browser extension MVP
- ⚙️ Settings modal

---

## Document Relationships

```
                    Vision & Strategy
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
  planning/PRD.md  planning/use-cases.md  planning/brainstorm.md
   (What & Why)      (User Flows)          (Input Ideas)
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
             technical/implementation_plan.md
                    (How to Build)
                           │
                      CHANGELOG.md
                   (What Was Built)
```

---

Last updated: 2026-02-08
