# Reader dial-in

After the 16 parity packages landed, the reading screen got a dedicated feel pass: six auditors checked every reader view against the mined reader feel playbook and the web reference, a skeptical triage dropped anything taste based or touching the approved golden standard, and the survivors were fixed one area at a time with adversarial review and a commit each. All six are committed and pushed on `feat/native-ui-web-parity`. The app version is now 0.7.11.

This work overlaps the reader files that packages 06, 07, 08, 14, and 15 also touched. The dial-in built on top of that work rather than replacing it, and QA confirmed the earlier pack fixes are all still in place.

## What changed, by area

- **Playback engine and scrub physics** (`ada3971`). A flick that lands almost exactly on a word now stops instantly instead of running a dead 260ms ease over no distance. Most noticeable flicking hard into the first or last word of a book. Also re-anchored the fallback scrub density from the old 117 to the pack 07 value 116.
- **Focus reel** (`42387a2`). During a scrub, long neighbor words now flow off the screen edge and clip cleanly, like the web, instead of getting squeezed with an ellipsis next to the focal letter. The at rest and playback rendering you already approved is byte for byte unchanged.
- **Sentence strip** (`ee4ca2d`). Tapping a word on a moving strip now lands on the exact word under your finger, because the hit test and the paint now share one formula. Also pinned the reader text so Android's system font size setting can no longer warp the reader's geometry.
- **Ghost trail** (`423475d`). Ghost word spacing corrected to the web's exact proportion (it was measuring against the wrong font size), so the gap widens from about 13.8px to 16.8px at the default size.
- **Paragraph view** (`21a64a4`). Five fixes: the first word of a new paragraph appears already centered instead of jumping one word late; multi paragraph slide animations can no longer restart mid flight; the overscroll barrier reads your finger every frame instead of every other; swipe direction is judged from touch down like the web; and a blocked advance at the book's edge can no longer leave a stale flag that breaks a later scrubber jump.
- **Reader chrome and immersive** (`d950acd`). The hidden top and bottom chrome bands used to be dead zones; tapping them now peeks the chrome like tapping anywhere else, without firing a hidden control. All chrome fades also declare the system reduce motion setting explicitly.

## What to feel for on the phone (build 0.7.11 or later)

These only prove out on a real device, so they are yours to check. Tick them off as you go.

- [ ] Focus reel: flick it hard into the very first word of a book. It stops crisp, with no dead hang before it settles.
- [ ] Sentence strip: while it is moving, tap a word. It lands on the word that was under your finger, not a neighbor.
- [ ] Paragraph view: fast flick through a few paragraphs. Each one lands with its first word already centered, not centering a beat late.
- [ ] Reader chrome: while a book is playing, tap the very top edge and the very bottom edge of the screen. The chrome peeks both times.
- [ ] Ghost trail: scrub through it. Spacing looks even and the words never overlap.
- [ ] Long words: open a book with a long title word (Frankenstein works) and scrub the Focus reel. The neighbors run off the screen edge cleanly and the focal letter stays dead centered.
