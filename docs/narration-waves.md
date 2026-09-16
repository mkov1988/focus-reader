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
- **Keep every run under ~90 artifacts: 3 x shards + 3 x books.** The finish job's download step (`actions/download-artifact@v4` with `run-id`) sees only the newest 100 artifacts of the run (`Found 100 artifact(s)` in the log). Shard WAVs of the first books in the id line are the oldest, so past 100 they vanish and those pairs fail with `unit N not synthesized yet`. Wave 1 (105 shards + 45 outputs) lost Cranford in all voices and the Marlowe voice of Wuthering Heights and Tom Jones this way; run 32827119346 lost 7 books the same way. A workflow fix (page the listing, or download by artifact id) would lift this; until then, small waves.
- **One failed synth shard skips the whole finish stage** (the finish job's `if` only accepts synth success). The collect job then fails with `no verified bout-* artifacts`. Nothing is lost: re-run Narration batch with the same id line and `resume_from_run` = the failed run id within 3 days. Only the broken book fails at finish; everything else ships.
- **The manifest is committed before the R2 upload.** If the rclone step fails, master already lists books that have no audio, and the bucket-count check cannot catch it. Before deploying, confirm the collect job's R2 step is green (the `R2 audio/: N objects` notice) or that `audio/<id>/marlowe/timing-v1.json` returns 200 on the live site for each new id. If not, re-run with `collect_from_run` = the run id (verified output lives 14 days) and do not deploy until it does.
- **Re-running a book that is already in the manifest is safe.** `verify.mjs` fails any pair whose fresh output disagrees with the committed manifest entry, and the R2 upload skips existing objects, so only the missing voices get added.
- **A synth shard lost to a runner shutdown is the one case for `rerun_failed_jobs`.** GitHub sometimes kills a runner mid-job (`The runner has received a shutdown signal`); the shard fails through no fault of the input, and because the finish stage only accepts `needs.synth.result == 'success'`, the whole wave's finish is skipped. Wait for the run to complete, then re-run only the failed jobs on that same run id: GitHub re-runs the dead shard and the skipped finish/collect jobs, and the finish step's artifact download (`run-id: github.run_id`) still sees attempt 1's shards. That saves the other 56 shards and needs no fix-up wave. Prefer this over `resume_from_run`, which would skip synth entirely and leave the dead shard's book partial.
- kokoro and torch are installed unpinned in every synth job. A release that changes tokenization mid-campaign fails a whole wave at alignment. Recovery is `resume_from_run` after pinning; accepted risk.

## Gated out by the leftover gate (legally load bearing, do not force)

- 4200 The Diary of Samuel Pepys, Complete: 8 `ETEXT` hits
- 68283 The call of Cthulhu: 1 `etext` hit

## Held back: wrong readable bounds (fix chapter detection first, then narrate)

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

## Status log

| wave | batch run | result | deploy run | deployed |
|---|---|---|---|---|
| 1 | [34752619371](https://github.com/mkov1988/focus-reader/actions/runs/34752619371) 2026-09-13 10:44Z to 22:58Z | 40/45 pairs verified (13 books full, 768 and 6593 without Marlowe, 394 missing); manifest committed as 2ae309e, R2 audio confirmed live | [34805654911](https://github.com/mkov1988/focus-reader/actions/runs/34805654911) success | 2026-09-14T04:21Z, 41 books live, all with 3 voices |
| 1b | [34788359514](https://github.com/mkov1988/focus-reader/actions/runs/34788359514) 2026-09-13 23:03Z to 2026-09-14 04:18Z | 5 missing pairs verified, 4 already-shipped pairs rejected by verify as designed; manifest 015901e | same deploy as wave 1 | 2026-09-14T04:21Z |
| 2 | [34805656187](https://github.com/mkov1988/focus-reader/actions/runs/34805656187) 2026-09-14 04:20Z to 11:24Z | 29/33 pairs verified; 16328 failed alignment in all voices (held back); 20203/hazel lost to a transient text-fetch reset (curl has no --retry); manifest 4e9e789 | same deploy as 2b | 2026-09-15 22:25Z |
| 2b | [34903679265](https://github.com/mkov1988/focus-reader/actions/runs/34903679265) 2026-09-14 22:21Z to 2026-09-15 00:05Z | 20203/hazel verified and added; the two already-shipped pairs rejected by verify as designed; manifest 8f68470 | [35030761802](https://github.com/mkov1988/focus-reader/actions/runs/35030761802) success | 2026-09-15 22:25Z, 51 books live, all with 3 voices |
| 3 | [35030770036](https://github.com/mkov1988/focus-reader/actions/runs/35030770036) 2026-09-15 22:24Z, prepare ok (57 synth jobs, none gated); supersedes 34903551993 which was cancelled on purpose so 2b could go first | running; shard 36462/hazel 0/2 killed by a runner shutdown at 00:34Z, so finish will be skipped for the whole wave. Recovery: re-run failed jobs on this run id once it completes (see Rails) | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
