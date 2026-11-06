# Narration waves: the remaining top-100 shelf

Generated from the CORE_STORY ledger in `scripts/build-modernity-queue.mjs` minus the books already in
`public/narration-v1.json`, sized by `scripts/narration/plan.mjs` exactly as the `Narration batch` prepare job sizes them
(60k span words per shard, 3 voices). Waves are packed so a run never holds more than ~90 artifacts (see Rails).

## How to run (no Claude needed)

1. GitHub -> Actions -> **Narration batch** -> Run workflow on `master` -> paste one wave's id line below. Leave the other inputs empty.
2. Wait for it to finish (roughly the hours listed). It commits the manifest to master itself and uploads audio to R2.
3. GitHub -> Actions -> **Deploy Pages** -> Run workflow on `master`, preview = false. The books go live for installed apps.
4. Next wave. **Never start a wave while another is running or pending.** The collect job merges into the manifest it checked out at trigger time; a queued run would rebase onto a stale manifest.
5. A wave that fails part way still ships every book that verified. Put the missing ids into a small follow-up wave (see Wave 1b). `resume_from_run` does NOT help when the cause is the artifact cap below, because the source run's artifacts are what get listed.
6. After each deploy, check `https://focus-reader-48z.pages.dev/narration-v1.json` lists the wave's ids and one `audio/<id>/marlowe/timing-v1.json` returns 200.

## Rails the workflow does not enforce for you

- **~3 minutes after triggering**, open the `plan, gate, size shards` job log. It must say `gated/excluded: none` and the expected `jobs: N synth`. A transient text-fetch failure is reported as an exclusion and silently drops the book from the wave.
- **Artifact cap: lifted on the branch.** `scripts/narration/ci/fetch-artifacts.sh` lists a run's artifacts with pagination and downloads them by id, so finish and collect see every artifact. On master the old cap still applies: the finish job's download step saw only the newest 100 artifacts, which lost three books in Campaign 1 wave 1 and seven in run 32827119346. Waves packed to ~90 artifacts stay safe either way.
- **One failed synth shard: on the branch, only its own book x voice fails** (finish now also runs when synth reports failure; the pair stops at `unit N not synthesized yet`). On master a single failed shard still skips the whole finish stage; recover with `rerun_failed_jobs` on that run id for a runner shutdown, or `resume_from_run` for anything else.
- **Manifest after audio.** On the branch the collect job uploads to R2 first and commits the manifest only after the bucket read-back passes, and it commits onto a fresh `origin/master` by cherry-pick, so a run from any ref lands exactly one two-file commit and a stale checkout can no longer rebase badly. On master the manifest is still committed before the upload: confirm the `R2 audio/: N objects` notice (or that `audio/<id>/marlowe/timing-v1.json` answers 200) before deploying.
- **Re-running a book that is already in the manifest is safe.** `verify.mjs` fails any pair whose fresh output disagrees with the committed manifest entry, and the R2 upload skips existing objects, so only the missing voices get added.
- **A synth shard lost to a runner shutdown is the one case for `rerun_failed_jobs`.** GitHub sometimes kills a runner mid-job (`The runner has received a shutdown signal`); the shard fails through no fault of the input, and because the finish stage only accepts `needs.synth.result == 'success'`, the whole wave's finish is skipped. Wait for the run to complete, then re-run only the failed jobs on that same run id: GitHub re-runs the dead shard and the skipped finish/collect jobs, and the finish step's artifact download (`run-id: github.run_id`) still sees attempt 1's shards. That saves the other 56 shards and needs no fix-up wave. Prefer this over `resume_from_run`, which would skip synth entirely and leave the dead shard's book partial.
- **Readable-bounds guard.** `plan.mjs` now refuses a book whose span opens on a numbered heading other than the first (short heading paragraph only), starts more than 12% into the file, or ends before 85% (`excluded.json` reason `readable-bounds`; `--no-bounds-guard` skips it). Books already in the manifest are exempt so fix-up runs are never blocked. Verified: all 95 shipped books pass, the 10 known-bad books are refused, spans unchanged.
- **Auto-chaining.** Pass `next_waves` (id lines separated by `;`). After a wave's collect succeeds, the `chain` job dispatches Deploy Pages on master and the next wave on the same ref. The chain stops at the first failed wave.
- kokoro and torch are installed unpinned in every synth job. A release that changes tokenization mid-campaign fails a whole wave at alignment. Recovery is `resume_from_run` after pinning; accepted risk.

## Gated out by the leftover gate (legally load bearing, do not force)

- 4200 The Diary of Samuel Pepys, Complete: 8 `ETEXT` hits
- 68283 The call of Cthulhu: 1 `etext` hit

## Held back: wrong readable bounds (fix chapter detection first, then narrate)

Fixed on the branch 2026-11-06, see "Chapter detector fix" under Campaign 2 for what changed and the order of operations (Android app first).

`calculateReadableBounds` in `src/utils/textProcessing.ts` takes the first non-front-matter chapter the detector found. In books whose
chapter numbering restarts per part, the detector keeps a late run of chapters, so the reader (and therefore the narration) starts
deep inside the book. Narrating these now would bake the wrong start into three voices. Same detector lives in the Android port.

