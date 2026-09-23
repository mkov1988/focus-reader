# Android: the intro tutorial ("Your first read")

Built for the native app (`../Focus Reader Android`), where feature work
lives. The first version shipped in JS 0.9.2. The guided, interactive
version is one commit on branch `claude/onboarding-tutorial-speed-ds1r38`
in the Android repo, on top of `master` at `ef22b49` (JS 0.9.5), and
takes the stamp to **JS 0.9.6**. Typecheck and `npm test` pass, and the
Expo fingerprint is unchanged from master, so it is a JS-only OTA round.

## What it does

- A fresh install (and every existing install, once) meets a **Start here /
  Your first read** card in the Today hero slot. Start opens the intro; Skip
  clears the card. Settings has **Replay the intro**.
- The reader opens **bare**: no header, no controls, just the word. It
  starts reading by itself at 200 words per minute.
- Then it introduces the controls **one at a time**. Each lesson ends on a
  stop: the reel freezes on a prompt word, the screen dims, one control
  fades in, wiggles and wears the focal letter's colour, and nothing moves
  until it is tapped.
  1. **Plus**: "Feeling bold? Give the plus a tap." The speed jumps to 400,
     the pill counting up through each 50.
  2. **Minus**: "Too much for you? No shame." Back down to 300, then the
     payoff: started at 200, now faster than the average adult's 240, "See
     how cool this app is?"
  3. **Play**, after a tea break.
  4. **The arrows**. The forward one hops a deliberately dull sentence.
  5. **The list button**, which opens the scrubber. Drag, let go, pop back.
- After the last stop everything is the reader's: the header returns, every
  control works, and they tuck away while reading like any book.
- The intro never writes the reader's WPM setting, never records progress
  or reading stats, and always runs in the Focus view.

## What to look for on the phone

- Start: only "Hello." on a dark page, reading by itself.
- "tap." freezes, the page dims, and only the speed pill appears with its
  plus wiggling in the focal letter's colour. Tapping it counts 250, 300, 350, 400.
- "minus." freezes with the minus wiggling; tapping it lands on 300 and the
  "faster than average" payoff reads next.
- "play." freezes with the play button wiggling.
- "arrow." freezes; the forward arrow skips straight to "Dodged it."
- "button." freezes; the list button opens the scrubber; dragging and
  letting go lands on "And back we come."
- At the end the header and every control are there, and your own reading
  speed is exactly what it was before.

The script lives in `src/intro.ts`, the stop logic in
`src/reader/useIntroGuide.ts`. `scripts/test-intro.mjs` pins the stop
words, the one-sentence hop, the speeds, the stop rule walked end to end,
and the one-word display rules, and runs as part of `npm test`.
