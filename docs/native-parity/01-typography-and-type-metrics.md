# Typography foundation: Inter italic faces and type metrics

> **Status: implemented and committed 2026-07-13.** Commit `ddfed5b` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings.


## Mission

Bring the native Android app's storefront typography to exact parity with the web app. Load the Inter italic face, expose it as a `FONTS.sansItalic` token, and sweep every surface where native wrongly renders Fraunces serif italic in place of the web's Inter sans italic. In the same pass, correct a set of small type metric drifts: letter spacing on section and swimlane titles, missing or wrong line heights on numerals, card titles, row titles, author lines, and the Stats, About, and EmptyTab text blocks, plus one flex alignment fix on the Vibe out header icon. This is the foundation package: several later parity packages consume the `FONTS.sansItalic` token you create here.

## Context

Focus Reader is a cozy speed reading app for public domain books. It shows a book one word at a time in a warm, coffeeshop styled interface.

There are two repos:

- Web app (READ ONLY source of truth for look and behavior): `C:/Users/Michael/Desktop/Focus Reader`. Never modify anything in this repo. Open its files freely to check classes, copy, and values.
- Native app (ALL changes go here): `C:/Users/Michael/Desktop/Focus Reader Android`. Expo SDK 54, React Native 0.81, reanimated 4, gesture-handler 2.28, zustand, expo-image, expo-haptics, lucide-react-native, react-navigation native-stack.

This is a full React Native app. Never introduce a WebView.

Typeface background you need:

