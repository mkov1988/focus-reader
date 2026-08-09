# Reader feel playbook

**Version 2, 2026-07-14.** This document is the settled record of how Focus Reader must FEEL, and how it got that way. Version 1 was mined from seven sessions; this version goes deeper: fifteen mined transcripts across two passes (the kinetic scrub origin, the native parity saga, the centered focus saga, the scrubber and navigation session, the immersive mode QA, the storefront gesture foundation, the bookmark iteration loops, the scene recap sessions, and the Android conversion kickoff), plus git archaeology over every feel file in both repos, which reconstructs the early June iterations whose transcripts were deleted. Every constant below was cross checked against the current working trees of both repos (web at commit be846a8, native branch feat/native-ui-web-parity at commit 295bbb7) on 2026-07-14. Historical values are marked as historical.

Two ground rules before anything else:

1. **The web app is the spec.** Native must match it exactly, not approximately. "in the web view, it works perfectly exactly, but it in the native app it is very clunky."
2. **Feel verdicts come only from Michael's thumb on a real phone.** Synthetic browser measurements passed repeatedly while the device felt choppy. Web QA of the native build covers logic, boot, resume, and navigation only; reanimated's frame loop never runs on web, so pacing and gesture feel are device only.

And the standing rule of this document: **do not relitigate anything in here without new feedback from Michael.** He has said, about interaction nuances agreed in earlier sessions: "we already had a deep conversation about all of the nuances of how this should interact earlier... ask what you need but try to find answers you should already have."

A striking fact from the git archaeology: almost no feel constant has ever been re tuned. Each value was set once at introduction and survives. The delay multipliers are untouched since the 2026-02-09 initial commit; the reader gesture thresholds since 2026-05-30; the kinetic scrub constants since their birth. The only true re decisions in the whole history are the default focal placement (third in to middle, 2026-06-15), the Sentence view architecture (fade swap machine deleted for the kinetic strip), the native drag densities (spike guesses re anchored to measured web values), and the book pickup follow model (rubber band replaced by the weighted low pass). When a constant is right the first time, it stays; when Michael re decides, the old approach goes on the rejected list forever.

---

## The direction in Michael's own words

Every load bearing verbatim quote, grouped by theme. Voice dictation filler is kept as spoken.

### The physics he wants

> "on the Single word view, for instance, when I scroll it'd be kinda like a date picker on an iPhone, where you can just kinda flick it and all the words fly by really fast and then they gradually slow down. Or if I go... if I scroll slowly, it would just be one word at a time."

The canonical analogy for the whole app. iOS date picker physics: flick means fast flyby with gradual deceleration, slow drag means one to one word stepping.

> "Okay. Great job on the single word view. It's very smooth. When I swipe it up, it it slowly... it's very smooth. It's not jagged. And when it kinda, like, uh, doesn't quite land on a letter, it very smoothly, uh, snaps to it, which is great. Feels great. That's how I want all of these to feel."

The tuned Focus reel is the golden standard. Smooth, not jagged, eased landing. This is the acceptance bar for every view.

> "So on the single word view, the scroll feels nice when I flick it as a very nice, uh, feeling to it."

The coast itself (FRICTION_K decay) passed on the first try and was explicitly liked. Only the landing, neighbor visibility, and play handoff were ever fair game after this.

> "When I slide it left and right, it's like chop, chop, chop, chop, chop. It's not smooth at all. It, like, instances each word is what it seems like."

Discrete word stepping reads as broken. Motion must be continuous pixel motion, never index increments.

> "it still feels choppy, it needs to smoothly scroll across"

His rejection of the second Sentence rebuild, which had passed synthetic checks. He judges on the phone; anything that reads React or the DOM per frame fails there.

> "can you please put some lines in the book when it's peeking open. not straight lines but like simulating text. also make it so it's not 1:1 responsive with the finger. there should be some weight to it to make the interaction feel better"

The weight doctrine. A picked up object trails the finger with mass, never tracking one to one. This produced FOLLOW_TAU (0.09 raised to 0.17), the tuning he later called perfect.

> "shouldn't we make so that the book being lifted up is responsive to the person finger, not like the person can drag it all over the screen, but with a hit area and it should move faster the closer it is to the original location and slower the farther it gets. is this making sense?"

His own earlier words for tethered follow physics. Objects feel alive under the finger, never free floating and never rigid. (The specific rubber band implementation this produced was later replaced by the weighted low pass, but the intent statement stands.)

> "we need some kind of barrier. I actually don't know if I want you to do this. What do you think? How should we handle this? because if I swipe up really hard, I kinda want to go And then, you know, just fly through paragraphs. You know what? Let's do this. On a flick up, swipe a couple paragraphs like a strong flick up. Swipe a couple paragraphs and then have it slowly land at the top of, uh, the following paragraph after those couple fly by."

He designed the paragraph barrier himself, out loud. Reaching the edge does not advance; deliberate overscroll advances one; a hard flick flies a couple then slowly lands at a top.

> "And if you can make the threshold a little bit stronger than if I just kinda swipe up normal, it doesn't it doesn't jump to, like, the middle of the next paragraph. And then on a big flick, have it have it shoot a couple paragraphs up."

The two tier gesture vocabulary in Paragraph view, and the absolute rule that momentum never lands you mid paragraph.

### Visual calm and the centred word

> "I don't want the actual words above and below to show all of the time. That's very disconcerting."

Visual calm at rest. The Focus view is one clean word when nothing moves. Context earns screen space only during motion.

> "I only want the words above and below to show when I flick, and they should fade. They shouldn't be a static, um, a static opacity when I'm flicking. They should they should fade out. And when the flick lands, it kinda snaps into place, and I don't want it to snap. I don't want it to, like, smoothly, slowly get to its word."

Neighbor opacity must be dynamic and tied to motion speed, melting out as the flick dies, and landings must be a smooth ease, never a hard snap. (The last sentence is a dictation stumble; his intent, confirmed by his later praise, is that it SHOULD smoothly, slowly get to its word.)

> "as as the as the flick is landing, the other... the words above and below should fade out."

The neighbor fade out and the settle are one combined moment.

> "this solutions doesn't work for me, commencment is cut off, and I don't like the focused letter not being in the center. I never Would have had you do this if I would have known what you were talking about when you were talking about sketchy radicals or whatever the hell you called it. I want the focus letter in the center. I want you to talk to me and play English and not use fancy words or acronyms. What are options here? You could turn the phone sideways, but then... but they have to hold it that way, and that's a lot less comfortable than holding it vertically. Think about ways to solve this while maintaining the experience and the central focus point."

The pivotal rejection of the off centre Spritz pin ("sketchy radicals" is his mangling of "Spritz reticle"). Three doctrines in one turn: the focal letter sits dead centre on screen, non negotiable; landscape rotation is rejected as less comfortable; and everything gets explained to him in plain everyday English, because he approved a change he did not understand and it stung.

> "How do you suppose we tackle this issue? I don't like the Idea of resizing dynamically as that would break the focus"

His up front veto on dynamic per word resizing as the default. The research corpus later confirmed it: a size that pulses word to word is the "strobe light" instability. Shrink survives only as an opt in mode and as a silent backstop.

> "make all the words have a center highlight. actually, make all these different solutions  configurable in settings. Do the default one that we started with. Do the one where just the big words are made a little smaller. Do the ones where just the big words are... have the center highlights so they're moved over a little more to the left so they fit better. Do the ones where every word is centered."

The fitMode pivot: rather than pick one long word strategy, ship all four as a user setting so he and users can feel them and choose. Reading feel tradeoffs become settings, not unilateral defaults.

> "ok. change \"classic\" to be a slightly smaller text so nothing gets clipped, call \"classic\" something else and change the name of \"Center every word\" to \"classic\" and make it first on the list."

The final fitMode ruling, overriding the research matrix recommendation. Centre every word is "Classic", first and default. Nothing in the app ever clips.

### Pacing

> "ok a little better. The pacing is all off, it stops longer in random places, review the rules and pacing in the web app and make sure the native app matches it."

The core pacing complaint. Playback rhythm must be even; an unexplained hold on a random word breaks reading flow instantly and he notices every time.

> "no it's still stopping in random places, also every time you make a change please update the version number at the bottom, so  after the changes you make for this it should say 0.7.2"

Second rejection of the same bug, plus the version bump rule: he verifies every round by the version at the bottom of Today.

> "try again"

After two failed pacing passes he wanted no more explanation, just a deeper attempt at the root cause.

> "you QA it and test it"

After two rounds of being the test harness he expects the assistant to prove a pacing fix itself (automated timing comparisons, live QA) before handing it back for a device feel check.

### Smoothness and the native bar

> "1. this is going to be an app people download on the google play store. you saying \"chrome\" makes me think you don't know that.\n2. It's important to me that everything feels butter smooth and therefor uses as many native components as possible. are you sure it's wise to just use the existing gesture code? \n3. or any other existing UI code for that matter?"

Smoothness is the nonnegotiable bar, and on Android he defines it as truly native. He is actively suspicious of reused web code in the interaction layer. This produced the doctrine "keep the recipe, not the code."

> "the feel is mostly there, we'll dial it in later. start the full conversion please"

The native feel spike passed with the web constants ported verbatim. A device dial in session is still owed (see Open threads).

> "ok it's working but it doesn't look anything like my app, is this just a test screen to make sure it works?"

He measures anything native against HIS app instantly; a bare test rig is tolerable only once explained as deliberate.

> "the reader isn't workign properly. in the first (single word) view every word jumps up and down. it should stay perfectly center. in the second view the words overlap. in the third view the words move at 1000 wpm when it's set to 300 wpm. please throroughly qa and fix the reader view"

The three native display bugs in one report. Note the third: perceived pace is real pace. The Sentence engine was timed correctly the whole time; the lurching render read as 3x speed.

> "is this consequential at all? I'm building a native app here what does it matter if doesn't work as a website?"

On device feel is the only thing that counts for the native app. The Expo web build is never a proxy for feel.

### Continuity, and the finger always wins

> "there is a bug in the reader view where when you try to scroll the actual text it goes back. the functionality should be text moves up and down when i scroll"