- 98 A Tale of Two Cities: starts at 46% (Book 2, Chapter XVI)
- 245 Life on the Mississippi: ends at 62% (chapters 41-60 cut off)
- 1399 Anna Karenina: starts at 28% (Chapter 34 of a later part)
- 2600 War and Peace: starts at 66% (Book 15, Chapter XXXV)
- 4300 Ulysses: starts at 41%, mid-sentence
- 6400 The Lives of the Twelve Caesars, Complete: starts at 19% (section LXX of one Caesar)
- 8800 The divine comedy: starts at 33% (Inferno Canto XXXIV)

- 16328 Beowulf: not a bounds problem. Every voice failed `finish.mjs` at the alignment rail (`alignment stream mismatch at char 1`, the voice model's text stream is a different passage than the reader's unit). Needs a look at how synth.py orders or splits this book's units (glossed verse with `{...}` summaries and `* * * * *` breaks). Wave 2, run 34805656187.

Known wart, not held back: some books open by narrating their table of contents (120, 164, 1232, 20203, 25344, 421) because the
reader's readable span starts there too. Consistent with what the app shows.

## Wave 1 (ran 2026-09-13, run 34752619371): 15 books, 105 synth jobs

```
394,768,6593,174,3296,74,844,1727,3268,2465,2542,120,2591,6133,21839
```

40 of 45 pairs verified. Lost to the artifact cap: 394 (all voices), 768/marlowe, 6593/marlowe. Recovered by Wave 1b.

## Wave 1b (fix-up): 3 books, 30 synth jobs, 39 artifacts, ~5 h

```
394,768,6593
```

Re-synthesizes all three voices; the four pairs already in the manifest are rejected by verify (or match) and only the missing five are added.

| id | title | span words | shards | jobs |
|---|---|---:|---:|---:|
| 394 | Cranford | 70,676 | 2 | 6 |
| 768 | Wuthering Heights | 115,940 | 2 | 6 |
| 6593 | History of Tom Jones, a Foundling | 345,347 | 6 | 18 |

## Wave 2: 11 books, 48 synth jobs, 81 artifacts, 747,468 words, ~7 h

```
1998,52190,244,46976,55,2852,1695,20203,75201,1232,16328
```

| id | title | span words | shards | jobs |
|---|---|---:|---:|---:|
| 1998 | Thus Spake Zarathustra: A Book for All and None | 110,546 | 2 | 6 |
| 52190 | Ecce Homo: Complete Works, Volume Seventeen | 46,898 | 1 | 3 |
| 244 | A Study in Scarlet | 41,320 | 1 | 3 |
| 46976 | The Anabasis of Alexander : $b or, The history of the wars a | 143,212 | 3 | 9 |
| 55 | The Wonderful Wizard of Oz | 39,461 | 1 | 3 |
| 2852 | The Hound of the Baskervilles | 59,112 | 1 | 3 |
| 1695 | The Man Who Was Thursday: A Nightmare | 57,380 | 1 | 3 |
| 20203 | Autobiography of Benjamin Franklin | 72,060 | 2 | 6 |
| 75201 | A farewell to arms | 88,603 | 2 | 6 |
| 1232 | The Prince | 49,706 | 1 | 3 |
| 16328 | Beowulf: An Anglo-Saxon Epic Poem | 39,170 | 1 | 3 |

## Wave 3: 10 books, 57 synth jobs, 87 artifacts, 871,503 words, ~8 h

```
1400,36462,1080,23,86,3207,209,829,5200,16
```

| id | title | span words | shards | jobs |
|---|---|---:|---:|---:|
| 1400 | Great Expectations | 184,350 | 4 | 12 |
| 36462 | King Arthur and the Knights of the Round Table | 98,548 | 2 | 6 |
| 1080 | A Modest Proposal: For preventing the children of poor peopl | 3,420 | 1 | 3 |
| 23 | Narrative of the Life of Frederick Douglass, an American Sla | 40,638 | 1 | 3 |
| 86 | A Connecticut Yankee in King Arthur's Court | 117,797 | 2 | 6 |
| 3207 | Leviathan | 212,384 | 4 | 12 |
| 209 | The Turn of the Screw | 42,277 | 1 | 3 |
| 829 | Gulliver's Travels into Several Remote Nations of the World | 103,042 | 2 | 6 |
| 5200 | Metamorphosis | 21,935 | 1 | 3 |
| 16 | Peter Pan : $b [Peter and Wendy] | 47,112 | 1 | 3 |

## Wave 4: 9 books, 45 synth jobs, 72 artifacts, 620,579 words, ~7 h

```
205,18857,36034,1952,103,27673,1837,2527,45
```

| id | title | span words | shards | jobs |
|---|---|---:|---:|---:|
| 205 | Walden, and On The Duty Of Civil Disobedience | 115,813 | 2 | 6 |
| 18857 | A Journey to the Centre of the Earth | 85,457 | 2 | 6 |
| 36034 | White nights, and other stories | 118,652 | 2 | 6 |
| 1952 | The Yellow Wallpaper | 6,085 | 1 | 3 |
| 103 | Around the World in Eighty Days | 62,760 | 2 | 6 |
| 27673 | Oedipus King of Thebes: Translated into English Rhyming Vers | 18,260 | 1 | 3 |
| 1837 | The Prince and the Pauper | 68,847 | 2 | 6 |
| 2527 | The Sorrows of Young Werther | 42,480 | 1 | 3 |
| 45 | Anne of Green Gables | 102,225 | 2 | 6 |

## Wave 5: 7 books, 57 synth jobs, 78 artifacts, 929,395 words, ~8 h

```
135,14244,69087,863,1514,10148,175
```

