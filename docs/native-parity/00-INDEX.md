# Native Parity Tracker

A full audit of the native Android app against the web app ran on 2026-07-13. Thirteen auditors combed both codebases surface by surface, a second pass re-verified every claim against the code, and the confirmed differences were grouped into 16 work packages. Every one is now built and committed, so each page below is a record of what shipped, followed by a short checklist of what to confirm on your phone.

**Status: COMPLETE, plus a reader feel dial-in and a QA pass on top.** All 16 packages were implemented the same day, in two sequential background runs, one commit per package on `feat/native-ui-web-parity` in the native repo. Every package passed an adversarial review on the first try, with zero fix rounds. Since then, a dedicated reader dial-in added six more commits and an independent QA pass verified the whole thing. The app version is now 0.7.11, and everything is committed and pushed to both GitHub repos. See [Beyond the 16 packages](#beyond-the-16-packages) below.

**The audit numbers:** 188 differences confirmed, 68 were duplicate reports of the same underlying issue, leaving 120 unique fixes. All 120 are implemented except two drawer swipe details in pack 05 that the prompt itself marked optional.

## Results

| # | File | What it fixed | Issues | Commit |
|---|------|---------------|--------|--------|
| 01 | [01-typography-and-type-metrics.md](01-typography-and-type-metrics.md) | Inter italic faces, letter spacing, line heights, header alignment | 9 | `ddfed5b` |
| 02 | [02-data-services-parity.md](02-data-services-parity.md) | Catalog title cleanup, cover URL threading, fetch and error semantics, hydration gate | 6 | `1546115` |
| 03 | [03-shared-cover-save-toast.md](03-shared-cover-save-toast.md) | BookCover details, save ribbon, skeletons, toast exit | 9 | `30a2cd4` |
| 04 | [04-book-pickup-and-instant-open.md](04-book-pickup-and-instant-open.md) | Hold to open thresholds, touch slop, open origins, slot hiding | 9 | `abf2cff` |
| 05 | [05-navigation-and-drawer-model.md](05-navigation-and-drawer-model.md) | Hardware back, drawer behavior, stack resets, transitions | 11 | `5de8738` |
| 06 | [06-reel-engine-playback-core.md](06-reel-engine-playback-core.md) | Seek freezing playback, stuck drag flag, final word dwell, WPM reset, reduce motion | 6 | `0bfbcde` |
| 07 | [07-reader-gesture-zoning.md](07-reader-gesture-zoning.md) | Band scoped scrub vs stage wide race, tap and skip zones, swipe down exit | 10 | `90e77e1` |
| 08 | [08-display-text-measurement.md](08-display-text-measurement.md) | Real text measurement, focal pinning, strip widths, centering | 8 | `8e27908` |
| 09 | [09-open-transition-internals.md](09-open-transition-internals.md) | Close motion, error card, spinner, faux text, phase skips | 10 | `61d1926` |
| 10 | [10-reading-progress-and-sessions.md](10-reading-progress-and-sessions.md) | Save triggers, restart position, session accounting | 5 | `295bbb7` |
| 11 | [11-shelf-snap-and-virtualization.md](11-shelf-snap-and-virtualization.md) | Shelf snapping, list virtualization, grid spacing | 5 | `ef4bf3e` |
| 12 | [12-app-shell-branding-washes.md](12-app-shell-branding-washes.md) | App icon and splash, page washes, shell padding, theme cross fade | 6 | `d34a4d3` |
| 13 | [13-press-feedback-micromotion.md](13-press-feedback-micromotion.md) | Press scale feedback everywhere, header collapse, search pill polish | 11 | `07605cf` |
| 14 | [14-paragraph-mode-polish.md](14-paragraph-mode-polish.md) | Active word scale, slide in easing, highlight pill, word gap | 5 | `269e27b` |
| 15 | [15-reader-chrome-polish.md](15-reader-chrome-polish.md) | Play glyphs, pill animation, fill easing, chrome typography | 6 | `8a14767` |
| 16 | [16-accessibility-parity.md](16-accessibility-parity.md) | TalkBack roles, labels, selected states, live region toast | 4 | `d82603b` |

Each page opens with its done status and commit hash, records what changed issue by issue, and ends with a short on-device checklist you can tick off as you test on your phone. Your checkmarks are saved in this browser.

## Beyond the 16 packages

After the packages landed, three more workstreams followed, all committed and pushed. They are in the sidebar too.

- **[Reader dial-in](17-reader-dial-in.md)** — six more commits tuning the reading screen feel against the mined playbook: crisp flick stops, catch tap accuracy, paragraph centering, chrome peek zones, and more. It carries a checklist of what to feel for on the phone. This is what took the version to 0.7.11.
- **[QA and verification](18-qa-and-verification.md)** — an independent pass that re-checked every claim against the code. Verdict: safe to ship. It grep verified every constant in the playbook against live code and found the shipping code clean; the handful of findings were documentation corrections, now made.
- **[Reader feel playbook](reader-feel-playbook.md)** — the settled record of how the reader must feel, mined from fifteen device tuning sessions plus git history. This is the reference spec for any future reader work, and it is the "Reference" entry at the bottom of the sidebar.

The next step is a real installable APK, so the feel can be judged on a phone instead of through Expo Go's development overhead.

## Deliberate divergences from the web

Three places where the implementation intentionally does not copy the web pixel for pixel, each documented in a code comment at the site. Michael can overrule any of them:

1. **Cover inks stay pinned (pack 03, Michael's decision).** The web's theme derived label cover inks go nearly invisible in dark mode. Native keeps warm pinned inks, and the web `BookCover.tsx` was updated the same day to adopt the identical pinning, so both apps now match on the readable behavior.
2. **A controls seek beats a coasting fling (pack 06).** On the web, a fling in progress swallows an explicit skip press, which was judged accidental. Native honors the press immediately.
3. **Reader fades use Tailwind's real ease out curve (pack 15).** The audit spec named the CSS keyword value, but the web actually ships Tailwind's `cubic-bezier(0, 0, 0.2, 1)`. Native matches what the web really renders.

Also of note: Sentence view has no swipe down exit anywhere because the web has none (pack 07). Flagged in case it should exist on both.

## What this folder is now

The prompts remain useful as the reference spec for what exact parity means on each surface: every constant, timing, and copy string was verified against the web source. If a future regression appears on some surface, re running that single package's prompt in a fresh session is a targeted way to restore parity. The audit method (13 surface auditors, skeptical verification, planner, per package prompts) is repeatable if the web app grows new features that need porting.