The baseline: touching text moves text, never navigates away. This bug report started the entire kinetic scrub project.

> "i think playback should pause if i start scrolling don't you?"

He proposed pause on scroll himself. Nothing fights the finger for position.

> "something happened with the book load. it was much smoother before, now it takes a while to load and the book gets put back down when it's done loading. the book should stay floating the whole time"

Continuity of motion is sacred. Once the user commits, the object never retreats or resets. His reaction to the fix: "ahhh thats better."

> "it appears that after flicking, the play doesn't actually play, or it does. It's just... it... it's very touching, I guess. ... I think maybe if it's not on the word exactly and you hit play, it doesn't play. I don't know. There's something going on there. Check that out."

The play after flick bug ("touching" is likely "touchy"). Play must cancel in flight momentum and read from wherever you are.

> "can you differentiate between a scrolling touch and selecting touch, currently just trying to scroll through picks up the book"

Origin of the swipe versus select doctrine. Any drag on a scrollable surface is a scroll; pickup requires a tap or a deliberate hold.

> "it should go towards the persons finger. we already had a deep conversation about all of the nuances of how this should interact earlier, either in this session or a different one. ask what you need but try to find answers you should already have. concerning the horizontal scroll, it's the same with the vertical scroll. idk how other apps do it but they can tell the difference between me trying to swipe and navigate vs me trying to select. we need to do the same"

The definitive gesture doctrine: finger follow is mandatory, and swipe/navigate versus press/select is disambiguated on both axes the way native apps do it, by time and platform, not direction. Also: settled nuances are law; recover them, do not re ask.

> "No that wasn't it, they are not responding at all. we are going backwards fast, stop messing things up. I specifically asked you to give me a slower drag on the finger yesterday and when i left last night it was perfect, now it doesn't work at all on my phone or on desktop. FIX THIS IMMEDIATELY!!!"

Regression fury. The weighted finger follow ("slower drag on the finger") is a protected, loved behavior, and breaking a declared perfect feel while tuning something else is the cardinal sin.

> "1, doesn't work, I must tap to open a book, click and drag is completely non responsive.\n\nI don't want you to revert as we have done MUCH work since then, I want you to figure this out and fix it."

Fix forward doctrine. Never revert accumulated work to escape a bug; diagnose and repair in place. (The one exception: when iteration has actively drifted from the goal, he orders a full revert to the last good baseline himself, as he did on the bookmark: "undo everything you just did.")

> "it mostly works, still a few issues, but i think we just table for now as it'll prbably change when we flip to android, what do you think?"

Pragmatic tabling: do not over polish mobile web gesture edge cases, because touch semantics change in the native target.

### Navigation without stopping the train

> "We've built a bullet train for reading, but right now, the user has no easy way to check the map or change stops without bringing the whole thing to a grinding halt."

The framing that produced the scrubber. His long brief named three problems: frontmatter friction, blind wayfinding ("Word 45,000" means nothing), and the cognitive context switch (a TOC modal "shatters the exact immersion the tool is designed to build"). Navigation must live inside the temporal reading modality.

> "give me a ui scrubber to navigate across scrubbers, get rid of the start over button and instead make it some icon that would mean this and then all the controls swap out with the scrubber while it's active. ask if you have questions before starting"

The scrubber commission (he meant "navigate across chapters"). The scrubber is a mode: all reader controls swap out for it while active.

> "I want it to be easy to go across both paragraphs and chapters, I think scrub paragraph and give like a double arrows flanking the scrubber to switch chapters"

Two navigation grains on one surface: the track scrubs by paragraph, chapter jumps are discrete chevrons.

> "since paragraph scrubbing just show first few words of sentence in paragraph"

The live peek while dragging: first words of the target paragraph, so you never navigate blind.

> "ok next feature! we need to retain where someone was at in a book regardless if they start a new book. additionally we need a recents section. ... I think getting rid of restart in general, or severely hidden it in the IA of the reader view in a book is a good call because someone is going to be PISSED if they lose their spot on a fat finger."

Reading position is sacred. Per book position always retained; no destructive control within fat finger reach in the reader. Restart was deleted entirely; dragging the scrubber to the start is the only start over.

> "This is probably over kill, but could it be by scene? or event? like you know how youtube videos have timestamps of the diff topics?"

The scene map idea in his words: position expressed as narrative scenes, like YouTube chapter timestamps. It became the authored scene labels and spoiler safe recaps on the scrubber and resume hero.

> "Wait what? I'm so confused. I just want the summaries on the scrubbers of the front page and vibe books, what in the fuck are you talking about a llama for?"

Scrubber summaries are plain authored text shipped with the app. No local LLM, no pipeline, no cloud, ever.

### Motion restraint, immersion, and craft

> "I don't think it needs as dramatic as an interaction as you have. I think if it just maybe expands ten percent or twenty percent or maybe goes down ten percent or twenty percent, not as not that you have a goal in, like, fifty percent or something right now. Just a little little app animation."

The animation restraint doctrine: micro interactions move roughly 10 to 20 percent, never dramatic 50 percent transforms. A settle, not a show.

> "I don't like that they come off of the top of the book title when they're clicked. That's very immersion breaking."

Immersion is a hard criterion. Elements stay physically attached to their object; motion that detaches from the physical metaphor is disqualifying.

> "You're right that it is very granular at the phone level and this little icon on it, but these are the details that are gonna make this stand out. So you need to get it right."

Phone scale micro details are the product's differentiator. Tiny is not an excuse.

> "Maybe, like, the first time on load, it just kinda, like, wiggles a little. Like, it kinda moves up and down a little so people know that it's there and that it's interactable."

His affordance pattern: one small one time motion on first appearance to teach tappability, then it settles. Transferable to teaching reader gestures.

> "So maybe you need to change the image you're working with instead of trying to apply all these effects to it."

Method doctrine: when a feel target keeps missing, stop layering compensating effects on the wrong base and rebuild the underlying medium. He detects and rejects faked physicality (shaders, gradients standing in for real geometry) every time.

> "Make the transition feel calm and intentional, consistent with the cozy, warm aesthetic."

From his immersive mode PRD. Chrome motion is calm and cozy, never snappy or mechanical. The reading field is the "espresso field."

> "Keep all controls one gesture away — never buried, never modal."

Immersion never costs reachability; one tap restores everything.

> "remember to optimize for mobile. there is no mouse on mobile, only taps. go ahead and make it so that the tap on gives interesting interactions on all the elements, and the tap off is the actual \"click\". ... keep them subtle, and above all else do not interfere with the user experience"

The founding interaction doctrine: press previews, release commits, everything subtle, and no gesture may ever fight scrolling.

> "fix but not at the expense of the general use, we put a lot of work into that interaction and I don't want to lose it. so if it's like add a tag or something thats fine, but don't change the base experience"

Once a gesture feels right it is protected. Accessibility and refactors bolt on around it (the autoCommit path); they never alter it.

> "obviously if someoen changes a setting it should stay that setting, I'm just giving you a default"

Defaults are for fresh installs only. Never write a migration that stomps a chosen setting. Applies to theme, mode, WPM, fitMode, everything.

### Speed of getting to the words

> "just a question, don't act just tell me: is there a way to cut down on the delay between clicking the book and getting to read it in the focus reader?"

Tap to reading latency is a feel problem he cares about deeply. He built prefetch on touchdown himself over a weekend to attack it.

> "How are serving up these books? the ones on the front page load into the reader instant but the ones in cozy corners take 5 seconds"
> "NO I NEED you to think harder about this, what is the best and fastest and most performant way to serve people the books they want to read?"

He rejected the incremental fix (cache after first read) and demanded a first principles answer. Result: the build time mirror plus the three tier fetch ladder; a mirrored book opens in ~9ms versus ~8000ms live. Opening a book into the reader must feel instant.

---

## Pacing rules

The playback timing model is identical on web and native, verified word for word by an automated side by side test (16 of 16 pass, millisecond identical timings even on a deliberately janky frame timeline).

### Per word delay multipliers

Live in `src/utils/textProcessing.ts` (web) and `Focus Reader Android/src/textProcessing.ts` (native, verbatim copy whose header states "these constants ARE the reading feel"). Every value below was set in the 2026-02-09 initial commit and has never been re tuned. The comments cite the RSVP research: punctuation multipliers approximate natural reading pauses.

| Constant | Value | Meaning | History |
|---|---|---|---|
| base delay | `60000 / wpm` ms | one beat per word | initial commit, unchanged |
| `DELAY_SENTENCE_END` | 3.0 | words ending `.!?` hold three beats. **Assignment, not addition**: it overrides any long word extras on the same word. This is also the only pause at paragraph ends today. | initial commit, unchanged |
| `DELAY_COMMA` | 2.0 | words ending with a comma hold two beats (also an override) | initial commit, unchanged |
| `DELAY_MINOR_PUNCTUATION` | +0.5 | added for words ending `;` or `:` | initial commit, unchanged |
| `DELAY_LONG_WORD_8` | +0.2 | added for words longer than 8 characters | initial commit, unchanged |
| `DELAY_LONG_WORD_12` | +0.3 | further added past 12 characters (cumulative with the +0.2) | initial commit, unchanged |
| `DELAY_PARAGRAPH` | 5.0 | **Live code, dead behavior.** A `[P]` token would hold five beats, but tokenization (2026-02-13) consumes `[P]` markers as paragraph boundaries and they never become timed tokens. Paragraph breaks add no extra pause beyond the sentence end 3.0x. Michael was invited directly to say whether a paragraph break should "breathe" and never answered. Do not wire it up without asking. | dormant since 2026-02-13 |

`DEFAULT_WPM` is 300 (`src/store/useStore.ts`). The default WPM control lives in Settings as preset chips from 200 to 600, set in the Settings/About session (commit 4308fd4); the in reader speed control still adjusts live. On native the WPM stepper is ±50 per tap clamped 100..1000 (`ReaderChrome.tsx`); it was ±25 in the spike and was doubled in the d1640f5 reconcile.