| id | title | span words | shards | jobs |
|---|---|---:|---:|---:|
| 135 | Les Misérables | 562,839 | 10 | 30 |
| 14244 | The Romance of Tristan and Iseult | 25,806 | 1 | 3 |
| 69087 | The murder of Roger Ackroyd | 70,526 | 2 | 6 |
| 863 | The Mysterious Affair at Styles | 56,456 | 1 | 3 |
| 1514 | A Midsummer Night's Dream | 17,284 | 1 | 3 |
| 10148 | The Merry Adventures of Robin Hood | 111,113 | 2 | 6 |
| 175 | The Phantom of the Opera | 85,371 | 2 | 6 |

## Wave 6: 7 books, 66 synth jobs, 87 artifacts, 1,110,262 words, ~10 h

```
583,164,25344,5921,204,46,766
```

| id | title | span words | shards | jobs |
|---|---|---:|---:|---:|
| 583 | The Woman in White | 244,765 | 5 | 15 |
| 164 | Twenty Thousand Leagues under the Sea | 104,662 | 2 | 6 |
| 25344 | The Scarlet Letter | 83,498 | 2 | 6 |
| 5921 | The History of Don Quixote, Volume 1, Complete | 215,679 | 4 | 12 |
| 204 | The innocence of Father Brown | 78,917 | 2 | 6 |
| 46 | A Christmas Carol in Prose; Being a Ghost Story of Christmas | 28,527 | 1 | 3 |
| 766 | David Copperfield | 354,214 | 6 | 18 |

## Wave 7: 10 books, 60 synth jobs, 90 artifacts, 863,508 words, ~8 h

```
421,1608,236,1063,1257,215,1497,1524,1533,601
```

| id | title | span words | shards | jobs |
|---|---|---:|---:|---:|
| 421 | Kidnapped | 80,198 | 2 | 6 |
| 1608 | Camille (La Dame aux Camilias) | 66,507 | 2 | 6 |
| 236 | The Jungle Book | 50,839 | 1 | 3 |
| 1063 | The Cask of Amontillado | 2,317 | 1 | 3 |
| 1257 | The three musketeers | 228,212 | 4 | 12 |
| 215 | The call of the wild | 31,765 | 1 | 3 |
| 1497 | The Republic | 216,237 | 4 | 12 |
| 1524 | Hamlet | 31,960 | 1 | 3 |
| 1533 | Macbeth | 18,393 | 1 | 3 |
| 601 | The Monk: A Romance | 137,080 | 3 | 9 |

## Wave 8: 1 books, 12 synth jobs, 15 artifacts, 188,828 words, ~3 h

```
6130
```

| id | title | span words | shards | jobs |
|---|---|---:|---:|---:|
| 6130 | The Iliad | 188,828 | 4 | 12 |

**Remaining after Wave 1b: 55 books, 345 synth jobs, 5,331,543 span words.**

## Outcome (2026-09-17)

All eight waves plus two fix-ups are done. **95 books are live with all three voices**, up from 26 when the
campaign started: 30.7 GB of Opus audio over 11.6 million narrated words per voice. Every wave was verified
against the live manifest and the audio door before the next one started, and no book is live with a missing voice.

Ten books from the curated top-100 list are NOT narrated, all for reasons that need a code fix rather than a re-run:

| ids | why | what a fix needs |
|---|---|---|
| 4200, 68283 | leftover gate: Gutenberg trademark text inside the readable span | nothing — the gate is legally load bearing, leave them out |
| 98, 245, 1399, 2600, 4300, 6400, 8800 | `calculateReadableBounds` in `src/utils/textProcessing.ts` picks a late run of chapters in books whose numbering restarts per part, so the reader itself starts mid-book | fix chapter detection (the same detector ships in the Android app), re-run `plan.mjs`, check the new span's first and last unit text, then narrate. 4300 Ulysses also has a 2-word tail segment that would fail the per-segment WPM rail |
| 16328 | `finish.mjs` alignment rail: the voice model's token stream is a different passage than the reader's unit (`alignment stream mismatch at char 1`) in all three voices | look at how `synth.py` orders or splits this book's glossed verse (`{...}` summaries, `* * * * *` breaks) |

Worth fixing in the workflow before any future campaign: the finish job's artifact download sees only the newest
100 artifacts of a run (page the listing or download by artifact id), and the prepare job's `curl` has no `--retry`,
which cost one book a voice in wave 2.

## Status log