- The web page root (`src/components/Input/StoreFront.tsx:684`) is `font-sans`, which per `tailwind.config.js:39-40` is Inter. `font-serif` is Fraunces.
- On the web, text styled `italic` WITHOUT `font-serif` renders in Inter italic. This is a deliberate design distinction: sans italic is the metadata voice (subtitles, author lines, helper text), serif italic (Fraunces) is the editorial voice (hero author line, today's pick blurb, recap text, empty state bodies, the Stats hero pace line, the About subtitle and closing line, the Library intro).
- The native app loads fonts in `App.tsx:49-52`: Fraunces 400, 400 italic, 500, 600, and Inter 400, 500, 600, 700 upright. No Inter italic face is loaded at all, which is why every italic on native fell back to `FONTS.serifItalic` (Fraunces_400Regular_Italic).
- Font tokens live in `src/theme.ts` in the `FONTS` object (around lines 93 to 108).
- The installed `@expo-google-fonts/inter` package (0.4.2) already ships `Inter_400Regular_Italic` (verified present in `node_modules/@expo-google-fonts/inter/400Regular_Italic`), so you can bundle a real italic face. No new dependency needed.

First step of the work: add `Inter_400Regular_Italic` to the import from `@expo-google-fonts/inter` in `App.tsx` and to the `useFonts` map, then add to `FONTS` in `src/theme.ts` a token such as:

```ts
/** italic without font-serif on the web — the metadata voice (Inter italic). */
sansItalic: 'Inter_400Regular_Italic',
```

Then apply the per issue changes below.

## Before you start

Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect branch `feat/native-ui-web-parity`.

Another session may hold uncommitted changes in `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, `src/reader/useReelEngine.ts`, and `app.json`, and there may be an untracked `metro.config.js`. Leave all of those alone. Read the current state of every file before editing it and do not revert changes you did not make. None of the files this package touches overlap with that list.

If a line number cited below has drifted, trust the described behavior and re-locate the code by searching for the copy string or style name.

## Issues to fix

### 1. Section subtitles, vibe row subtitles, and card/row author lines use Fraunces italic instead of Inter italic

Severity: medium. Scope: Today screen and everywhere BookCard and the list rows appear.

Web behavior (`C:/Users/Michael/Desktop/Focus Reader/src/components/Input/StoreFront.tsx` and `src/components/Input/BookCard.tsx`): the page body is `font-sans` (Inter). These strings are styled `italic` WITHOUT `font-serif`, so they render in Inter italic:

- Popular section subtitle 'The most read on Focus Reader', `text-[12px] text-mocha italic mt-1` (StoreFront.tsx:1108).
- Vibe out section subtitle 'Pick a feeling, not a genre.', same classes (StoreFront.tsx:1148).
- Each vibe row's subtitle, `block text-[12px] italic text-mocha mt-0.5` (StoreFront.tsx:114).
- BookCard author line, `text-[11px] text-mocha mt-0.5 italic line-clamp-1` (BookCard.tsx:118).
- RecentRow author line, `text-[11px] text-mocha italic line-clamp-1 mt-0.5` (StoreFront.tsx:236).
- BookRow author line, same classes (StoreFront.tsx:272).

Native behavior: all of the above use `FONTS.serifItalic` (Fraunces_400Regular_Italic):

- `src/screens/TodayScreen.tsx:451`, style `sectionSub`.
- `src/screens/TodayScreen.tsx:247`, the VibeRow subtitle Text.
- `src/components/BookCard.tsx:141`, style `author`.
- `src/components/rows.tsx:115`, style `rowAuthor` (used by both RecentRow and BookRow).

Change: switch those four to `fontFamily: FONTS.sansItalic`. Sizes, colors, and margins already match; only the family changes.

This is a systematic substitution, so audit EVERY `FONTS.serifItalic` usage in the native repo against the web class list. Keep `FONTS.serifItalic` only where the web has both `font-serif` and `italic`. Confirmed keep list: the Today hero author line, the today's pick blurb, the scene recap text, the EmptyTab body (`ui.tsx`), the Library intro line, the Stats hero line 'at about N words a minute', the About subtitle 'A calm place to read the classics.' and the About closing line 'Made with care, over many cups of coffee.'. Anything italic that is metadata (authors, subtitles, helper text, footnotes) moves to `FONTS.sansItalic`; issues 2 through 4 below name the known cases.

### 2. Search no results line uses serif italic instead of Inter italic

Severity: low. Scope: Results screen.

Web behavior (StoreFront.tsx:935): 'Nothing on the shelf for that. Try another title or author.' is a `<p>` with `text-center text-[14px] text-mocha italic py-10` inside the `font-sans` page root. Inter italic, 14px, mocha, 40px vertical padding, centered. No `font-serif` class.

Native behavior (`src/screens/ResultsScreen.tsx:114-117`): same copy, size (14), color (textMuted), padding (40) and centering, but `fontFamily: FONTS.serifItalic`.

Change: switch that Text to `FONTS.sansItalic`. Nothing else changes.

### 3. Two italic lines on the Stats page use serif italic instead of Inter italic

Severity: low. Scope: Stats screen.

Web behavior (StoreFront.tsx:1440-1442 and 1463-1468):

- The benchmark card's line 'The same {pages} pages would take an average reader about {time}.' is `text-[11px] text-mocha/80 italic mt-2`. That is 11px italic in the page's sans stack (Inter), not serif.
- The saved footnote '{n} book{s} saved for later in your Library.' is `text-center text-[12px] text-mocha italic mt-9`. That is 12px italic sans, centered, 36px top margin.
- By contrast the hero's 'at about N words a minute' IS serif italic on the web, and native already matches it. Do not touch that one.

Native behavior (`src/screens/StatsScreen.tsx:151-153` and `170-174`): both lines use `fontFamily: FONTS.serifItalic`. Sizes, colors (mutedA(0.8) and textMuted), margins (8 and 36) and centering already match; only the typeface differs.

Change: switch both to `FONTS.sansItalic`.

### 4. Settings helper texts: wrong typeface on the subtitle, system font on unstyled texts

Severity: low. Scope: Settings screen, with a spillover note for About.

Web behavior (StoreFront.tsx:1536, 1542, 1566):

- 'Used when you open a book. You can still change it while reading.' is `text-[12px] text-mocha/80 italic mb-3`. That is 12px ITALIC INTER (inherited `font-sans`), not serif.
- 'Currently {wpm} words a minute.' is 12px regular Inter with a `font-semibold tabular-nums` span for the number.
- The fit mode descriptions ('Every word colours a middle letter so it fits.' and friends) are `text-[12px] text-mocha/80 leading-snug`, regular Inter.

Native behavior (`src/screens/SettingsScreen.tsx`):

- Lines 115 to 117: the Reading speed subtitle uses `FONTS.serifItalic`.
- Lines 125 to 127: the 'Currently …' Text sets no fontFamily at all, so it renders in Roboto/system instead of Inter_400Regular. The inner semibold span is already correct (`FONTS.sansSemiBold` with `fontVariant: ['tabular-nums']`).
- Line 151: the fit mode description Text sets no fontFamily either.

Change: subtitle becomes `FONTS.sansItalic` at the same 12px. Give the 'Currently …' outer Text and the fit mode description `fontFamily: FONTS.sans`. Then sweep the rest of SettingsScreen: EVERY Text without an explicit fontFamily gets `fontFamily: FONTS.sans` (the web renders all of it in Inter).

Spillover: any React Native Text without an explicit fontFamily silently drops to the system font. The About screen has the same problem: the body copy at `src/screens/AboutScreen.tsx:53-58` and the Getting around tip rows at `AboutScreen.tsx:64-77` set no fontFamily, while the web renders both in Inter. Since issue 8 has you editing those exact Texts anyway, add `fontFamily: FONTS.sans` to them in the same pass.

### 5. Type metric drift on Today: section title letter spacing, stat number line height, card and row title line heights

Severity: low. Scope: Today screen, BookCard, list rows.

Web behavior:

- Section `h2` (Popular, Vibe out): 22px with `tracking-tight` = -0.025em = -0.55px (StoreFront.tsx:1107).
- Swimlane `h3`: 18px `tracking-tight` = -0.45px (StoreFront.tsx:199).
- 'Your Reading' stat numbers: 28px with `leading-none`, so line height 28px (StoreFront.tsx:1181).
- BookCard title: 14px `leading-snug` = 19.25px line height (BookCard.tsx:117).
- RecentRow title: 15px `leading-snug` = 20.6px (StoreFront.tsx:235).

Native behavior:

- `src/screens/TodayScreen.tsx:450`: `sectionTitle` has letterSpacing -0.4 (should be -0.55).
- `src/components/ui.tsx:103`: Swimlane title letterSpacing -0.3 (should be -0.45; line height handled in issue 6).
- `src/screens/TodayScreen.tsx:200`: the 28px stat numbers have no lineHeight, so they take the platform default, taller than 28.
- `src/components/BookCard.tsx:140`: title lineHeight 18 (should be 19).
- `src/components/rows.tsx:114`: `rowTitle` lineHeight 19 (should be 21; see issue 7).

Change: set letterSpacing -0.55 on the 22px section titles, letterSpacing -0.45 on the 18px swimlane titles, lineHeight 28 on the 28px stat numbers, lineHeight 19 on the 14px card titles, lineHeight 21 on the 15px row titles. Fonts and weights are already correctly mapped (Fraunces 500/600, Inter 500/600); this is pixel nudge polish only.

### 6. Swimlane and section titles missing the web's leading-none line height

Severity: low. Scope: Today screen and every swimlane (Library, Vibe pages).

Web behavior: swimlane titles are `font-serif text-[18px] font-semibold tracking-tight leading-none`, so letter spacing -0.45px and line height exactly 18px (StoreFront.tsx:199). The Today section titles are 22px `tracking-tight leading-none`, so -0.55px and line height 22px (StoreFront.tsx:1147).

Native behavior: `src/components/ui.tsx:103` sets letterSpacing -0.3 and no lineHeight; `src/screens/TodayScreen.tsx:450` sets letterSpacing -0.4 and no lineHeight.

Change: Swimlane title letterSpacing -0.45 and lineHeight 18. Today `sectionTitle` letterSpacing -0.55 and lineHeight 22. This matters beyond sub pixel fussiness because the 'see all' control is bottom aligned against these titles (flex-end on both platforms), so the extra default leading shifts the baseline alignment.

Also apply the same treatment to the 'Reading now' heading in `src/screens/StatsScreen.tsx` (around line 163): it is the same web style (StoreFront.tsx:1452, 18px `tracking-tight leading-none`) and natively has letterSpacing -0.3 with no lineHeight. Make it -0.45 with lineHeight 18.

### 7. Row text metrics: title and author line heights, percent label numerals

Severity: low. Scope: RecentRow and BookRow (`src/components/rows.tsx`).

Web behavior (StoreFront.tsx:235-241 and 271-272): row titles are 15px `leading-snug` (20.625px line height). Author lines carry no leading utility so they inherit the Tailwind preflight default of 1.5, about 16.5px at 11px (verified: no line height override anywhere in the web's src CSS). The RecentRow percent label is `text-[10px] font-semibold tracking-[0.1em] tabular-nums`, so digits are fixed width and the label does not jitter as the percentage changes.

Native behavior: `rowTitle` has lineHeight 19 (rows.tsx:114). `rowAuthor` has no lineHeight (rows.tsx:115), which is tighter than 16.5 under RN font defaults. The pct Text (rows.tsx:67) has fontSize 10, letterSpacing 1, `FONTS.sansSemiBold`, but no `fontVariant: ['tabular-nums']`.

Change: `rowTitle` lineHeight 21, `rowAuthor` lineHeight 16.5, and add `fontVariant: ['tabular-nums']` to the percent label (StatsScreen.tsx already uses fontVariant at lines 95, 105, and 123, so the pattern exists). These nudges change overall row height slightly; the web RecentRow content column is title 20.6 + author 16.5 + 2 margin + progress row with 8px top margin, so sanity check the sum still reads the same.

### 8. Stats, About, and EmptyTab line heights drift from web

Severity: low. Scope: Stats screen, About screen, EmptyTab in `src/components/ui.tsx`.

Web behavior: two kinds of cases.

- `leading-none` numerals: the Stats hero figure is 44px serif with line height exactly 44 (StoreFront.tsx:1387); the four headline figures are 30px with line height 30 (StoreFront.tsx:1402).
- Unstyled text inherits Tailwind preflight's 1.5 line height (verified: no line height override in the web's src CSS). So: EmptyTab's 20px title renders at line height 30 (StoreFront.tsx:127); About's 26px hero title at 39 and its 14px subtitle at 21 (StoreFront.tsx:1587-1588); the 13px Getting around tip rows at 19.5, making each row 12 + 19.5 + 12 = 43.5px tall (StoreFront.tsx:1607); the 12px and 10px eyebrow and label lines at 1.5x their size (18 and 15).

Native behavior: the hero figure has lineHeight 48 (`src/screens/StatsScreen.tsx:95`, 4px taller than web) and the headline figures lineHeight 33 (StatsScreen.tsx:105, 3px taller). The EmptyTab title (`src/components/ui.tsx:87`), the About hero title and subtitle (`src/screens/AboutScreen.tsx:46-47`), the tip rows (AboutScreen.tsx:64-77), the benchmark labels (StatsScreen.tsx:122-123) and the eyebrows set NO lineHeight, so they sit at the font's natural metrics, roughly 1.2x, tighter than web's 1.5. For example the tip rows come out around 40px tall versus web's 43.5, and the EmptyTab title box around 24px versus web's 30.

Change, matching web's computed values:

- Stats hero figure: lineHeight 44 (add `includeFontPadding: false` if Android clips descenders at fontSize equal to lineHeight).
- Headline figures: lineHeight 30 (same includeFontPadding caveat).
- EmptyTab title (20px): lineHeight 30.
- About hero title (26px): lineHeight 39. About subtitle (14px): lineHeight 21.
- Getting around tips (13px): lineHeight 19.5, round to 20 if the fractional value renders oddly.
- 12px labels (for example the benchmark 'You' / 'Average reader' rows): lineHeight 18. 10px eyebrows and uppercase labels: lineHeight 15.

Do NOT touch the paragraphs that already match: the About body copy (14px, lineHeight 23, web `leading-relaxed`), the benchmark takeaway (web `leading-snug`, native 18), and the EmptyTab body (13px, lineHeight 21). Those set explicit leading on the web and native already mirrors them.

### 9. Coffee icon in the Vibe out header bottom aligns instead of top aligning

Severity: low. Scope: Today screen.

Web behavior (StoreFront.tsx:1145-1151): the Vibe out header row is `flex items-start justify-between` with the Coffee icon (size 18, `text-mocha/50`) given `mt-1`, so the icon sits at the TOP of the header block, roughly level with the 'Vibe out' title. The Popular header, by contrast, is `items-end`.

Native behavior (`src/screens/TodayScreen.tsx:173-178` and the `sectionHead` style at line 449): both headers share `s.sectionHead` with `alignItems: 'flex-end'`, so the Coffee icon (18, mutedA(0.5), marginTop 4, which is inert under flex-end) sits at the BOTTOM of the header, level with the subtitle.

Change: give the Vibe out header its own row style with `alignItems: 'flex-start'` (keep the icon's marginTop 4, which now does its job) while the Popular header keeps flex-end. Icon size and color already match.

## Acceptance checklist

- [ ] 1. The Popular and Vibe out subtitles, each vibe row's subtitle, and every card and row author line render in Inter italic (light, geometric slant), not Fraunces italic, while the hero author line, pick blurb, recap, EmptyTab body, Library intro, Stats hero pace line, and About subtitle and closing line stay Fraunces italic.
- [ ] 2. The search no results line 'Nothing on the shelf for that. Try another title or author.' renders in Inter italic at 14px.
- [ ] 3. On Stats, the 'The same N pages would take an average reader about …' line and the 'N books saved for later in your Library.' footnote render in Inter italic; the hero's 'at about N words a minute' stays Fraunces italic.
- [ ] 4. In Settings, the Reading speed subtitle is Inter italic, and every other Text on the screen (including 'Currently N words a minute.' and the fit mode descriptions) renders in Inter, not the system font; the About body copy and tips also render in Inter.
- [ ] 5. Section titles carry letterSpacing -0.55, swimlane titles -0.45, the Your Reading stat numbers sit at lineHeight 28, card titles at lineHeight 19, row titles at lineHeight 21.
- [ ] 6. Swimlane titles and Today section titles have lineHeight equal to their font size (18 and 22), and the 'see all' baseline alignment visibly tightens; the Stats 'Reading now' heading matches too.
- [ ] 7. Row author lines sit at lineHeight 16.5 and the percent label uses tabular numerals so it does not jitter between values.
- [ ] 8. The Stats hero and headline numerals sit at lineHeight 44 and 30 with no clipped descenders; EmptyTab title, About title and subtitle, tips, labels, and eyebrows use 1.5x their font size, so cards and rows land within a pixel of the web heights.
- [ ] 9. The Coffee icon in the Vibe out header sits at the top of the header, level with the title, while the Popular header keeps its bottom aligned 'see all'.

## Verification

Type check with `npx tsc --noEmit` in `C:/Users/Michael/Desktop/Focus Reader Android` and fix any errors you introduced.

Then reason through the running behavior carefully: confirm the new font key is loaded before use (App.tsx blocks first paint on `useFonts`), confirm every changed style still compiles under StyleSheet, and re-read each changed line against the web value cited above.

Do NOT use the Expo web build to verify anything. Its dev server opens blank localhost tabs in the real browser and the web bundle breaks on zustand's import.meta. On device checking is done by Michael on his Android phone.

End your summary by telling Michael exactly what to look at on his phone, in plain everyday English. Suggest checks along these lines: on the home screen, the small line under Popular and under Vibe out should now look like slanted plain text, matching the author names under the book covers, instead of the fancy bookish italic. The fancy italic should still appear on the big greeting area and inside the empty boxes. In Settings, all the small helper text should look like the same clean font as the rest of the app. On the Stats page, the two small italic lines near the bottom change to the plain slanted style, and the big numbers should sit a touch tighter in their boxes. On the home screen, the little coffee cup next to Vibe out should now sit up beside the title instead of down by the subtitle. Titles and rows everywhere should look a hair tighter, nothing should look clipped or cut off at the bottom of letters.

## Final note

When summarizing work for Michael, use plain everyday language, no jargon, and avoid dashes in prose. Use commas or periods instead.

---

## Outcome, recorded 2026-07-13

Implemented in commit `ddfed5b` on `feat/native-ui-web-parity` in the native repo.

Files changed: `App.tsx`, `src/theme.ts`, `src/screens/TodayScreen.tsx`, `src/components/BookCard.tsx`, `src/components/rows.tsx`, `src/components/ui.tsx`, `src/screens/ResultsScreen.tsx`, `src/screens/StatsScreen.tsx`, `src/screens/SettingsScreen.tsx`, `src/screens/AboutScreen.tsx`, `src/screens/ReaderScreen.tsx`.

### Issue by issue

**1. Section subtitles, vibe row subtitles, and card/row author lines move to Inter italic** (done)

Switched sectionSub and the VibeRow subtitle in TodayScreen, the BookCard author style, and rowAuthor in rows.tsx to FONTS.sansItalic. Audited all 26 serifItalic usages in the repo against the web classes. Kept serif italic where the web has font-serif italic: hero author lines, today's pick blurb, scene recap, note from the room quote, Setting the table loading line, EmptyTab body, Library intros, Stats hero pace line, About subtitle and closing line, vibe page intro and vibe hero author, and the generated BookCover author (web BookCover.tsx uses font-serif italic). Two extra audit finds handled under decisions.

**2. Search no results line to Inter italic** (done)

ResultsScreen no results Text now FONTS.sansItalic, size 14, centered, 40px vertical padding unchanged.

**3. Two Stats italic lines to Inter italic** (done)

The benchmark 'would take an average reader' line and the saved for later footnote now FONTS.sansItalic. The hero 'at about N words a minute' line stays serif italic, untouched.

**4. Settings helper texts: subtitle typeface and system font sweep** (done)

Reading speed subtitle now FONTS.sansItalic. The 'Currently N words a minute' outer Text and the fit mode descriptions got fontFamily FONTS.sans. Swept the whole screen: those were the only two Texts without an explicit fontFamily. About spillover done too, body paragraphs and tip rows got FONTS.sans.

**5. Type metric drift on Today: tracking and line heights** (done)

sectionTitle letterSpacing now -0.55, Swimlane title -0.45, Your Reading stat numbers lineHeight 28, BookCard title lineHeight 19, rowTitle lineHeight 21.

**6. leading-none line heights on section, swimlane, and Reading now titles** (done)

Swimlane title lineHeight 18, Today sectionTitle lineHeight 22, Stats 'Reading now' letterSpacing -0.45 with lineHeight 18. Added includeFontPadding false on these so Android does not clip descenders like the p in Popular at the tight line height.

**7. Row text metrics: author line height and tabular percent** (done)

rowAuthor lineHeight 16.5, percent label got fontVariant tabular-nums. Row sum check: title 21 + author 16.5 + 2 margin + 8 progress gap tracks the web's 20.6 + 16.5 + 2 + 8 within a pixel.

**8. Stats, About, and EmptyTab line heights** (done)

Stats hero figure lineHeight 44 and headline figures 30, both with includeFontPadding false. EmptyTab title lineHeight 30 and its 10px footnote 15. About hero title 39, subtitle 21, tips 19.5, GETTING AROUND label 15. Stats eyebrows and 10px labels 15, benchmark 12px label rows 18. Left the already matching paragraphs alone: About body (23), benchmark takeaway (18), EmptyTab body (21).

**9. Coffee icon top aligns in the Vibe out header** (done)

Added sectionHeadTop (alignItems flex-start) used only by the Vibe out header, so the icon with its marginTop 4 sits level with the title. Popular keeps the flex-end sectionHead.

### Judgment calls made during implementation

1. Audit finds beyond the named cases: the reader open error detail (src/screens/ReaderScreen.tsx, the {error} Text in the not ready branch) is plain italic in the web's Inter base stack (web src/App.tsx:378), so I switched it to sansItalic since ReaderScreen is not a protected file. 2. The reader scrub peek snippet in src/reader/ReaderChrome.tsx (around line 260) uses serifItalic but the web (src/components/Reader/Controls.tsx:205, 'text-sm text-mocha italic') is Inter italic. That file is off limits this run, so I skipped it; a follow up should change that one Text to FONTS.sansItalic. 3. I added includeFontPadding: false to every Text I set to lineHeight equal to fontSize (Today section titles, swimlane titles, Stats Reading now, Today stat numbers, Stats hero and headline figures), not just the two Stats numerals the prompt suggested it for, because Android clips glyphs at tight line heights and Popular has a descender. 4. While adding issue 8's line heights to the Stats '{n} wpm' value and the 10px 'Average adult silent reading' footnote, I also gave them fontFamily FONTS.sans (they had none, so they rendered in the system font; this follows the prompt's own spillover principle of fixing fontFamily on Texts issue 8 already edits). The benchmark takeaway paragraph still has no explicit fontFamily but sat on the prompt's do-not-touch list, so I left it; worth a later pass. 5. Used the fractional line heights as specified (16.5 and 19.5); React Native accepts fractional values fine. 6. app.json version was not bumped because that file is owned by another active session this run; the commit step or that session should bump expo.version so Michael can verify the build.

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