Progress saves every 2 seconds during playback (`PROGRESS_SAVE_INTERVAL_MS` 2000 in web `src/App.tsx` and native `ReaderScreen.tsx`), plus on pause, on app background, and on exit, because Android kills apps without running unmount cleanup (native commit 52c0613 fixed the save only on exit bug found in the parity audit). Two accounting rules from parity pack 10 (295bbb7): saves fire only when the index actually changed since the last persisted value (sentinel −1, so index 0 counts and merely opening a book records it at 0%), and zero word or zero millisecond play spans are discarded, because a zero word span grows msRead with 0 words and permanently drags the persisted average WPM down.

Playback also pauses on visibility loss: web listens to `visibilitychange` and calls `rsvp.pause()` on screen lock or app switch (commit e758e4a, from the Android readiness audit, so timing never drifts in the background and reading stats never inflate); native uses an AppState listener that auto pauses whenever the app leaves active (8be93b8), plus keep awake while reading, plus a navigation beforeRemove listener that pauses on Android system back (295bbb7).

### Sentence mode extras

In `src/App.tsx` lines 23 to 25 (web) and `useReelEngine.ts` (native), applied **only when visMode is 'sentence'**. All three born 2026-02-13 with the multi view reader, values never changed:

- `SENTENCE_START_MULTIPLIER` 1.8: the first word of a sentence holds longer.
- `SENTENCE_START_OFFSET` 500: a flat 500ms added at sentence starts. (One earlier summary mislabeled this a paragraph breath. It is a sentence start offset. The code is the truth.)
- `LINE_START_MULTIPLIER` 1.5: extra beat at each visual line wrap. **Vestigial on web since 2026-07-05**: the kinetic Sentence strip no longer reports line break indices (`onLineBreaksChange` is accepted but unused), so the multiplier no longer fires there either. On native it was never wired (TODO in the engine header, pending onTextLayout line measurement). Effectively the 1.5x is dead on both platforms today; know this before "fixing" a perceived divergence.

### End of book and live speed changes (parity pack 06)