| wave | batch run | result | deploy run | deployed |
|---|---|---|---|---|
| 1 | [34752619371](https://github.com/mkov1988/focus-reader/actions/runs/34752619371) 2026-09-13 10:44Z to 22:58Z | 40/45 pairs verified (13 books full, 768 and 6593 without Marlowe, 394 missing); manifest committed as 2ae309e, R2 audio confirmed live | [34805654911](https://github.com/mkov1988/focus-reader/actions/runs/34805654911) success | 2026-09-14T04:21Z, 41 books live, all with 3 voices |
| 1b | [34788359514](https://github.com/mkov1988/focus-reader/actions/runs/34788359514) 2026-09-13 23:03Z to 2026-09-14 04:18Z | 5 missing pairs verified, 4 already-shipped pairs rejected by verify as designed; manifest 015901e | same deploy as wave 1 | 2026-09-14T04:21Z |
| 2 | [34805656187](https://github.com/mkov1988/focus-reader/actions/runs/34805656187) 2026-09-14 04:20Z to 11:24Z | 29/33 pairs verified; 16328 failed alignment in all voices (held back); 20203/hazel lost to a transient text-fetch reset (curl has no --retry); manifest 4e9e789 | same deploy as 2b | 2026-09-15 22:25Z |
| 2b | [34903679265](https://github.com/mkov1988/focus-reader/actions/runs/34903679265) 2026-09-14 22:21Z to 2026-09-15 00:05Z | 20203/hazel verified and added; the two already-shipped pairs rejected by verify as designed; manifest 8f68470 | [35030761802](https://github.com/mkov1988/focus-reader/actions/runs/35030761802) success | 2026-09-15 22:25Z, 51 books live, all with 3 voices |
| 3 | [35030770036](https://github.com/mkov1988/focus-reader/actions/runs/35030770036) 2026-09-15 22:24Z, prepare ok (57 synth jobs, none gated); supersedes 34903551993 which was cancelled on purpose so 2b could go first | attempt 1 ended 2026-09-16 05:07Z: 56/57 shards ok, shard 36462/hazel 0/2 killed by a runner shutdown, finish skipped, collect failed. `rerun_failed_jobs` on the same run id ran attempt 2 (05:08Z to 07:30Z) and it re-synthesized that one shard, then ran all 30 finish jobs and collect — 30/30 pairs verified, the other 56 shards reused. Manifest b498b88 | [35068970454](https://github.com/mkov1988/focus-reader/actions/runs/35068970454) success | 2026-09-16 07:33Z, 61 books live, all with 3 voices |
| 4 | [35068978799](https://github.com/mkov1988/focus-reader/actions/runs/35068978799) 2026-09-16 07:31Z to 13:22Z | 27/27 pairs verified, no failures; manifest 5a1fc12 | [35101650240](https://github.com/mkov1988/focus-reader/actions/runs/35101650240) success | 2026-09-16 13:25Z, 70 books live, all with 3 voices |
| 5 | [35101660214](https://github.com/mkov1988/focus-reader/actions/runs/35101660214) 2026-09-16 13:24Z to 21:33Z | 21/21 pairs verified, no failures; Les Miserables came in at 158 segments per voice and 1.52 GB for all three; manifest cb664ea | [35153251053](https://github.com/mkov1988/focus-reader/actions/runs/35153251053) success | 2026-09-16 21:37Z, 77 books live, all with 3 voices |
| 6 | [35153259910](https://github.com/mkov1988/focus-reader/actions/runs/35153259910) 2026-09-16 21:35Z to 2026-09-17 07:26Z | 21/21 pairs verified, no failures; manifest dcbcf46 | [35194664575](https://github.com/mkov1988/focus-reader/actions/runs/35194664575) success | 2026-09-17 07:29Z, 84 books live, all with 3 voices |
| 7 | [35194670571](https://github.com/mkov1988/focus-reader/actions/runs/35194670571) 2026-09-17 07:28Z to 15:06Z | 30/30 pairs verified, no failures; manifest 4e3e136 | [35238189249](https://github.com/mkov1988/focus-reader/actions/runs/35238189249) success | 2026-09-17 15:09Z, 94 books live, all with 3 voices |
| 8 | [35238198714](https://github.com/mkov1988/focus-reader/actions/runs/35238198714) 2026-09-17 15:08Z to 17:44Z | 3/3 pairs verified; the all-Greek unit 83 voiced fine, so the isolation was precautionary only | [35254658126](https://github.com/mkov1988/focus-reader/actions/runs/35254658126) success | 2026-09-17 17:46Z, 95 books live, all with 3 voices |

---

# Campaign 2: the next 100 most-downloaded books (started 2026-11-06)

Selection: `src/data/curated.json` sorted by `downloadCount`, skipping the 95 narrated books and the books held back in Campaign 1.
From the top 160 candidates: 15 fail the leftover gate, 8 are reference works (dictionary, Factbooks, a surgery manual, a concrete manual, a roll call, a word book, an anthology index),
6 are dropped by hand (4 duplicate editions of narrated books, a biographical dictionary, a mushroom guide), 15 show the readable-bounds bug. The first 100 that pass are below.
Sized by `scripts/narration/plan.mjs` like the batch prepare job; waves packed to at most 90 artifacts (3 x shards + 3 x books) because of the artifact listing cap (see Rails above).

**100 books, 10,293,411 span words, 684 synth jobs, about 1,200 runner-hours. Same procedure as Campaign 1: one wave at a time, deploy after each, never two runs at once.**

## Held back in this campaign

Readable-bounds bug (do not narrate until the Android app ships the chapter detector fix below):

- 42671 Pride and Prejudice :: later-heading, start 28% :: "CHAPTER XX."
- 47530 Oliver Twist, Vol. 2 (of 3) :: later-heading :: "CHAPTER XX."
- 22091 The best short stories of 1920, and the  :: start 82%, end 86% :: "M. Level's case. These stories are not l"
- 55059 Modern English biography, volume 1 (of 4 :: start 39% :: "V. A. 18 June 1857; retired on a pension"
- 50603 Minute Mysteries [Detectograms] :: end 75% :: "MINUTE MYSTERIES [Detectograms]"
- 51649 The Mysteries of London, v. 4/4 :: later-heading, end 81% :: "CHAPTER CX."
- 40058 The Life of Florence Nightingale, vol. 2 :: later-heading, end 87% :: "PART V"
- 27279 Southern Literature From 1579-1895: A co :: start 31% :: "L. L. D.\" were fighting in the wars; and"
- 21190 Expositions of Holy Scripture: Second Co :: start 88% :: "IV. Lastly, 'the Lord of Peace' gives it"
- 26315 Shakespeare's family :: end 90% :: "PREFACE"
- 3177 Roughing It :: later-heading :: "CHAPTER LXXVIII. Return to San Francisco"
- 30849 The Works of Robert Louis Stevenson - Sw :: later-heading :: "VOLUME XX"
- 47221 Quintus Claudius: A Romance of Imperial  :: end 89% :: "PREFACE"
- 70854 The Countess of Pembroke's Arcadia :: later-heading, start 77% :: "BOOK IV"
- 23609 Searchlights on Health: Light on Dark Co :: start 64% :: "I. INFANT FEEDING.--The care of milk, mi"

Gated out by the leftover gate (legally load bearing):

- 25851 The Life of Charles Dickens, Vol. I-III, Complete
- 22541 The Misplaced Battleship
- 12082 Color Images from Mars Rovers: Spirit and Opportun
- 27997 Robert Orange: Being a Continuation of the History
- 42681 The Hero of the People: A Historical Romance of Lo
- 57669 The problem of Cell 13
- 47642 The Strand Magazine, Vol. 27, February 1904, No. 1
- 21765 The Metamorphoses of Ovid, Books I-VII
- 18459 Hypnerotomachia: The Strife of Loue in a Dreame
- 34323 The Samurai Strategy
- 4499 Complete Short Works of George Meredith
- 34318 Life Blood
- 3922 The Red Lily — Complete
- 393 The Blue Lagoon: A Romance
- 2620 The Home Book of Verse — Volume 2

Reference works and duplicates (not worth a narrator):

- 37683 Chambers's Twentieth Century Dictionary (part 1 of 4: A
- 27558 The 2003 CIA World Factbook
- 27509 The 2006 CIA World Factbook
- 31100 The Complete Project Gutenberg Works of Jane Austen: A 
- 24855 Concrete Construction: Methods and Costs
- 51143 The Waterloo Roll Call: With Biographical Notes and Ane
- 28428 Manual of Surgery Volume Second: Extremities—Head—Neck.
- 13188 Putnam's Word Book: A Practical Aid in Expressing Ideas
- 45839 Dracula :: duplicate edition of 345 Dracula
- 161 Sense and Sensibility :: duplicate edition of 21839 Sense and Sensibility
- 48320 Adventures of Sherlock Holmes: Illustrated :: duplicate edition of 1661 Sherlock Holmes
- 71046 Modern English biography, volume 2 (of 4), I- :: reference: biographical dictionary
- 26492 Studies of American Fungi. Mushrooms, Edible, :: reference: mushroom field guide
- 42 The strange case of Dr. Jekyll and Mr. Hyde :: duplicate edition of 43 Jekyll and Hyde

Note: `JUNK_TITLE` in `scripts/mirror-all.mjs` never matches "Dictionary", "Encyclopedia", "Bibliography" or "Glossary": the trailing `\b` after a word stem like `dictionar` needs a word boundary that the real word does not have. The selection above used a corrected pattern.

## Chapter detector fix (2026-11-06, branch `claude/sharp-franklin-r40hxz`; NOT yet in the Android app)

The "chapter bug" behind both held-back lists. Five changes, each with the book that showed it:

1. `src/utils/chapterDetection.ts` dropped a table of contents by keeping the LAST line for each chapter number. Books whose numbering restarts per part lost every part but the last: War and Peace has 34 body lines reading "CHAPTER I" and the reader opened at Book 15, Chapter XXXV. Now a contents page is recognised by shape: a run of 3 or more headings at most 30 words apart whose numbers all appear again later in the body. Headings with titles over 60 characters count toward the shape but never become chapters (Around the World in 80 Days: only 5 of 37 contents lines were short enough to be candidates, so they never looked like a list). Unnumbered headings (PREFACE, PROLOGUE, INTRODUCTION) keep the keep-last rule: a preface does not restart, so an earlier one is the contents entry (Phantom of the Opera, Zarathustra, 421).
2. "CHAPTER I—M. MYRIEL" (em dash before the title, the Hapgood Les Misérables) was not a heading at all; 365 chapters were missing from the map.
3. Initials matched as roman-numeral headings: "M. Maret tells me", "L. L. D.", "I. O. U." gave Ulysses six fake chapters and a reader start a third of the way in. A roman-title heading's title may not open with another initial; a lone M or D is not a chapter number.
4. `detectBackMatterStart` accepted the wrapped prose line "advertisement be now?”" / "advertisement." as the ADVERTISEMENTS heading. The Enchanted April (16389) lost its last three chapters (cut at 88%), A Study in Scarlet (244) its last 4.6% — in the reader and in the narration built on it. A heading now has to start with a capital and be its own paragraph (blank line before and after).
5. `calculateReadableBounds` in `src/utils/textProcessing.ts`: a book never starts at an Epilogue/Afterword/Conclusion (the Complete Works of Shakespeare detects only the plays' prologues and epilogues and would have opened at the Epilogue of All's Well, 7% in), and never skips more than 15% of the file as front matter (fail safe to inclusion; a late run of headings is a detector mistake).

Checked against 265 texts (95 shipped, the 160 Campaign 2 candidates, the known-bad books): 224 unchanged; the 10 known-bad books now open at their first chapter and run to the end; for the 100 Campaign 2 books the new span contains the old span in 99 cases (30340 The Passionate Friends starts 17 title-page tokens later). `npm test` and `npm run build` pass. `plan.mjs` on the 95 shipped books reproduces the manifest span exactly for 92; the three that differ:

| book | manifest span | new span | what it means |
|---|---|---|---|
| 244 A Study in Scarlet | 120–41439 | 120–43426 | shipped narration is missing the last 4.6% (false ADVERTISEMENTS clamp). Re-narrate. |
| 16389 The Enchanted April | 53–68986 | 53–78257 | shipped narration is missing chapters 20–22 (last 12%). Re-narrate. |
| 45304 The City of God, Volume I | 73–231156 | 24–231156 | 49 title-page tokens ("VOL. I. THE CITY OF GOD, VOLUME I. EDINBURGH…") now inside the span. Harmless. |

Order of operations, do not reorder:

1. Port the same five changes to the Android app's copy of the detector and bounds calculation (the app and the narration must tokenize and bound a book identically; see `docs/narration-plan.md`). Until it ships, the app computes the OLD bounds while any wave run from this branch plans the NEW ones; that is safe only because new ⊇ old for every Campaign 2 book (checked above). Campaign 2 wave 1 ran from master (old detector); the chained waves 2–12 run from this branch.
2. After the app ships: re-narrate 244 and 16389 in a fix-up wave (shipped books are exempt from the bounds guard, so no flag is needed), then narrate the bounds-held books: the 7 from Campaign 1 (98, 245, 1399, 2600, 4300, 6400, 8800) and the 15 listed above. Run `plan.mjs` on them first and read each span's first and last unit text; the guard passes all of them now. 4300 Ulysses: the detector now finds no chapters at all (the six were initials), so the span is the whole file.
3. App rule worth adding: for a book that has narration, the readable span is the manifest's `span`, not the detector's. Then no future detector change can desync the reader from the audio.

## C2 Wave 1: 7 books, 63 synth jobs, 84 artifacts, 1,022,693 words

```
6761,4085,24739,34413,2680,51252,23784
```

| id | title | downloads | span words | shards | jobs |
|---|---|---:|---:|---:|---:|
| 6761 | The Adventures of Ferdinand Count Fathom — Complete | 42,392 | 161,618 | 3 | 9 |
| 4085 | The Adventures of Roderick Random | 41,248 | 188,667 | 4 | 12 |
| 24739 | Bidwell's Travels, from Wall Street to London Prison: F | 38,127 | 134,753 | 3 | 9 |
| 34413 | The Love Letters of Mary Wollstonecraft to Gilbert Imla | 38,116 | 33,240 | 1 | 3 |
| 2680 | Meditations | 38,017 | 70,292 | 2 | 6 |
| 51252 | The Book of the Thousand Nights and a Night — Volume 01 | 36,667 | 174,123 | 3 | 9 |
| 23784 | The History of Sir Richard Calmady: A Romance | 34,954 | 260,000 | 5 | 15 |

## C2 Wave 2: 9 books, 60 synth jobs, 87 artifacts, 911,644 words

```
65238,19771,2868,53874,27827,3011,40284,27475,51428
```

| id | title | downloads | span words | shards | jobs |
|---|---|---:|---:|---:|---:|
| 65238 | The Secret of Chimneys | 31,401 | 74,617 | 2 | 6 |
| 19771 | Henrietta Temple: A Love Story | 31,021 | 142,684 | 3 | 9 |
| 2868 | The Green Mummy | 29,838 | 87,738 | 2 | 6 |
| 53874 | Under the Red Dragon: A Novel | 28,630 | 150,956 | 3 | 9 |
| 27827 | The Kama Sutra of Vatsyayana: Translated From the Sansc | 28,422 | 58,310 | 1 | 3 |
| 3011 | The Lady of the Lake | 27,922 | 78,494 | 2 | 6 |
| 40284 | The Sex Life of the Gods | 27,853 | 32,334 | 1 | 3 |
| 27475 | That Girl Montana | 27,847 | 103,088 | 2 | 6 |
| 51428 | That Which Hath Wings: A Novel of the Day | 27,524 | 183,423 | 4 | 12 |

## C2 Wave 3: 7 books, 60 synth jobs, 81 artifacts, 909,025 words

```
19476,7326,26849,53416,53154,58866,55179
```

| id | title | downloads | span words | shards | jobs |
|---|---|---:|---:|---:|---:|
| 19476 | A Honeymoon in Space | 27,045 | 63,641 | 2 | 6 |
| 7326 | The Yeoman Adventurer | 26,670 | 125,029 | 3 | 9 |
| 26849 | The Works of Mr. George Gillespie (Vol. 1 of 2) | 26,576 | 264,214 | 5 | 15 |
| 53416 | Only a girl's love | 26,446 | 141,107 | 3 | 9 |
| 53154 | Cameron of Lochiel | 26,430 | 87,145 | 2 | 6 |
| 58866 | The Murder on the Links | 26,184 | 64,611 | 2 | 6 |
| 55179 | One of the Six Hundred: A Novel | 26,180 | 163,278 | 3 | 9 |

## C2 Wave 4: 9 books, 54 synth jobs, 81 artifacts, 739,667 words

```
48296,49987,43453,57641,48438,15399,46276,25789,2148
```

| id | title | downloads | span words | shards | jobs |
|---|---|---:|---:|---:|---:|
| 48296 | Linnet: A Romance | 26,150 | 141,311 | 3 | 9 |
| 49987 | Forest Days: A Romance of Old Times | 25,843 | 168,470 | 3 | 9 |
| 43453 | A Pickle for the Knowing Ones | 25,803 | 13,980 | 1 | 3 |
| 57641 | One Woman: Being the Second Part of a Romance of Sussex | 25,785 | 84,085 | 2 | 6 |
| 48438 | Rizal's own story of his life | 25,714 | 11,979 | 1 | 3 |
| 15399 | The Interesting Narrative of the Life of Olaudah Equian | 25,521 | 81,006 | 2 | 6 |
| 46276 | The Treasure of Pearls: A Romance of Adventures in Cali | 25,373 | 75,033 | 2 | 6 |
| 25789 | Emily Brontë | 25,160 | 68,760 | 2 | 6 |
| 2148 | The Works of Edgar Allan Poe — Volume 2 | 24,865 | 95,043 | 2 | 6 |

## C2 Wave 5: 7 books, 66 synth jobs, 87 artifacts, 1,064,524 words

```
831,72,4363,76178,53419,59828,42389
```

| id | title | downloads | span words | shards | jobs |
|---|---|---:|---:|---:|---:|
| 831 | Four Arthurian Romances | 24,854 | 191,088 | 4 | 12 |
| 72 | Thuvia, maid of Mars | 24,852 | 47,059 | 1 | 3 |
| 4363 | Beyond Good and Evil | 24,587 | 62,459 | 2 | 6 |
| 76178 | I am a woman | 24,468 | 75,012 | 2 | 6 |
| 53419 | Twenty-Five Ghost Stories | 24,382 | 55,986 | 1 | 3 |
| 59828 | The String of Pearls; Or, The Barber of Fleet Street. A | 24,322 | 436,564 | 8 | 24 |
| 42389 | The Pirate: Andrew Lang Edition | 24,312 | 196,356 | 4 | 12 |

## C2 Wave 6: 8 books, 54 synth jobs, 78 artifacts, 803,463 words

```
58820,32155,24793,26563,22163,76639,32474,50133
```

| id | title | downloads | span words | shards | jobs |
|---|---|---:|---:|---:|---:|
| 58820 | Whose Body? A Lord Peter Wimsey Novel | 24,287 | 58,706 | 1 | 3 |
| 32155 | The Love Letters of Henry VIII to Anne Boleyn; With Not | 24,028 | 5,800 | 1 | 3 |
| 24793 | Blow The Man Down: A Romance Of The Coast | 24,026 | 140,281 | 3 | 9 |
| 26563 | The Crack of Doom | 23,950 | 42,668 | 1 | 3 |
| 22163 | The Rover Boys on the Farm; or, Last Days at Putnam Hal | 23,863 | 48,932 | 1 | 3 |
| 76639 | Eloisa : $b or, A series of original letters | 23,506 | 307,437 | 6 | 18 |
| 32474 | The Memoirs of the Conquistador Bernal Diaz del Castill | 23,418 | 182,270 | 4 | 12 |
| 50133 | The Dunwich horror | 23,404 | 17,369 | 1 | 3 |

## C2 Wave 7: 9 books, 60 synth jobs, 87 artifacts, 903,818 words

```
57342,54219,37499,43098,468,38311,31472,50290,564
```

| id | title | downloads | span words | shards | jobs |
|---|---|---:|---:|---:|---:|
| 57342 | The Lives and Opinions of Eminent Philosophers | 23,235 | 186,304 | 4 | 12 |
| 54219 | A Little English Gallery | 23,101 | 51,077 | 1 | 3 |
| 37499 | Napoleon's Letters to Josephine, 1796-1812: For the Fir | 23,090 | 91,042 | 2 | 6 |
| 43098 | Selected Works of Voltairine de Cleyre | 23,083 | 135,601 | 3 | 9 |
| 468 | Manon Lescaut | 23,052 | 62,272 | 2 | 6 |
| 38311 | What Will People Say? A Novel | 22,891 | 149,330 | 3 | 9 |
| 31472 | Cynthia's Chauffeur | 22,688 | 82,470 | 2 | 6 |
| 50290 | Space Station 1 | 22,536 | 50,114 | 1 | 3 |
| 564 | The Mystery of Edwin Drood | 22,522 | 95,608 | 2 | 6 |

## C2 Wave 8: 10 books, 60 synth jobs, 90 artifacts, 904,321 words

```
31635,28203,33823,31257,38177,23184,36223,23639,2097,23500
```

| id | title | downloads | span words | shards | jobs |
|---|---|---:|---:|---:|---:|
| 31635 | The Silent Barrier | 22,513 | 83,217 | 2 | 6 |
| 28203 | Moods | 22,509 | 86,074 | 2 | 6 |
| 33823 | The Gay Adventure: A Romance | 22,504 | 77,372 | 2 | 6 |
| 31257 | Dainty's Cruel Rivals; Or, The Fatal Birthday | 22,433 | 53,924 | 1 | 3 |
| 38177 | The Passionate Elopement | 22,412 | 107,781 | 2 | 6 |
| 23184 | Monte-Cristo's Daughter | 22,089 | 84,611 | 2 | 6 |
| 36223 | The Boy with Wings | 22,059 | 89,828 | 2 | 6 |
| 23639 | Plutarch's Morals | 22,048 | 156,614 | 3 | 9 |
| 2097 | The Sign of the Four | 21,895 | 43,002 | 1 | 3 |
| 23500 | The Car of Destiny | 21,782 | 121,898 | 3 | 9 |

## C2 Wave 9: 10 books, 60 synth jobs, 90 artifacts, 856,498 words

```
37734,7452,36725,35548,11030,7524,7889,43063,15381,921
```

| id | title | downloads | span words | shards | jobs |
|---|---|---:|---:|---:|---:|
| 37734 | Some Jewish Witnesses For Christ | 21,735 | 138,500 | 3 | 9 |
| 7452 | Autobiography of a Yogi | 21,735 | 155,152 | 3 | 9 |
| 36725 | On the Cross: A Romance of the Passion Play at Oberamme | 21,678 | 167,439 | 3 | 9 |
| 35548 | Doctor Cupid: A Novel | 21,645 | 123,271 | 3 | 9 |
| 11030 | Incidents in the Life of a Slave Girl, Written by Herse | 21,621 | 82,409 | 2 | 6 |
| 7524 | The Germany and the Agricola of Tacitus | 21,618 | 48,783 | 1 | 3 |
| 7889 | Erotica Romana | 21,400 | 6,727 | 1 | 3 |
| 43063 | A Case in Camera | 21,083 | 80,522 | 2 | 6 |
| 15381 | Victorian Short Stories: Stories of Courtship | 20,945 | 35,954 | 1 | 3 |
| 921 | De Profundis | 20,791 | 17,741 | 1 | 3 |

## C2 Wave 10: 7 books, 63 synth jobs, 84 artifacts, 990,108 words

```
22187,2147,40361,17460,4367,22210,21700
```

| id | title | downloads | span words | shards | jobs |
|---|---|---:|---:|---:|---:|
| 22187 | Chambers's Edinburgh Journal, No. 452: Volume 18, New S | 20,684 | 20,778 | 1 | 3 |
| 2147 | The Works of Edgar Allan Poe — Volume 1 | 20,678 | 90,359 | 2 | 6 |
| 40361 | The Air Pirate | 20,678 | 60,895 | 2 | 6 |
| 17460 | Lorna Doone: A Romance of Exmoor | 20,301 | 274,421 | 5 | 15 |
| 4367 | Personal Memoirs of U. S. Grant, Complete | 20,201 | 281,117 | 5 | 15 |
| 22210 | In the forbidden land : $b an account of a journey into | 20,145 | 137,416 | 3 | 9 |
| 21700 | Don Juan | 20,059 | 125,122 | 3 | 9 |

## C2 Wave 11: 11 books, 54 synth jobs, 87 artifacts, 722,584 words

```
25359,6081,21092,10441,48893,8197,42486,30340,31469,12758,45109
```

| id | title | downloads | span words | shards | jobs |
|---|---|---:|---:|---:|---:|
| 25359 | Boys and Girls Bookshelf; a Practical Plan of Character | 20,055 | 90,668 | 2 | 6 |
| 6081 | Biographia Literaria | 20,000 | 137,585 | 3 | 9 |
| 21092 | On the Trail of the Space Pirates | 19,987 | 52,389 | 1 | 3 |
| 10441 | The Green Mouse | 19,955 | 47,422 | 1 | 3 |
| 48893 | Mademoiselle de Maupin, Volume 1 (of 2) | 19,907 | 67,715 | 2 | 6 |
| 8197 | India's Love Lyrics | 19,827 | 21,986 | 1 | 3 |
| 42486 | The Two Magics: The Turn of the Screw, Covering End | 19,805 | 77,044 | 2 | 6 |
| 30340 | The Passionate Friends | 19,723 | 104,235 | 2 | 6 |
| 31469 | The Shunned House | 19,715 | 10,836 | 1 | 3 |
| 12758 | Library of the World's Best Mystery and Detective Stori | 19,627 | 101,640 | 2 | 6 |
| 45109 | The Enchiridion | 19,551 | 11,064 | 1 | 3 |

## C2 Wave 12: 6 books, 30 synth jobs, 48 artifacts, 465,066 words

```
38983,108,834,18875,16921,28780
```

| id | title | downloads | span words | shards | jobs |
|---|---|---:|---:|---:|---:|
| 38983 | The Camp Fire Girls Solve a Mystery; Or, The Christmas  | 19,509 | 53,006 | 1 | 3 |
| 108 | The Return of Sherlock Holmes | 19,450 | 112,116 | 2 | 6 |
| 834 | The Memoirs of Sherlock Holmes | 19,431 | 95,425 | 2 | 6 |
| 18875 | The Prairie Wife | 19,411 | 54,259 | 1 | 3 |
| 16921 | Plague Ship | 19,370 | 60,020 | 2 | 6 |
| 28780 | Peter the Brazen: A Mystery Story of Modern China | 19,332 | 90,240 | 2 | 6 |

## Campaign 2 status log

| wave | batch run | result | deploy run | deployed |
|---|---|---|---|---|
| C2-1 | [42189860030](https://github.com/mkov1988/focus-reader/actions/runs/42189860030) 2026-11-06 08:44Z on master (old workflow), prepare ok (63 synth jobs, none gated) | running | | |
| C2-2 | | | | |
| C2-3 | | | | |
| C2-4 | | | | |
| C2-5 | | | | |
| C2-6 | | | | |
| C2-7 | | | | |
| C2-8 | | | | |
| C2-9 | | | | |
| C2-10 | | | | |
| C2-11 | | | | |
| C2-12 | | | | |
