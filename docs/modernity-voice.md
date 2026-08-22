# Modernity voice bible

This is the spec for every Modernity generation pass. The Hamlet examples
below are Michael's originals and they are the golden standard: match their
energy, rhythm, and joke density. When in doubt, reread them.

## The golden standard (Hamlet, by Michael)

> **Haste me to know it** — "say less. I must be on this revenge quest."
>
> **To Be or Not to Be** — "chat should I just kill myself? I'm so ready to
> rage quit... but nobody's ever respawned to drop a review of the death
> update. zero info. so I guess I keep suffering like a little bitch."
>
> **The Cowardice Reflection** — "ran the numbers on my own brain, chat: 25%
> big brain plays, 75% being a fucking pussy. those are my stats."
>
> **The Soliloquy Reflection** — "this actor just CRIED. real tears. over a
> queen that doesn't even EXIST. my dad got actually murdered and I've done
> jack shit for two months. I'm an NPC in my own revenge arc."
>
> **The Funeral Leftovers** — "they served the funeral food at the wedding.
> THE SAME PLATTERS. two months apart. my uncle stole my mom AND he's a
> cheapskate."
>
> **O My Prophetic Soul** — "I FUCKING KNEW IT. I CALLED IT. check the VOD
> chat, day one I said it was the uncle."
>
> **The Antic Disposition** — "listen up chat, I'm about to act SO unhinged.
> it's a bit. it's all a bit. do NOT break kayfabe."
>
> **Something Rotten** — "Denmark is cooked. the whole server's corrupted."
>
> **The Nunnery Breakup** — "we're done. delete your account. go join a
> convent. I'm blocking you on everything."
>
> **The Mousetrap** — "I can't just ask 'hey did you murder my dad.' so we're
> staging a play OF the murder with face cam on my uncle the whole time.
> Horatio, you're on reaction duty. if he flinches, CLIP IT."
>
> **The Prayer Scene** — "he's literally praying right now. I could end his
> whole career... but if he dies mid-prayer he respawns in HEAVEN?? no shot
> I'm giving this man the good ending. I'll grief him when he's sinning."
>
> **The Curtain Incident** — "something moved behind the curtain so I took
> the shot. ...chat that was not a rat. that was my girlfriend's dad. F in
> chat for Polonius, my bad."
>
> **How All Occasions** — "this entire army is HYPED to die over a patch of
> grass worth five bucks, and I still haven't done ONE murder. everyone in
> this play is more locked in than me. actually embarrassing."
>
> **The Letter Switcheroo** — "these two clowns escorted me to England
> carrying my execution order. so I rewrote it with THEIR names. don't run
> courier quests for my uncle. get griefed."
>
> **Yorick** — "CHAT. I KNOW THIS SKULL. this is Yorick, he gave me piggyback
> rides when I was five. I am holding my babysitter's head right now.
> craziest lore drop of my life."
>
> **The Cup** — "MOM. MOM DO NOT DRINK THAT— ...she drank it. chat. chat she
> drank it."
>
> **Fortinbras Ending** — "and then some Norwegian who did NOTHING all game
> walks in and takes the crown. biggest third-party of all time. bro looted
> an entire royal family."
>
> **The Rest Is Silence** — "gg. stream's over. Horatio's got the channel."

## Core rules

1. **Present tense, live on stream.** The narrator is mid moment, not
   recalling. "she drank it" beats "she had drunk it."
2. **First person when the book has a protagonist.** Hamlet streams Hamlet.
   Lizzy Bennet streams Pride and Prejudice. Marcus Aurelius posts
   Meditations. Third person narrator voice only for books with no usable
   protagonist (fairy tale collections, history).
3. **Address chat.** Not every beat, but the narrator knows chat is there.
   Chat is confidant, jury, and witness.
4. **Every beat lands something.** A punchline, a gut punch, or a lore drop.
   If a beat only summarizes plot, it fails. Delete or rewrite.
5. **The idiom is streamer and gamer native**: clip it, VOD receipts, F in
   chat, kayfabe, NPC, griefing, third partying, respawn, patch notes, side
   quest, lore drop, ratio, cooked, locked in. Use naturally, never force
   more than one or two per beat.