- The word at the readable end serves its FULL dwell (e.g. 3x for a closing period) before playback completes; it does not get cut short.
- A WPM change mid play resets the accumulator so the on screen word gets a fresh full dwell at the new rate (matches the web's rAF restart on WPM change).
- Playback and progress are clamped to `readableStartWord`/`readableEndWord`: front matter (title page, copyright, TOC) is skipped at high or medium chapter confidence, back matter (index, glossary, ads, colophon) is clamped out conservatively (appendix, footnotes, endnotes deliberately kept), and a fresh book opens at the first readable word. A stored position of 0 never opens a book in front matter (pack 10 opening rule: explicit positive startIndex wins, everything else falls to the first readable word).

### The clock itself, and why it is built this way

The pause rules were never the source of his pacing complaints. Both "stops longer in random places" bugs were frame loop lifecycle bugs, and these are the guardrails:

1. **The frame worklet must be one stable memoized function, created once per book, reading only shared values** (`Focus Reader Android/src/reader/useReelEngine.ts`). The original inline worklet got a new identity every render, so every word swap tore down and re registered the frame callback, re serialized the whole book's delay table (~100k entries) to the UI thread, and stopped the reading clock for however long the phone happened to be busy. Measured cost: ~142ms of random extra hold per word on the old engine, zero on the new one. The stall tracked phone load, which is exactly why it felt random. Fixed in 1ad5ac3 (v0.7.2).
2. **Playback accumulates the RAW wall clock frame delta.** `rawDt = fi.timeSincePreviousFrame ?? 16` drives `acc.value += rawDt`. The capped copy `dt = Math.min(64, rawDt)` exists only for fling coast and speed sampling, matching where the web clamps. Capping the playback delta made UI hitches stretch every word and was rejected as a fix on its own; it was real divergence but not the root cause.
3. **Pressing Play cancels any in flight fling first** (guarded `stop()` in the web engine, equivalent in native), so playback reads from the word on screen with zero lurch. Letting inertia keep coasting after Play made Play feel broken.
4. **During playback the displayed word pins to the committed integer React index.** The continuous UI thread `pos` drives the reel only while `interacting` (dragging, fling, or settle: `dragging || mode===2 || mode===3` as a shared value). Driving playback position from `pos` desyncs from React's index by one frame and every word visibly lurches before snapping. This was the "every word jumps up and down" bug (fixed 42e3fda).
5. **Perceived pace is real pace.** The Sentence strip once read as 1000 wpm while set to 300 because async onLayout measurement lagged each step and the strip lurched. Engine timing was identical the whole time. If a view lurches, Michael reports it as a speed bug; fix the rendering, not the clock.
6. **The engine hydrates once, to the true opening position, when tokens stream in.** An earlier version locked the start position before text loaded and always opened at file word 1, ignoring the saved spot and the title page skip.
7. **Never write the store during render.** The session tracker once called addSession inside a setState updater and re rendered other subscribers mid render (fixed 56db3d1, play span in a ref). Reader exit pauses BEFORE saving so the in flight span lands in stats.

The engine architecture: a requestAnimationFrame loop with a time accumulator on web (`useRSVP.ts`, frame rate independent since the initial commit); a state machine on the phone's drawing thread on native, with per word delay tables mirrored to shared values once at book load.

---

## Scrub and inertia rules

### The shared engine

Web: `src/hooks/useKineticScrub.ts`, one engine for every reader view, all feel knobs in one file (deliberately, for one file tuning). Native: `Focus Reader Android/src/reader/useReelEngine.ts`, rebuilt from scratch on the UI thread under the doctrine "keep the recipe, not the code": the scrub PHYSICS run entirely in UI-thread worklets with no per-frame JavaScript, while the reel RENDER intentionally mirrors the web by pushing one React update per changed frame during a drag (via `useReelFrame`); only the tuned numbers and pure logic carried over. The conversion plan carries an explicit warning **not** to use reanimated or gesture handler's built in fling and decay physics, because their friction model differs from the tuned feel; the custom friction loop was rebuilt with the exact web numbers instead.

**Web and native use the same physics constants verbatim**, confirmed live in both files on 2026-07-14. All were born 2026-07-05 (web commit be846a8, native spike 78340a8) and none has ever moved:

| Constant | Value | What it is |
|---|---|---|
| `FRICTION_K` | 0.0035 | Exponential fling decay per ms, `v *= exp(-FRICTION_K * dt)`. A hard flick coasts a bit over a second. This IS the flick feel Michael likes ("the scroll feels nice when I flick it"). Do not touch it. |
| `HANDOFF_V` | 0.004 steps/ms | Below this speed the coast hands off to the eased settle |
| `SETTLE_MS` | 260 | Duration of the easeOutCubic glide onto the nearest whole word. The "smooth settle instead of snap." |
| `MAX_V` | 0.4 steps/ms | Release velocity cap so one flick cannot rocket away |
| `TAP_PX` / `TAP_MS` | 8 / 250 | Scrub axis movement under 8px released within 250ms counts as a tap (peek), not a scrub. On native, cross axis drift does not disqualify the tap. |
| `SAMPLE_WINDOW_MS` | 90 | Web: trailing window for measuring release velocity; a hold longer than 1.5x this (135ms) zeroes the velocity, so pausing your finger then releasing does not fling |
| dt clamp | 64ms | Frame delta cap against tab switch jumps, applied ONLY to fling coast and speed sampling, never to playback |
| `SCRUB_ACTIVATE_PX` | 2 | **Native only.** Manual pan activation slack so finger noise during a tap cannot cancel native presses. The web tracks from the first pointermove and needs no equivalent. |

Universal behaviors:

- `prefers-reduced-motion` (web) and the OS Remove animations setting (native, pack 06) skip inertia entirely: drag release and settle land instantly.
- The engine swallows drags so scrubbing can never trigger the old swipe down to exit.
- **Any manual scroll or scrub pauses playback immediately.** Only genuine user input triggers the pause (a wheel tick, or a vertical dominant drag past 8px); the programmatic auto recenter never does. Michael proposed this himself: "i think playback should pause if i start scrolling don't you?"
- A drag that catches a coasting reel seeds from the committed integer index (snapping up to half a row), matching web `getIndex()`.

### Per view finger travel (pxPerStep)

Pixels of finger travel per word step. On web these derive from font size at runtime; on native they are per mode overrides resolved in `ReaderScreen.tsx` (~line 138):

| View | Web | Native | Axis |
|---|---|---|---|
| Focus reel / Hybrid reel | `rowHeight` = round(fontSize × 1.5) = 84 at the 56px default | 84 (`PX_PER_STEP_Y`) | vertical |
| Ghost Trail | round(fontSize × 2.5) = 140 | 140 | horizontal |
| Sentence | round(displaySize × 2.6) = 116 | round(sentenceDisplaySize × 2.6) = 116 | horizontal |

History: the native spike **guessed** 18 (vertical) and 22 (horizontal) px per step as placeholders flagged "device tune targets." The d1640f5 reconcile (2026-07-12) re anchored them to the measured web values: 18 → 84 and 22 → 117, with per mode overrides added. Parity pack 07 then derived the sentence density from the same displaySize as the strip's word gap (117 → 116) so drag stays one to one with the strip. Drag sensitivity was the ONE number the spike invented rather than ported, and Michael's thumb verdict on it (too twitchy or too heavy) is still owed.

### Gesture zoning (who owns which pixels)

Web model (`src/hooks/useReaderGestures.ts`, constants born 2026-05-30 and never moved): the display component stops propagation on pointer down and owns its surface outright. Around it:

- `SWIPE_PX` 70: horizontal dominant swipe skips a sentence (left = forward, right = back, stories convention).
- `SWIPE_DOWN_PX` 110: vertical dominant swipe down exits the reader. Deliberately large so casual movement or a paragraph scroll attempt never exits. Suppressed entirely when the drag starts inside a vertical scroller, and the scroller test is "is this the designated overflow-y:auto text surface," NOT "is it currently overflowing" (the latter fails when a paragraph exactly fits).
- Drags starting on `[role=slider]` or scrollbar are excluded, so scrubbing the progress bar never fires a competing sentence skip (the Gemini QA fix, 60edcd3).
- `pointercancel` aborts everything so browser scrolls never misfire gestures.

Native model (parity pack 07, 90e77e1): the scrub gesture attaches only to the display band (the fontSize × 4 = 224px strip; in Sentence mode the whole stage) and touch down pauses playback only there. The rest of the stage gets ONE release time resolver deciding by dominance at finger up: 70px horizontal dominant skips a sentence; 110px downward dominant exits, but only in Focus, Hybrid, and Trail modes, never from the Hybrid paragraph card and not at all in Paragraph or Sentence modes. This zoning REPLACED the spike's axis fences (activeOffset ±12 / failOffset ±24), which existed only because scrub, swipes, and tap once raced over one stage wide surface. Do not reintroduce axis fences.

Other native gesture rules: sentence tap to seek requires true stillness (cross movement under 8px); paragraph edge advance has a vertical dominance gate (over 8px and more vertical than horizontal) and fires at most once per finger stroke; the paragraph scroller sets overScrollMode never / bounces false so the deliberate 34px pull is the only pre advance feedback, matching the web's overscroll containment.

### The storefront pickup (context for the reader: same doctrine, shared history)

The book open gesture is where most of the app's gesture doctrine was hammered out, and its rules bleed into the reader:

- Press previews (release commits, a drag past 10px cancels the preview so it never fights scrolling; `usePress`, 2026-06-28). The cover itself peels up to −50 degrees on a rotateY hinge during the open transition (`MAX_PEEL_DEG` in `src/components/Reader/BookOpenTransition.tsx`); `usePress` has no peel of its own.
- Platform aware disambiguation in `src/utils/pressGesture.ts`: a MOUSE drag past `DEFAULT_MOVE` 10px is an immediate deliberate pickup (a mouse cannot scroll these surfaces); a TOUCH drag past `DEFAULT_TOUCH_SLOP` 22px (widened from 14, briefly 18) is a scroll and the browser keeps the pan; a still hold of `DEFAULT_HOLD_MS` 130ms lifts with finger follow; a quick release is tap to open. Shelf cards pass a longer `SHELF_HOLD_MS` 400 so horizontal shelf flings never lift a book. Disambiguation is by TIME and platform, never direction; a 350ms hold plus scrollAxis both variant made cards feel dead and was abandoned.
- The open spring is `STIFFNESS` 110 / `DAMPING` 22 (Michael's own values), one openness value 0→1 driving lift, move, peel, dim, and page flutter, in a rAF loop with direct DOM writes bypassing React.
- The lifted cover follows the finger through a weighted low pass: `FOLLOW_TAU` 0.17 seconds in `src/components/Reader/BookOpenTransition.tsx`, `k = 1 − exp(−dt / FOLLOW_TAU)`, raised from 0.09 when Michael asked for "some weight to it," and later defended by name ("I specifically asked you to give me a slower drag on the finger yesterday and when i left last night it was perfect"). **Historical:** the earlier rubber band model (`FOLLOW_RESISTANCE` 220, `MAX_FOLLOW_PX` 90, from 2026-06-28) no longer exists in the code; version 1 of this playbook listed it as current, which is now corrected.
- On commit the book freezes and fades in place over ~240ms; spring back to the slot is reserved for cancel only. A lifted book leaves a darker silhouette in its slot (bg espresso at 0.13 plus inset shadow, caption dimmed to ~40%).
- Touch implementation law learned the hard way: never unmount an element holding implicit touch pointer capture mid gesture. Committing the pickup once unmounted the cover under the finger, firing pointercancel and killing the move stream (phone only, since mouse has no implicit capture). Keep it mounted and fade it; pointer capture to document.body is mouse only. And pointercancel is not a release or a commit.
- Haptics are commit only: `haptics.tick` (5ms vibration) on small confirms like peeks, menu, theme picks, saves; `haptics.commit` (12ms) when a book opens; `haptics.error` ([10,60,10]) on failure. Never on every tap, never on cancel, no op on iOS. Native maps these to Android semantic effects deliberately (selectionAsync / impact Medium / notification Error) instead of raw millisecond vibrations. Parity pack 15 REMOVED the haptic tick from reader mode switching to match the web, which never had one there.
- The GestureHud (the black and green on screen gesture trace overlay used while tuning all of this) was permanently deleted once the gestures were declared dialed in. No debug chrome ever ships to what Michael sees on device, and there is currently no on device gesture trace instrument left if tuning resumes.

---

## Per view specifics

### Focus (single word reel)

The golden standard view. "Great job on the single word view. It's very smooth... Feels great. That's how I want all of these to feel."

- Base type: 56px serif (`READER_FONT_SIZE` 56 native = web `DEFAULT_FONT_SIZE`). Reading area height is fontSize × 4 (224px), a constant frame so layout never shifts when a long word shrinks. Row height (and vertical pxPerStep) is round(fontSize × 1.5) = 84.
- Guide frame (the reticle): 4px horizontal bars at 14% ink, 28% tall × 4px centre lines at 22% ink, positioned exactly over the focal letter. The bars were fixed grays until the 2026-05-25 theming pass moved them to theme ink alphas. The Focus reel rows sit dead centre in the frame (no vertical lift); only the Ghost trail carries an optical nudge (see below).
- **The focal letter is pinned dead centre on screen, in every mode, always.** The word is positioned by measuring the glyph so the colored letter lands on the centre line. The off centre 33% pin is permanently banned (see Rejected approaches).
- Focal letter placement within the word is the fitMode setting (menu → Reading, later also Settings): **Classic** (default since 2026-06-15) colors the middle letter of every word (`MIDDLE_FRACTION` 0.5) so words balance around centre and fit at near full size; **Center long words** (`centerBig`) gives only words of `BIG_WORD_MIN_LENGTH` 11+ letters the middle letter, short words keep the third in spot; **Shrink long words** keeps the third in spot and scales down only what overflows; **Compact** keeps third in at one uniform `COMPACT_SCALE` 0.8 (44.8px for every word, uniformity is what distinguishes it from Shrink). The third in spot is `ORP_FRACTION` 0.3 with a stepped ladder for short words (len ≤1 → 0, ≤5 → 1, ≤9 → 2, ≤13 → 3, else floor(len × 0.3)), from the initial commit's RSVP research (optimal recognition point 25 to 35% in). Michael set the naming, the ordering, and the default himself, overriding the research matrix recommendation of Center long words.
- **Nothing ever clips, in any mode.** `useFitFontSize` (web) / `fitFontSize` (native) is a universal shrink backstop: measure both halves around the focal letter at the base size, shrink by the exact overflow ratio only when the longer half exceeds containerW/2 − `FIT_SIDE_MARGIN` 14 (widened from 10 after live measurement showed the canvas estimate ~4px optimistic), floored at `MIN_SCALE` 0.5 so absurd tokens stay readable. Native pack 08 replaced the `EM_FACTOR` 0.58 width heuristic with real measured widths (glyph table estimate, exact onTextLayout a frame later, at the BASE size). The ghost trail font tracks the shrunken word (renderFontSize × 0.82) so proportions hold. There is no window resize re fit listener; it wedged capture and adds nothing on a portrait phone.
- At rest and during playback: **only the centred word renders.** `NEIGHBORS` 4 rows each side exist for scrubbing (the frame shows about 2; extras keep the reel full mid flick). Neighbor opacity is tied to live reel speed each frame: `motion = min(1, speed / NEIGHBOR_FULL_SPEED)` with `NEIGHBOR_FULL_SPEED` 0.02 steps/ms, times a distance fade of 1 − 0.4 × |dist|. Neighbors fade in as the flick speeds up and melt out as it lands. Never a static opacity. (During the tuning session the fade traced 0.73 → 0.45 → 0.2 → 0.02 → 0 across a landing.)
- Landing is the `SETTLE_MS` 260 easeOutCubic glide, never a snap.
- Native must drive window and offset from ONE value via `useReelFrame`, like the web's `frac`, or the centre blanks out mid fling. And during playback the reel pins to the committed integer index (the `interacting` gate). The Focus reel deliberately does NOT share the trail's −4px optical nudge; its rows are exactly centred like the web reel (comment in displays.tsx marks this).
- Scrub axis: vertical. Tap on the band is the engine's own tap rule (peek).

### Sentence

A continuous horizontal ribbon, never paged or stepped. Three architectural eras:

1. 2026-02-13 to 2026-07-05: a sentence swap fade machine (`TRANSITION_DURATION` 150ms fade out, instant recenter, fade in; line break detection at fontSize × 0.5; smooth recenter when the active word drifted 5px off centre; active word scale 110% plus focal tint; passed words dimmed to 60%). **Deleted wholesale** in the kinetic rebuild.
2. First kinetic rebuild: continuous strip but with per frame DOM geometry reads. Passed synthetic checks, still "choppy" on device. Rejected.
3. Current: the strip transform is written imperatively each frame (`translate3d`, GPU composited) from a fractional position ref. React re renders only per word for the highlight. Word widths are canvas measured once, so per frame positions are pure arithmetic with **zero DOM reads during animation**. Only this passed Michael's phone.

Geometry, verified current on both platforms:

- `WINDOW` / `SENTENCE_WINDOW` 9 words rendered each side of centre.
- displaySize = clamp(fontSize × 0.8, 32..64) = 44.8 at the default; word gap 0.4 × displaySize (**load bearing for scrub feel**; native briefly moved it to 0.5em in 42e3fda and pack 07 moved it back to 0.4em when the drag density was re derived from it); pxPerStep round(displaySize × 2.6).
- Neighbor word opacity max(0.2, 1 − 0.16 × dist); 15%/85% linear gradient edge fade mask on web; strip height round(displaySize × 1.6) with lineHeight glyph centering on native.
- Native positions are analytic prefix sums of measured widths, never async onLayout (that lag was the "1000 wpm" illusion); pack 08 interpolates the FULL window's centres (at most 19 numbers) across a fling.
- Sentence mode is where the pacing extras fire (1.8x plus 500ms at sentence starts). Tap a word to seek (requires stillness on native). Scrub axis: horizontal; on native the whole stage is scrub surface in this mode and swipe down to exit is disabled here.

### Ghost Trail

- `TRAIL_COUNT` 5 ghost words per side; ghost opacity 1 − 0.2 × i floored at 0.04 (the fifth ghost sits at 4%; native briefly used a 0.06 floor and pack 08 corrected it to the web's 0.04); ghost font 0.82 × the current word's rendered size; ghost lanes anchored a measured 8px past each word's end. Focal letter still pinned dead centre. Born 2026-05-22 ("mobile tap interactions" round), values never re tuned.
- Native pack 08 rebuilt it to the web three layer geometry after estimated widths made ghosts overlap: `GHOST_LANE_WIDTH` 4000 so Yoga never clamps, ghostGap 0.3em, trail layers ride a translateY −4 optical nudge reproducing the web's −8px margin centring (and the Focus reel deliberately does not share it). Earlier the native trail was a plainer five word reel and, before 42e3fda, a flex layout whose big neighbors collided with the focal word.
- Scrubs horizontally with momentum through the shared engine at round(fontSize × 2.5) px per word, but on web it still steps word by word rather than sliding continuously. It never got the imperative continuous reel treatment and will feel "chop" exactly the way Sentence did the moment Michael scrubs it hard (open thread; the rebuild was offered twice with no answer).

### Paragraph

Edge advance with a barrier (`src/components/Reader/ParagraphDisplay.tsx` web, `displays.tsx` native; all values born 2026-07-05, never moved). Michael designed this interaction himself, thinking out loud.

- Reaching the bottom does NOT advance. A deliberate overscroll past the edge of `OVERSCROLL_MIN` 34px fires the advance (`EDGE_SLOP` 2px edge tolerance; `WHEEL_MIN` 90 accumulated wheel delta on desktop, with wheel magnitude tiers under 220 → 1, under 440 → 2, else 3 paragraphs).
- Overscroll flick speed maps to distance: below `V_TWO` 0.9 px/ms jumps 1 paragraph, below `V_THREE` 1.5 jumps 2, above jumps 3 (release speed measured over a 90ms window). Normal swipe advances one at most; a big flick is a deliberate travel gesture.
- **Every advance lands pinned to the TOP of the destination** (scrollTop 0). Native scrolling is disabled for `LANDING_MS` 420ms during landing so leftover fling momentum cannot drag the new paragraph into its middle. Landing mid paragraph is always wrong.
- The arriving paragraph slides in over a distance and duration scaled by paragraphs travelled: enterDist = 28 + 42 × (count − 1) px, enterDur = 300 + 150 × (count − 1) ms, ease out (the `--enter-dist` CSS var and para enter keyframes in `index.css` on web; EASE_OUT bezier(0,0,0.58,1) with ReduceMotion.System on native).
- Type: displaySize = clamp(fontSize × 0.6, 24..48); native lineHeight round(size × 1.625), word gap 0.25em (pack 14 replaced a fixed 8px gap).
- The active word is kept centred with an auto recenter that skips corrections of 2px or less (jitter threshold) and scrolls instantly on paragraph change, smoothly within one; native adds `PARA_PAD_V` 128 scroller padding into the centring math.
- Word highlight: colors crossfade over 100ms (web transition colors duration 100 since 2026-02-13; native pack 14 matched with bezier(0.4,0,0.2,1), animating only the two words that changed state). The active pill overhangs 4px each side with 4px radius, scale 1.05 applied instantly.
- Tap any word to jump there (`onWordClick = rsvp.seek`).
- Vertical drag on the text scrolls the text and never exits the reader; manual scrolling pauses playback (Michael's own proposal); one advance per finger stroke on native with a vertical dominance gate.
- **Open want:** his original vision was a dual crossfade, the old paragraph fading and floating up WHILE the new one fades in from below ("That'd be pretty sick"). Only the enter half was built.

### Hybrid

- Focus reel on top, faded paragraph card below: card height 45% of the stage, opacity 0.4, fontSize 56 × 0.5 = 28 (native `ReaderScreen.tsx`; mirrors web).
- Scrub axis: vertical, same reel physics and pxPerStep 84 as Focus.
- Swipe down to exit works from the reel band but never from the paragraph card.
- Manual scroll in the paragraph card pauses playback, same as Paragraph view.

### Reader chrome and immersive mode

The mental model is a media player, from Michael's own PRD: "Starting playback fades the surrounding chrome away, leaving only the word and its crosshair reticle on the espresso field. A tap anywhere — or pausing — brings the chrome back."

- Chrome starts fading 100ms after Play (web `useImmersiveMode` fade timer; native `PLAY_FADE_DELAY_MS` 100), as one simultaneous fade, never staggered. The CSS transition is 300ms ease out (native matches with withTiming 300ms Easing.bezier(0,0,0.2,1), Tailwind's ease out, pack 15).
- A tap during playback is a **peek**: it reveals chrome without pausing (with a haptic tick), and chrome re hides after `idleTimeoutMs` / `IDLE_TIMEOUT_MS` 3000 idle. Pause is always an explicit tap on the visible Pause control. Tap to pause was deliberately replaced and is revisit only if user testing demands it.
- The focal word and reticle never fade in any state. Hidden chrome is pointer events none, so a peek tap can never trigger a control underneath; real buttons opt out of the peek gesture so taps never double fire. Reduce motion makes show and hide instant.
- The reader is an inner page wearing the same shared `InnerPageHeader` as every other inner page (round back button, serif title); exits are back button, Escape, and swipe down. The header collapses on play via CSS grid rows 1fr → 0fr over ~300ms (exact content height, no magic max height) and re expands on pause. The Aa text size slider was stripped from the reader header by Michael's order ("strip out text size for now and we'll re examine the reade rview controls after"); fontSize is fixed at the 56px default.
- The in reader navigator is the scrubber: a List icon (which REPLACED the Start Over button) swaps the entire control row for it; opening it pauses playback. The track scrubs by word but snaps to paragraph starts so a scrub never lands mid sentence; chapter tick marks sit on the rail; double chevron arrows flanking the track jump previous or next chapter and keep the scrubber open for step then fine tune; the live peek while dragging shows the chapter or scene label (coral uppercase) plus the first 9 words of the target paragraph in italics; releasing a drag seeks and auto closes; a check button closes; chapter arrows are disabled for chapterless books, which scrub by paragraph landmarks. Chapter detection is confidence tiered (high, medium, none) and on low confidence the UI silently degrades to paragraph landmarks: never show the user a wrong map, just less of one.
- When a book has an authored scene map (`scenes.json`), the scrubber prefers it over detected chapters, so ticks, arrows, and peek show real scene names ("A MAD TEA-PARTY" instead of "CHAPTER VII"), matching the resume hero's "Previously" recap. Scene labels and recaps are human written, spoiler safe, generated locally, and shipped as bundled static data; rich authored maps apply only at L1 (front page) and L2 (one page down). The "previously" card hides when a recap is missing.
- There is NO Restart control anywhere in the reader. Reading position is retained per book in a progressById map. "someone is going to be PISSED if they lose their spot on a fat finger."
- Native chrome micro motion (pack 15, matching web Tailwind): mode pill tween 200ms with background and scale 1 → 1.05; chapter progress fill eases width over 75ms while the knob steps instantly; shared press scale `PRESS_MS` 150 with bezier(0.4,0,0.2,1); play/pause glyphs hollow (stroke only, lucide default); scrubber peek snippet in Inter italic; no haptic on mode switch.
- The body sets overscroll behavior none so pull to refresh can never reload the app and throw the reader away.
- View switching is currently five icon only buttons with title attributes. The commissioned "million dollar UX audit" flagged this as opaque and proposed folding them into one labeled "Reading style" sheet with per mode name, one line description, and a tiny live preview (explicitly NOT a hamburger, which would read as global navigation). Proposed, never built (open thread). The same audit's other two reader findings, the clipping focal word and the half receding chrome, were subsequently fixed by the fitMode work and the immersive mode.

---

## Iteration history

Chronological story beats across all sessions and the git record. Failures kept on purpose.

**2026-02-09, birth.** The MVP ships the pacing DNA in the initial commit: base delay 60000/wpm, the punctuation multipliers, the ORP ladder, the rAF accumulator loop, the reticle geometry, the focal letter pinned to centre via measured glyph width. Comments cite the RSVP research. None of these numbers has moved since.

**2026-02-13, the multi view reader, and a silent bug.** Tokenization arrives (words become TextTokens with precomputed multipliers), Sentence and Paragraph views are created with the sentence start extras (1.8x, 500ms, 1.5x line start) that still hold today. Two side effects go unnoticed: `[P]` markers stop becoming tokens, so `DELAY_PARAGRAPH` 5.0 goes dormant forever; and parseText drops its blank line handling, silently collapsing every book into ONE paragraph. That latent bug ships for three and a half months.

**2026-05-22 to 05-30, trail, theming, first gestures.** Ghost Trail is created (five ghosts a side, the 0.2 opacity ladder). The guides move from fixed grays to theme ink alphas. The first gesture layer lands with the constants that never changed: TAP 8px/250ms, SWIPE_PX 70, SWIPE_DOWN_PX 110 ("deliberately large"), pointercancel aborts all. `haptics.ts` is born with its stated philosophy: vibrate on commit moments only. The in file comment says the constants were picked for "feels right on a phone," not "passes a test."

**Late May, the bullet train session.** Michael's long brief frames the paradox: a spatial book versus a temporal stream. "We've built a bullet train for reading, but right now, the user has no easy way to check the map or change stops without bringing the whole thing to a grinding halt." Claude reframes: put spatial information back INTO the temporal stream. Confidence tiered chapter detection is prototyped and validated on seven books; the scrubber is commissioned and built to his spec (paragraph track, chapter chevrons, nine word peek, auto close); and while verifying it, the one paragraph bug from February is finally found, because paragraph snapping pinned every drag to word 0. Blank lines become `[P]` markers again (Frankenstein: 1 paragraph → 797). Committed ee64adc, 2026-05-31.

**The same arc: gesture wars on the storefront.** "not 1:1 responsive with the finger. there should be some weight to it" raises FOLLOW_TAU 0.09 → 0.17; he later calls that tuning perfect and erupts when a regression kills it ("FIX THIS IMMEDIATELY!!!"). The scroll versus select fight burns through failed approaches (per surface touch action; scrollAxis both with a 350ms hold that made cards feel dead, then killed pickup entirely) before landing on the platform aware time based model. The final phone only bug is implicit touch pointer capture dying when the lifted cover unmounted; the fix is keep it mounted and fade it. Michael tables the remaining edge cases: "it'll prbably change when we flip to android." Restart is deleted, per book progress lands, the reader gets the shared inner page header with collapse on play, and the Aa slider comes out. The session ends with the UX audit and the four part reader plan: a word that always fits, lights dim on play, gestures over keystrokes, one reading style choice.

**Early June.** The transcripts are deleted, but git shows no feel constant changes landed between 2026-05-31 and 2026-06-15. Whatever happened in those sessions, it produced no feel re decisions.

**2026-06-15, the centered focus saga.** The audit's critical finding ("Frankenstein" clips off the right edge at 56px on a 375px phone) gets attacked. Attempt one moves the focal pin to 33% left of centre, the Spritz reticle position, verified fitting with margin to spare. Michael rejects it flat the next day: "commencment is cut off, and I don't like the focused letter not being in the center... I want you to talk to me and play English and not use fancy words or acronyms." Full revert; the plain English rule is born; the memory note now says never reintroduce an off centre pin. Attempt two builds shrink to fit (canvas measured, floor for absurd words, margin widened 10 → 14 after live measurement). Michael keeps probing and lands on mid word coloring himself ("I mean coloring a letter further into the word, closer to its middle. lets try this for big words and I'll test it"). Then the pivot: make all four strategies a setting. Claude mines his research corpus into a comparison matrix (steady focal point is sacred; jitter is the "strobe light"; the no glance back nature of RSVP amplifies every unreadable word) and recommends Center long words. Michael overrules with his own lineup: centre every word becomes "Classic," first and default; the old clipping mode becomes "Compact" at a uniform 0.8x; every mode gets the shrink backstop so clipping is eliminated from the app entirely. Committed 3ff264a.

**2026-06-28, the storefront doctrine session.** "press = preview, release = action," the 24 degree peel, the spring (110/22) Michael tuned himself, prefetch on touchdown he built over a weekend, the 130ms hold so shelf scrolls survive, the rubber band follow (historical), freeze and fade on commit after "the book should stay floating the whole time" ("ahhh thats better"), the slot silhouette, haptics, the first reader swipe set (tap = play/pause then, swipe = sentence nav, strong swipe down = exit), and the protected gesture rule ("we put a lot of work into that interaction and I don't want to lose it"). Session dies on a context overflow before he can test the final mobile pass.

**2026-06-29, immersive mode QA.** Michael had Gemini build his two PRDs (Immersive Auto Hide, Skip Non Book Text) and asks Claude to "QA all of its work. You have my permission to unfuck anything it fucked." Immersive mode itself verifies solid (play fades chrome, peek without pausing, 3s re hide, focal word never fades). Two real bugs found and fixed: the back matter skip was dead code hidden by a hand fed fixture test (replaced with a real detector run through the real parseText pipeline), and Gemini's draggable progress slider bubbled into the swipe handler and fired a sentence skip on release that undid the scrub (slider and scrollbar roles added to the gesture bail out list). The defaults never override settings principle also lands here after a theme migration misstep: "obviously if someoen changes a setting it should stay that setting." Committed 60edcd3.

**Early July, the kinetic scrub arc (landed as be846a8, 2026-07-05; the session transcripts carry later timestamps and deployed v0.1.5/v0.1.6 to Pages).** It starts as a bug report: scrolling paragraph text ejected the reader. Fix: swipe down ignores drags starting on the designated text surface (the first attempt tested scrollHeight > clientHeight and failed when a paragraph exactly fit). Then his own idea: pause playback on scroll. Then the big voice dictated ask: iOS date picker physics in every view. The shared engine ships; the first Focus reel has always visible neighbors and a snap landing; he flags both plus the play after flick bug ("very disconcerting"; "I don't want it to snap"; "the play doesn't actually play"). The fix round ties neighbor opacity to live speed, adds the 260ms settle, and makes Play cancel the coast (measured lurch: zero). He delivers the golden standard quote. Sentence view takes three rounds: the original stepper ("chop, chop, chop, chop, chop"), a continuous reel that read DOM geometry per frame (passed synthetic checks, "it still feels choppy" on device), and finally the imperative translate3d version with canvas measured widths, which ends the complaint. The paragraph barrier is designed by Michael out loud and built as OVERSCROLL_MIN, the velocity tiers, and the 420ms momentum kill. Mid arc, a stale service worker burns two debugging rounds (his phone was pinned to a cached build while the fixes were live), which is why the version stamp exists on Today and why `expo.version` gets bumped every native round.

**2026-07-05 onward, the Android conversion.** Michael kills the WebView idea permanently and sets the bar: "It's important to me that everything feels butter smooth and therefor uses as many native components as possible." The doctrine becomes "keep the recipe, not the code": rebuild every gesture and visual natively on the UI thread, carry over only pure logic and the tuned constants verbatim, and never start from reanimated's built in decay physics. The feel spike (word engine plus flick scrub, three books, constants verbatim, drag density guessed) goes to his phone through an Expo Go SDK dance; his verdict: "the feel is mostly there, we'll dial it in later. start the full conversion please." The overnight port builds all five modes, per mode gestures, and the fading chrome; his instruction: "I don't have time to check it. you QA and then keep on building until your can't anymore. I expect to see a massive lift when I come back." The parity audit that follows catches the progress only saved on exit bug and produces the ranked gap list; "go and attack that gap list!" ports chapter intelligence and the scrubber, with the by thumb gesture set (pickup, peel, swipe down exit, drawer) deliberately parked for a device pass.

**2026-07-11/12, native reconciliation.** Michael's device report names three reader bugs at once: Focus words jumping vertically, Trail words overlapping, Sentence reading at "1000 wpm" set to 300. All three are rendering, not timing: the `interacting` gate pins displays to the committed index during playback, Trail becomes one centred row, Sentence goes analytic. Fixed in 42e3fda; a setState during render crash from the session tracker follows in 56db3d1. The session also bans the Expo web build as a feel proxy after it hijacked his Brave browser with blank tabs ("is this consequential at all? I'm building a native app here").

**2026-07-13, random stops, three attempts.** "The pacing is all off, it stops longer in random places." Attempt one audits the pacing rules: all already matched web. Attempt two removes the 64ms playback delta cap and memoizes the control bar: the React.memo wrappers crash on device ("Component is not a function (it is Object)") and the stops persist; he says only "try again." Attempt three finds the re registering frame worklet, the true root cause, and fixes it for good (1ad5ac3, v0.7.2). "you QA it and test it" produces the automated side by side timing proof (16/16, millisecond identical; old engine ~142ms random extra hold per word) rather than another round of his time. Lesson: after two failed feel fixes, he expects the assistant to prove the fix itself before handing it back.

**2026-07-13, the parity packs.** Sixteen audit derived packs (docs/native-parity) re anchor every native detail to the web: full end of book dwell and live WPM reset (06), spatial gesture zoning replacing the axis fences (07), real text measurement and centred trail and sentence geometry (08), web parity progress saves and session accounting (10), paragraph crossfade and pill (14), chrome easings and the mode switch haptic removal (15). Each pack encodes one deliberate feel decision annotated against a specific web code path, and the deliberate divergences are marked in code comments.

**In parallel: the scrubber gets content.** The scene map system grows from Michael's YouTube timestamps idea through several hard rejections (the Ollama generator: "what in the fuck are you talking about a llama for?"; the days long hand reading grind: "this seems like overkill"; any cloud pipeline: "I don't want any pipelines i want it done locally") to the settled shape: human authored, spoiler safe labels and recaps sampled from the locally mirrored chapter openings, bundled in scenes.json, top 100 Popular books covered (67 of 100 at last count, 71 books, 728 beats), with runtime chapter detection covering everything else. Accuracy beats coverage: skip a book rather than guess.

**Also in parallel: instant open and Android hygiene.** The five second cozy corner opens produce the mirror architecture and three tier fetch ladder after "NO I NEED you to think harder about this." The Android readiness audit adds the visibilitychange pause and the overscroll lock. Settings gains the default WPM chips and the relocated Reading display modes.

---

## Constant evolution timeline

The condensed git archaeology. Web first, then native.

| Date | Where | What moved | Why |
|---|---|---|---|
| 2026-02-09 | web initial commit | Delay multipliers, ORP ladder, rAF accumulator, reticle geometry born | MVP baseline from RSVP research; never re tuned since |
| 2026-02-13 | web a573b6a | Tokenizer; sentence extras 1.8x/500ms/1.5x born; Sentence fade machine (150ms) and Paragraph view created. Side effects: DELAY_PARAGRAPH goes dormant; blank line handling lost (one paragraph bug, latent) | Multi view reader needed sentence breathing room |
| 2026-05-22 | web 2295fac | Ghost Trail born: TRAIL_COUNT 5, 0.2 opacity ladder, 0.82x ghosts, 8px gap | Mobile tap interactions round |
| 2026-05-25 | web a585051 | Guide/ghost colors: fixed grays → theme ink alphas (bars 14%, lines 22%) | Cozy palette in both themes; no timing changes |
| 2026-05-30 | web 4a555e4 | First gesture layer: TAP 8/250, SWIPE_PX 70, SWIPE_DOWN_PX 110; haptics tick 5ms / commit 12ms / error [10,60,10] | "feels right on a phone"; big swipe down so scroll attempts never exit |
| 2026-05-31 | web ee64adc | Blank lines → [P] restored (one paragraph bug fixed); chapter detection; scrubber ships | Paragraph snapping exposed the February bug |
| ~this arc | web BookOpenTransition | FOLLOW_TAU 0.09 → 0.17 | "there should be some weight to it"; later defended as perfect |
| ~this arc | web pressGesture.ts | TOUCH_SLOP 14 → 18 → 22; holdMs 130 kept (350 tried and abandoned); platform aware model replaces direction/axis approaches | The scroll versus select wars |
| 2026-06-15 | web 3ff264a | **Re decision:** default focal placement ORP 0.3 → MIDDLE_FRACTION 0.5 (Classic); BIG_WORD_MIN_LENGTH 11, COMPACT_SCALE 0.8 born; fit backstop (margin 10 → 14, floor) | The centered focus saga; off centre pin banned |
| 2026-06-29 | web 60edcd3 | Immersive mode born: fade 100ms after play, idle 3000ms; readable bounds clamp; slider roles in gesture bail out | His PRDs plus the Gemini QA |
| 2026-07-05 | web be846a8 | **Re decision:** Sentence fade machine deleted for the kinetic strip. Engine born: FRICTION_K 0.0035, HANDOFF_V 0.004, MAX_V 0.4, SETTLE_MS 260, SAMPLE 90, dt clamp 64. Reel: NEIGHBORS 4, NEIGHBOR_FULL_SPEED 0.02, rowHeight 1.5x. Paragraph: OVERSCROLL_MIN 34, WHEEL_MIN 90, V_TWO 0.9, V_THREE 1.5, LANDING_MS 420, enter 28+42/300+150 | The kinetic scrub arc; none of these has moved since |
| 2026-07-05 | native 2d6ae89, 78340a8 | Pacing DNA ported verbatim; engine born with web physics verbatim but PX_PER_STEP guessed at 18/22; IDLE 3000 / PLAY_FADE 100; axis fences ±12/±24 | The feel spike; "keep the recipe, not the code" |
| 2026-07-09 | native 52c0613 | Progress saves at every safe boundary, not only exit | Android kills processes without cleanup |
| 2026-07-10 | native 7cc4933 | Readable span, chapter detection, semantic haptics (tick=selection, commit=impact Medium, error=notification) | Web parity; commit only discipline quoted verbatim from web source |
| 2026-07-12 | native d1640f5 | **Re decision:** PX_PER_STEP_Y 18 → 84, X 22 → 117, per mode overrides; font 56, web geometry throughout; WPM step ±25 → ±50; SWIPE_DOWN_PX 110 added; tap always peeks | Spike guesses re anchored to measured web values |
| 2026-07-12 | native 42e3fda | `interacting` gate (pin to index during playback); trail one centred row; sentence analytic widths; gap 0.4em → 0.5em (later reverted) | The three device bugs in one report |
| 2026-07-13 | native 1ad5ac3 | Frame worklet memoized once per mount; RAW playback delta (64ms cap fling only); useReelFrame single value; hydration to true opening position | "stops longer in random places" root cause; v0.7.2 |
| 2026-07-13 | native packs 06 to 15 | Full end dwell, WPM reset, reduce motion snaps (06); zoning replaces axis fences, SCRUB_ACTIVATE_PX 2, sentence pxPerStep 117 → 116, gap back to 0.4em (07); real measurement, ghost floor 0.06 → 0.04, GHOST_LANE 4000, trail −4 nudge (08); zero span discard, changed index saves (10); paragraph crossfade 100ms, 0.25em gap (14); chrome bezier easings 300/200/75ms, mode switch haptic removed (15) | Each pack annotated against a specific web code path |

---

## Rejected approaches

Do not re propose any of these. Each died for the reason given.

Physics and rendering:

- Always visible neighbor words in the Focus reel, or neighbors at a static opacity while flicking ("very disconcerting").
- Hard snap to the nearest word at fling end ("I don't want it to snap").
- Letting an in flight fling keep coasting after Play is pressed (made Play feel broken).
- Sentence view as a word by word highlight stepper ("chop, chop, chop, chop, chop").
- Per frame DOM geometry reads (offsetLeft, offsetWidth) or per frame React renders in any motion path (passed synthetic checks, failed on device, twice).
- Async onLayout measurement for native strip positions (the 1000 wpm illusion).
- The EM_FACTOR 0.58 estimated width heuristic on native (overlapping ghosts, uneven gaps, "CHAPT…" truncation); real measurement only.
- Driving playback word position from the continuous `pos` shared value, or splitting window and offset across two values (blanks and lurches).
- Inline non memoized useFrameCallback worklets, and unguarded shared value writes in the frame callback.
- Capping the playback frame delta at 64ms (the cap is for fling physics only).
- React.memo on native reader components (crashes on device: "Component is not a function (it is Object)").
- Auto advancing paragraph on merely touching the bottom edge, or letting momentum bleed into the next paragraph.
- Native axis fences (activeOffset/failOffset) for the scrub; replaced by spatial zoning plus the release time dominance resolver.
- Reanimated or gesture handler built in fling and decay physics as the starting point (friction model differs from the tuned feel).

The focal word:

- The off centre focal pin at 33% (the Spritz reticle position). Fully implemented and verified, then rejected the next day. Never reintroduce an off centre pin.
- Dynamic per word resizing as the default ("would break the focus"; the research calls size pulsing the strobe light). Opt in mode and silent backstop only.
- Letting long words clip or fade at the edge (clipping was eliminated from the app entirely).
- Landscape rotation for width (Michael raised and rejected it himself: less comfortable to hold).
- Splitting a monster word across two frames at a syllable boundary (offered twice, never commissioned).
- Moving the on screen pin rightward (analyzed: makes fitting worse, the right side is the crowded side).
- A window resize re fit listener in useFitFontSize (wedged capture, useless on a portrait phone).

Gestures:

- WebView or TWA wrapper for Android. Rejected firmly, twice. The plan of record is full React Native conversion.
- Reusing web gesture or UI code in the native app ("keep the recipe, not the code").
- Firing the book lift instantly on pointerdown (ate horizontal shelf swipes); letting the lifted cover be dragged freely anywhere; the rubber band follow is superseded by the weighted low pass (FOLLOW_TAU).
- scrollAxis 'both' with a 350ms long press on browse cards (cards felt dead, then pickup died everywhere).
- Direction based swipe versus select disambiguation (it is time and platform based, like native apps).
- Per surface touch action tuning as the scroll fix (insufficient), and setPointerCapture as a universal fix (mouse only; touch relies on implicit capture with the element kept mounted).
- Unmounting an element that holds implicit touch pointer capture mid gesture (fires pointercancel, kills finger follow).
- Long press to bookmark (conflicts with press and hold lift).
- Changing a beloved gesture to achieve accessibility (use a parallel autoCommit path instead).
- Tap to pause during playback (replaced by peek tap; revisit only if user testing demands it).
- Testing scrollable surfaces with `scrollHeight > clientHeight`.
- Reverting to the last good commit to escape a gesture regression (fix forward; the only reverts are ones Michael orders himself when iteration has drifted).

Navigation and content:

- A TOC modal or spatial grid as primary navigation ("shatters the exact immersion the tool is designed to build"); a full TOC survives only as a demoted escape hatch.
- Spatial progress readouts ("Word 45,000 of 100,000") as wayfinding.
- Keeping a Restart control in the reader (fat finger risk; deleted, the scrubber's start is the only start over).
- A hamburger in the reader header (reads as global navigation; the plan is a labeled Reading style sheet), and keeping the Aa slider in the reader header (stripped pending the controls rework).
- Single regex chapter detection, and the "tight cluster near the top" TOC heuristic (both failed empirically; dialect matchers plus dedupe by chapter number won).
- Any AI model pipeline for scrubber summaries: the local Ollama generator was built and flatly rejected; cloud pipelines refused twice; hand reading whole books killed as overkill. Summaries are human authored from sampled chapter openings, or absent.
- Guessing recaps for unknown books (accuracy beats coverage; skip instead).
- IndexedDB caching alone as the fix for slow book opens (only helps the second open; the mirror plus fetch ladder is the answer).

Motion and craft (stated on the bookmark, generalized doctrine):

- Dramatic interaction animations (~50% growth). Micro motions of 10 to 20 percent only.
- Motion that detaches an element from its physical anchor ("very immersion breaking").
- Faking physicality with shaders, gradients, or shading layered on flat art; do real geometry or stay flat and clean.
- Overbuilt state change motion nobody asked for (the minimum motion that tells the physical story).

Process:

- Persist migrations that override a user's chosen setting.
- Haptics on every tap or on cancel; haptics on reader mode switches (removed in pack 15).
- Verifying native feel through the Expo web build, or any QA that opens tabs in his real browser.
- Hand fed test fixtures that bypass the real parse pipeline (false positive green on the back matter bug).
- Debug chrome visible in anything Michael sees on device (the GestureHud is gone).
- Jargon and acronyms in explanations to Michael ("play English"); vague hedging (he wants direct).

---

## Open threads

Things Michael wanted or was owed that never landed. Check these before proposing new feel work.

- **The native feel dial in session.** "we'll dial it in later" never happened. Native drag sensitivity leans (twitchy versus heavy) per axis, flick feel, and pacing rhythm at 600+ wpm all await his device verdict, as does on device confirmation of the v0.7.2 pacing fix and the three reader display fixes. Nothing built after the spike has met his thumb. **2026-07-19 (v0.7.14): a touch-feel round landed from a 37-agent audit of the native touch layer against the web spec (Michael: "it still doesn't feel right... a user scrolling through words, starting and stopping, what hides when").** Two shipped commits, both device-unverified (feel is device only), both revertible on their own: (1) the scrub engine now measures release velocity the web's way — a secant over its own trailing 90ms of clamped position samples, with the web's 135ms stale-hold zero — instead of trusting Android's recency-weighted VelocityTracker (an ease-off before lift-off was launching hotter than web, and a deliberate stop could still fling); it also folds back the pre-activation finger travel RNGH drops at activation, backdates the slow-release settle so it starts on the release frame (was one frame late; easeOutCubic is steepest at p=0), adds `maxPointers(1)` so a second finger can't yank the reel to the two-finger midpoint, and settles-to-nearest in onFinalize when a drag is cancelled before onEnd. (2) The Focus reel drag/fling render moved to the UI thread (see the JS-hop thread below). Deferred by design this round to stay bisectable: the chrome-band swipe coverage (below).
- **Chrome bands are swipe-dead on native (deferred from v0.7.14).** The audit confirmed: on web the whole `<main>` (chrome bands included) feeds the release-time swipe resolver, so a sentence-skip or swipe-down-exit that starts over the (hidden) bottom control band works; on native the resolver is scoped to the stage only, so those strokes die there, and a flick/slow-press over a band fires a spurious chrome peek instead. The hide/show TIMING is correct (100ms fade after play, 300ms, peek reveals, 3s idle, touch-down-to-scrub reveals chrome — all audit-verified); this is a zoning gap, not a timing one. The fix (hoist `Race(outerTap, resolver)` from the stage to the reader column, re-base ALL zone frames to column coords, add chrome-band + control-cluster hit-tests mirroring the web's `[role=slider]` bail, `simultaneousWithExternalGesture` against the two track pans, resolve the outer tap on final displacement for out-and-back parity, keep the sentence strip's taps silent) touches the working stage arbitration, so it was held back from the same round as the reel rewrite. Ready to implement.
- **Web-only: Play during a fling only cancels the coast in the Focus reel.** The playbook's guardrail ("Pressing Play cancels any in-flight fling first") is wired per-display and only `RSVPDisplay` has the `if (isPlaying) scrub.stop()` effect; `SentenceDisplay` and `GhostTrailDisplay` get no `isPlaying` and keep coasting after Play — the "the play doesn't actually play... very touchy" bug, still live on WEB in those two views. Native is correct engine-wide (`togglePlay` drops mode 2/3 for every mode). Fix is web-side: pass `isPlaying` to those two displays and add the same one-line guarded stop.
- **The by thumb native gesture set.** Finger follow book pickup, cover peel, swipe down exit polish, and the slide in drawer were deferred by design to an on device pass with Michael present.
- **The responsive book lift, on device.** The web mobile pickup was tabled with known rough edges ("it mostly works, still a few issues, but i think we just table for now as it'll prbably change when we flip to android"). **The native pickup and open transition SHIPPED 2026-07-13 (parity pack 09, `src/open/OpenTransition.tsx`)** carrying the protected constants (MAX_PEEL_DEG 50, spring 110/22, FOLLOW_TAU 0.17); that file is now the protected reference feel, do not rebuild it from this recipe. What remains open is only his on device verdict on the shipped implementation.
- **Should a paragraph break breathe?** DELAY_PARAGRAPH 5.0 sits dormant by design; he was asked directly and never answered. Paragraph ends currently pause only via the 3.0x sentence end hold.
- **Ghost Trail continuous reel.** Still steps word by word on web. The imperative reel rebuild was offered twice with no answer. It will fail his smoothness bar the moment he scrubs it hard.
- **Paragraph dual crossfade.** The old paragraph fading and floating up WHILE the new one fades in from below ("That'd be pretty sick"). Only the enter half exists.
- **Line wrap pacing is dead on both platforms.** LINE_START_MULTIPLIER 1.5 stopped firing on web when the kinetic strip stopped reporting line breaks, and was never wired on native (needs onTextLayout). Nobody has decided whether the wrap beat should come back.
- **Paragraph and reel feel constants on device.** OVERSCROLL_MIN, V_TWO, V_THREE, LANDING_MS, NEIGHBOR_FULL_SPEED eagerness, and SETTLE_MS were all flagged as thumb tunable; no feedback ever came. Same for the 240ms commit fade.
- **The Reading style sheet.** Folding the five opaque view icons into one labeled control with per mode name, description, and live preview (explicitly not a hamburger) was planned in the UX response and never built. It is also the parked text size control's designated future home.
- **The gesture coach.** Touch users still effectively get desktop keyboard hints; the planned one time coach ("Tap to pause · swipe to skip a sentence · swipe down to leave," shown once, fades after first play) was never built. Michael's wiggle affordance pattern is the approved teaching style.
- **Skim gear and time native wayfinding.** The 5 to 10x in stream fast skim for frontmatter, and readouts like "Chapter 7 · ~4 min left in chapter" (and the humane "about 8 minutes to the end of this scene" stopping points) were designed in discussion and never built.
- **Possible stutter at 800+ wpm** from the once per word JS hop in the native architecture; the known fix is fully native word rendering, queued and unverified. The hop got much lighter on 2026-07-18 (native v0.7.13): a word advance now re-renders only the display and the chapter progress readout, via an index subscription (`useReelIndex`), instead of the whole reader screen. **The scrub/fling half of "fully native word rendering" landed 2026-07-19 (v0.7.14):** while the finger drives the Focus reel, each row's offset and neighbour fade run in a UI-thread worklet off `pos`/`speed` (the web's per-frame frac math, zero JS hop), replacing the old `useReelFrame` per-frame `runOnJS(setReel)` that made the reel trail the finger (the native Sentence strip never trailed — it already read `pos` live — which is why the reel felt floatier in the same app). Contained: at rest and during playback the render is unchanged (one centred word pinned to the committed integer index), so only the scrub visual changed. The window is padded by `REEL_FLING_MARGIN` so a hard fling's live `pos` can't outrun the committed-index window and blank the reel. Awaiting Michael's device verdict; if the finger-down mount burst (the pool mounts on grab) reads as catch latency, the fallback is an always-mounted pool at the cost of N-row re-renders per playback word. PLAYBACK word rendering (the >800wpm case) is still the committed-index single-row path — fully native word rendering there remains queued.
- **Merging feat/native-ui-web-parity to master** waits on his device confirmation of the pacing.
- **Tap to read latency long game.** Streaming start (reading from the first downloaded chunk), Web Worker parsing, and build time pre split word streams were named as the biggest first open wins and deferred.
- **Reader hamburger/menu.** The reader menu control currently exits the book; a drawer that floats over the book was offered and left unresolved. Related: the reader controls rework Michael promised to "re examine" after stripping the Aa slider never happened.
- **Pinch zoom in the reader**: keep for accessibility or lock; flagged in the Android audit, never decided.
- **Cover inks stay pinned on native** (Michael's call); the web is supposed to port the pinning later.
- **Scene recap coverage.** Vibe books (~700) lack authored recaps; three duplicate top 100 editions could have recaps re anchored; the fitMode comparison matrix is stale after the rename and was never redone; "Compact" was Claude's name and Michael never blessed it; the offered one notch nudge of the mid word marker toward the front was never exercised.
- **Web QA scroll cost watch.** A dozen plus live SVG leather filters on the cover shelves might drop frames during fast flings on device; the offered fix is baking the leather to a cached image. No verdict.
- **If random stops ever return on native**, the two named suspects both LANDED on 2026-07-18 (native v0.7.13, commit 0a5d8c1): storefront screens now use focus gated store reads and stay quiet behind the reader, and the control bar was split so only the progress cluster subscribes to the word index (the crash safe form of the redraw trimming; React.memo stays banned). Also found and fixed in the same round: a hard fling was writing the store, with a full AsyncStorage serialize, once per crossed word per frame; fling saves now ride the same 2s cadence as playback, with boundary saves unchanged. If stops return, these are no longer suspects; the next one is the per word JS hop above.

---

## Web/native divergences

Where the two implementations intentionally differ today, and why. Everything not listed here is expected to match exactly.

- **Seek during a fling.** Native: a controls seek during fling or settle wins and drops the engine to idle (marked as a deliberate divergence from the web in `useReelEngine.ts`, ~line 492). Web: an in flight fling silently overrides the seek. The native behavior is considered the correct one.
- **The stuck scrubbing tap quirk.** The web can leave `dragging` set after a tap; native's onFinalize always clears it, so a stuck-true can never pin `interacting`. This differs in effect from the web reference behavior. If anyone fixes it on web, that is parity, not divergence.
- **Haptics vocabulary.** Web uses raw millisecond vibrations (5ms tick, 12ms commit, [10,60,10] error, Android only via navigator.vibrate, silent on iOS). Native deliberately maps the same three semantic moments to Android system effects (selectionAsync, impact Medium, notification Error). The commit only discipline is identical.
- **SCRUB_ACTIVATE_PX 2** exists only on native, as slack so finger noise cannot cancel presses; the web tracks from the first pointermove and needs none.
- **Swipe down to exit scoping.** Web suppresses it when a drag starts inside a vertical scroller. Native scopes it by mode: only Focus, Hybrid, and Trail, never from the Hybrid paragraph card, not at all in Paragraph or Sentence. Same intent (scrolling never exits), different mechanism.
- **Tap behavior outside the band.** Native dropped the spike's tap to play convenience; a stage tap always peeks chrome, like the web.
- **pxPerStep derivation.** Web computes from live fontSize at render; native hardcodes the equivalents (84/140/116) resolved per mode, derived from the fixed 56px reader font. If the font size setting ever returns, native must re derive.
- **The trail's −4px translateY nudge** reproduces the web's −8px margin content centring in native coordinates; the Focus reel deliberately does not share it on either platform.
- **Chrome easing implementation.** Web uses Tailwind utility transitions (300ms opacity ease out, 200ms pill, 75ms fill, 150ms press); native replicates the exact cubic beziers with reanimated withTiming. Same curves, different plumbing.
- **Line wrap pacing** is unwired on both platforms but for different reasons (web strip stopped reporting line breaks; native never measured lines). Not a divergence to "fix" one sided; it is a joint open thread.
- **Book pickup and the open transition** shipped on native 2026-07-13 (parity pack 09, `src/open/OpenTransition.tsx`) as the intended simpler rebuild, with the tuned constants (MAX_PEEL_DEG 50, spring 110/22, FOLLOW_TAU 0.17) carried over. The shipped file is the protected reference; treat the web's 544 line BookOpenTransition as history, not as a source to port.
- **Cover inks** are pinned on native by Michael's call; web ports the pinning later.
- **QA reach.** The web app is fully verifiable in a browser. The native app's web QA build (port 8090, never opening real browser tabs) covers boot, navigation, data, and resume only; reanimated's frame loop never runs on web, so playback pacing and gesture feel are device only, forever.
