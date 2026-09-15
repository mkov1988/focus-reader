# Android: the intro tutorial ("Your first read")

Handoff for a feature built for the native app (`../Focus Reader Android`)
from a session that could only push to this repo. The complete change is
[android-intro-tutorial.patch](android-intro-tutorial.patch), one commit
on top of the Android repo's `master` at `e439cf6` (v0.9.0 / JS 0.9.1).

Apply it from the Android checkout:

```bash
git checkout -b claude/onboarding-tutorial-speed master
git am "../Focus Reader/docs/planning/android-intro-tutorial.patch"
npm run typecheck && npm test
```

Both pass on the patched tree. The Expo fingerprint is unchanged from
master (measured with `npx @expo/fingerprint fingerprint:generate
--platform android`), so this is a JS-only OTA round: `src/version.ts`
goes to 0.9.2 and `app.json` is untouched.

## What it does

- A fresh install (and every existing install, once) meets a **Start here /
  Your first read** card in the Today hero slot, where the resume card
  normally sits. Start opens the reader on a bundled tutorial text; Skip
  clears the card. Settings gains **Replay the intro**.
- The tutorial plays by itself, one word at a time, starting at **200 words
  per minute** and ramping to **300 over about 32 seconds**. The copy is
  about exactly that: you started at 200, you are now at 300, the average
  adult reads about 240, see how cool this app is.
- The controls stay on screen through the ramp so the speed pill's number
  is seen climbing (stepper dimmed). On the first word of the last beat the
  controls tuck themselves away and the stepper lights up, and the text
  says so as it happens, then teaches the gestures and sends the reader to
  the shelf. Whole thing: about 87 seconds.
- The ramp is defined in word space (each beat names its start and end
  speed; linear per word), so pausing or scrubbing never desyncs the copy.
  It rides the reel engine's existing pacing override (the narration
  mechanism); the frame worklet is untouched. The intro never writes the
  reader's WPM setting, never records progress or session stats, and
  always runs in the Focus view without changing the saved mode.

## What to look for on the phone

- Today opens on the Start here card with the sage "Your first read" cover.
- Start: the reader opens on "Hello," and begins reading on its own after a
  beat, with the pill reading 200 WPM and its minus/plus dimmed.
- The pace creeps up; "And there it is" lands with the pill on 300.
- At "There go the controls" the chrome fades and the stepper is live at 300.
- Back on Today the hero shows Today's pick; Library has no intro row.
- Settings → Replay the intro puts the card back.
- Your own reading speed is exactly what it was before.

The script lives in `src/intro.ts`; `scripts/test-intro.mjs` pins the
word-space curve to the real tokenizer, the ramp timing (25-40 s), and the
one-word display rules, and runs as part of `npm test`.
