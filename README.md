# Focus Reader

> **Read to understand, faster.** A cognitive efficiency tool that enables deep focus and high-speed comprehension.

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://github.com/mkov1988/focus-reader)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What is Focus Reader?

Focus Reader uses **RSVP (Rapid Serial Visual Presentation)** to display text one word at a time, with a **pixel-stable red focal letter** that never moves. This eliminates eye movement, reduces fatigue, and enables sustainable reading at 2-3x your normal speed.

**Why it's different:** Most speed-reading apps fail because they prioritize raw WPM over comprehension. Focus Reader is built around **cognitive science**—rhythm, pauses, and recovery—so your brain can actually process what you're reading.

---

## ✨ Features

### Core Reading Engine
- **Pixel-Perfect Focal Centering** — The red focal letter stays absolutely fixed. No jitter, even at 800+ WPM.
- **Smart Pacing** — Automatic pauses at punctuation (3x for sentences, 2x for commas, 5x for paragraphs).
- **Adjustable Speed** — 100 to 1,000 WPM with instant controls.

### Controls & Recovery
- **Keyboard Shortcuts** — `Space` play/pause, `←→` skip ±10 words, `↑↓` adjust speed, `Esc` exit.
- **Progress Bar** — Click anywhere to jump to that point.
- **Never Get Lost** — Strong recovery primitives so distraction doesn't break your flow.

### Input
- **Paste Text** — Just Ctrl+V and go.
- **Drag & Drop** — Drop a `.txt` file to start reading instantly.
- **PDF/EPUB** — Coming soon in v0.2.

### Design
- **Dark Mode by Default** — Reduces eye strain for long sessions.
- **Distraction-Free** — Minimal UI during reading. Just you and the words.

---

## 🚀 Quick Start

```bash
# Clone the repo
git clone https://github.com/mkov1988/focus-reader.git
cd focus-reader

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open **http://localhost:5173** and paste some text to try it out.

---

## 🧠 The Science Behind It

Focus Reader is grounded in cognitive research, not marketing hype.

| Principle | What It Means | How We Apply It |
|:---|:---|:---|
| **Sensory Clearness** | Attention is finite. Competing stimuli reduce comprehension. | Pixel-stable focal point. No animations during reading. |
| **Logical Memory** | Understanding requires time to encode meaning, not just see words. | Smart pauses at sentence/paragraph breaks. |
| **The "No Exceptions" Rule** | Habits form through consistency, not intensity. | Low friction design. < 10 seconds to start reading. |

> "One can have a good rote memory without understanding, but one cannot have a good logical memory without understanding." — Pyle (1921)

---

## 📁 Project Structure

```
src/
├── components/
│   ├── Reader/
│   │   ├── RSVPDisplay.tsx    # Core word display with focal centering
│   │   └── Controls.tsx       # Playback controls
│   └── Input/
│       └── TextInput.tsx      # Paste and file upload
├── hooks/
│   └── useRSVP.ts             # Timing engine (requestAnimationFrame)
├── utils/
│   └── textProcessing.ts      # Focal point algorithm, tokenization
└── App.tsx                    # Main orchestrator

docs/
├── research-report.md         # Full research synthesis (12 sections)
├── PRD.md                     # Product requirements
├── use-cases.md               # User journey mappings
└── CHANGELOG.md               # Version history
```

---

## 🗺️ Roadmap

| Version | Status | Features |
|:---|:---|:---|
| **v0.1.0** | ✅ Done | Core RSVP engine, focal centering, smart pacing, paste/txt input |
| **v0.1.1** | ✅ Done | Research framework, paragraph pauses, cognitive efficiency positioning |
| **v0.2.0** | 🔜 Next | PDF/EPUB support, session memory, settings modal |
| **v0.3.0** | Planned | Browser extension, URL-to-article extraction |
| **v1.0.0** | Planned | Book mode, email integration, library system |

---

## 🤝 Contributing

Contributions are welcome! Please read the research report first to understand the design philosophy:
- [Research Readout](docs/research-report.md) — Why we built it this way
- [PRD](docs/PRD.md) — What we're building and why

---

## 📜 License

MIT © 2026 Michael Kovalev

---

**Built with ❤️ and lots of iteration.**