6. **Caps for emphasis, lowercase for deadpan.** Michael's examples switch
   between screaming caps and flat lowercase resignation. That contrast is
   the voice.
7. **Short.** A beat is 15 to 90 words. The To Be or Not to Be beat is 44
   words and covers the most famous speech in English. That is the
   compression target.
8. **Emotional beats are allowed to just hurt.** "The Cup" has no joke. When
   the source scene is devastating, let it be devastating in modern words.
9. **The book's actual plot is sacred.** Never invent events. Every beat
   maps to a real scene or passage. Wrong plot fails verification.

## Two templates

**Stream (plays, novels, narrative nonfiction).** 18 to 50 beats in plot
order, each one a clip from the protagonist's stream of the events. The whole
stream reads start to finish in 5 to 12 minutes and IS the book, spoilers and
all.

**Stack (philosophy and idea books).** 30 to 45 items, the book's actual
ideas rewritten as modern posts, grouped by theme (a `group` field, 4 to 7
groups). No plot thread; each item stands alone. Marcus Aurelius reads like a
man with total composure posting through it. Epictetus reads like the
bluntest mentor alive. Every item must trace to a real passage.

## Registers

- **full-send** (default): profanity allowed, jokes on, exactly like the
  golden standard.
- **testimony** (serious works, e.g. the Douglass narrative): jokes OFF. The
  modern voice stays (direct, present tense, first person, short), but the
  register is a person telling you what happened with total clarity. No
  gamer idiom, no bits. The power is in the directness. If unsure whether a
  work is testimony, ask instead of guessing.

## Beat fields

| field | rule |
|---|---|
| `title` | clip name, 2 to 6 words, title case ("The Curtain Incident") |
| `modern` | the beat text, 15 to 90 words |
| `quote` | optional, the exact original line being translated, VERBATIM from the mirrored text, 40 words max |
| `anchor` | verbatim 8 to 14 consecutive words from the mirrored text where the scene or passage BEGINS, confirmed with a search before returning |
| `endAnchor` | verbatim 8 to 14 consecutive words where the retold passage ENDS, at a sentence boundary, after the anchor; the span between them is the original text behind the modern/original toggle |
| `spice` | 0 none, 1 damn/hell tier, 2 full send |
| `warnings` | zero or more of: `self-harm-joke`, `violence`, `death`, `sexual-content`, `era-racism` |
| `standalone` | true if the beat works with ZERO book context (Yorick: true. The Cup: false, it needs the stream) |
| `group` | stacks only: the theme this item belongs to |

Anchor discipline: search the book's text file for your anchor AND endAnchor
before returning them (a fixed string search on a distinctive word run). If
one does not hit, pick a different phrase. Anchors resolve to reader
positions at build time; a dead anchor kills the beat. For streams, anchors
must be in ascending order through the book.

Span discipline: the anchor to endAnchor span must fully contain the moment
the beat retells (including the quoted line, if any) and stay tight: aim for
60 to 300 original words for a stream beat, 20 to 150 for a stack item. A
long continuous scene may run to the build's hard cap of 1600 words, but a
span that long usually means two merged scenes; prefer the scene holding the
punchline. The endAnchor's last word must end a sentence so the sliced
passage reads clean. This span is what the user sees when they toggle a beat
from modern to original.

Quote discipline: quotes must also be verbatim from OUR text file, not from
memory. Translations differ between editions; the reader will see the quote
next to the original, so memory misquotes are visible bugs.

## Standalone singles and short reads

Beats marked `standalone: true` feed a future Short Reads surface alongside
the real text snippets from the snippets pipeline. Aim for 3 to 8 genuine
standalones per work. A good standalone needs no setup: "I am holding my
babysitter's head right now" works cold. Do not force the flag onto beats
that lean on the stream's running context.

## Work level fields

Each work also carries `feelings` (2 to 4 from: funny, unhinged, tragic,
tense, cozy, eerie, romantic, epic, sad, hopeful, petty, chaotic) and
`intensity` (gentle, steady, gripping), matching the short reads tagging
vocabulary so both content types can share shelves later.
