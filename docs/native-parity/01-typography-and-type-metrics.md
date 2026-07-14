# Typography foundation: Inter italic faces and type metrics

**Done.** Implemented and committed as `ddfed5b` on `feat/native-ui-web-parity`, 2026-07-13, independent review passed with no unresolved findings. This foundation package brought the native Android storefront typography to exact parity with the web app: it loaded the Inter italic face, exposed it as a `FONTS.sansItalic` token that several later packages consume, and corrected a set of letter spacing and line height drifts across the storefront.

## What this fixed

Before this pack, the native app never loaded an Inter italic face at all. `App.tsx` loaded Fraunces 400, 400 italic, 500, 600 and Inter 400, 500, 600, 700 upright, so every italic on native fell back to `FONTS.serifItalic` (Fraunces_400Regular_Italic). That flattened the web's deliberate distinction between two italic voices: Inter sans italic is the metadata voice (subtitles, author lines, helper text) and Fraunces serif italic is the editorial voice (hero author line, today's pick blurb, recap text, empty states). On top of that, section and swimlane titles, numerals, card and row titles, author lines, and the Stats, About, and EmptyTab text blocks carried small letter spacing and line height drifts, and the Vibe out header's coffee icon bottom aligned instead of top aligning. This pack loaded a real Inter italic face, swept every metadata italic onto it, and nudged all the type metrics onto the web's computed values.

The first step was loading the face. `Inter_400Regular_Italic` (already shipped by the installed `@expo-google-fonts/inter` 0.4.2, no new dependency) was added to the import and the `useFonts` map in `App.tsx`, and a token was added to `FONTS` in `src/theme.ts`:

```ts
/** italic without font-serif on the web — the metadata voice (Inter italic). */
sansItalic: 'Inter_400Regular_Italic',
```

Files changed: `App.tsx`, `src/theme.ts`, `src/screens/TodayScreen.tsx`, `src/components/BookCard.tsx`, `src/components/rows.tsx`, `src/components/ui.tsx`, `src/screens/ResultsScreen.tsx`, `src/screens/StatsScreen.tsx`, `src/screens/SettingsScreen.tsx`, `src/screens/AboutScreen.tsx`, `src/screens/ReaderScreen.tsx`.

## What changed

### 1. Section subtitles, vibe row subtitles, and card/row author lines moved to Inter italic

On the web these strings are styled `italic` without `font-serif`, so they render in Inter italic: the Popular section subtitle 'The most read on Focus Reader' (`text-[12px] text-mocha italic mt-1`), the Vibe out section subtitle 'Pick a feeling, not a genre.' (same classes), each vibe row's subtitle (`block text-[12px] italic text-mocha mt-0.5`), the BookCard author line (`text-[11px] text-mocha mt-0.5 italic line-clamp-1`), and the RecentRow and BookRow author lines (`text-[11px] text-mocha italic line-clamp-1 mt-0.5`). Native was rendering all of them in `FONTS.serifItalic`. Switched `sectionSub` and the VibeRow subtitle in TodayScreen, the BookCard `author` style, and `rowAuthor` in rows.tsx (used by both RecentRow and BookRow) to `FONTS.sansItalic`. Sizes, colors, and margins already matched, so only the family changed.

This was a systematic substitution, so all 26 `FONTS.serifItalic` usages in the native repo were audited against the web class list. Serif italic was kept only where the web has both `font-serif` and `italic`: the Today hero author line, the today's pick blurb, the scene recap text, the note from the room quote, the Setting the table loading line, the EmptyTab body, the Library intros, the Stats hero pace line 'at about N words a minute', the About subtitle 'A calm place to read the classics.' and the About closing line 'Made with care, over many cups of coffee.', the vibe page intro and vibe hero author, and the generated BookCover author (web `BookCover.tsx` uses `font-serif italic`).

### 2. Search no results line moved to Inter italic

On the web (StoreFront.tsx:935) the line 'Nothing on the shelf for that. Try another title or author.' is a `<p>` with `text-center text-[14px] text-mocha italic py-10` inside the `font-sans` page root: Inter italic, 14px, mocha, 40px vertical padding, centered, no `font-serif`. Native was matching everything but the family, using `FONTS.serifItalic`. The Results screen no results Text now uses `FONTS.sansItalic`, size 14, centered, 40px vertical padding unchanged.

### 3. Two italic lines on the Stats page moved to Inter italic

On the web the benchmark card's line 'The same {pages} pages would take an average reader about {time}.' is `text-[11px] text-mocha/80 italic mt-2` (11px italic Inter), and the saved footnote '{n} book{s} saved for later in your Library.' is `text-center text-[12px] text-mocha italic mt-9` (12px italic Inter, centered, 36px top margin). Native had both on `FONTS.serifItalic`. Both now use `FONTS.sansItalic`; sizes, colors (mutedA(0.8) and textMuted), margins (8 and 36) and centering were already correct. The hero's 'at about N words a minute' line is serif italic on the web and stays serif italic on native, untouched.

### 4. Settings helper texts: subtitle typeface and system font sweep

On the web the Reading speed subtitle 'Used when you open a book. You can still change it while reading.' is `text-[12px] text-mocha/80 italic mb-3` (12px italic Inter), 'Currently {wpm} words a minute.' is 12px regular Inter with a `font-semibold tabular-nums` span, and the fit mode descriptions ('Every word colours a middle letter so it fits.' and friends) are `text-[12px] text-mocha/80 leading-snug` regular Inter. Native had the subtitle on `FONTS.serifItalic`, and the 'Currently …' outer Text and the fit mode description Text set no fontFamily at all, so they rendered in Roboto/system instead of Inter. The subtitle now uses `FONTS.sansItalic` at 12px; the 'Currently …' outer Text and the fit mode descriptions got `fontFamily: FONTS.sans`. The whole screen was swept, and those two were the only Texts without an explicit fontFamily. The About spillover was handled too: the body copy at AboutScreen.tsx:53-58 and the Getting around tip rows at AboutScreen.tsx:64-77 (both edited under issue 8 anyway) got `fontFamily: FONTS.sans`.

### 5. Type metric drift on Today: tracking and line heights

Corrected to the web's computed values. Section `h2` titles (Popular, Vibe out) are 22px `tracking-tight` = -0.025em = -0.55px, so `sectionTitle` letterSpacing moved from -0.4 to -0.55. Swimlane `h3` titles are 18px `tracking-tight` = -0.45px, so the swimlane title letterSpacing moved from -0.3 to -0.45. The 'Your Reading' stat numbers are 28px `leading-none`, so the 28px stat numbers got lineHeight 28 (they previously had none and took the taller platform default). The BookCard title is 14px `leading-snug` = 19.25px, so its lineHeight moved from 18 to 19. The RecentRow title is 15px `leading-snug` = 20.6px, so `rowTitle` lineHeight moved from 19 to 21. Fonts and weights (Fraunces 500/600, Inter 500/600) were already correct.

### 6. leading-none line heights on section, swimlane, and Reading now titles

The web's swimlane titles are `font-serif text-[18px] font-semibold tracking-tight leading-none` (line height exactly 18px) and the Today section titles are 22px `tracking-tight leading-none` (line height 22px). Native set no lineHeight on either. Swimlane title got lineHeight 18, Today `sectionTitle` got lineHeight 22, and the Stats 'Reading now' heading (same web style, StoreFront.tsx:1452, 18px `tracking-tight leading-none`) went to letterSpacing -0.45 with lineHeight 18. This matters because the 'see all' control is bottom aligned (flex-end) against these titles, so the extra default leading was shifting the baseline. `includeFontPadding: false` was added on these so Android does not clip descenders (the p in Popular) at the tight line height.

### 7. Row text metrics: author line height and tabular percent

On the web row titles are 15px `leading-snug` (20.625px) and author lines carry no leading utility, inheriting the Tailwind preflight default of 1.5, about 16.5px at 11px. The RecentRow percent label is `text-[10px] font-semibold tracking-[0.1em] tabular-nums`, so digits are fixed width and the label does not jitter. Native had `rowAuthor` with no lineHeight (tighter than 16.5 under RN defaults) and the percent label with fontSize 10, letterSpacing 1, `FONTS.sansSemiBold` but no tabular numerals. `rowAuthor` got lineHeight 16.5 and the percent label got `fontVariant: ['tabular-nums']`. Row sum check: title 21 + author 16.5 + 2 margin + 8 progress gap tracks the web's 20.6 + 16.5 + 2 + 8 within a pixel.

### 8. Stats, About, and EmptyTab line heights

Matched to the web's computed values. The Stats hero figure is 44px serif `leading-none`, so its lineHeight moved from 48 to 44; the four headline figures are 30px `leading-none`, so theirs moved from 33 to 30 (both with `includeFontPadding: false`). Unstyled web text inherits the preflight 1.5 line height, so: EmptyTab's 20px title got lineHeight 30 and its 10px footnote got 15; the About hero title (26px) got 39, the subtitle (14px) got 21, the Getting around tips (13px) got 19.5, and the GETTING AROUND label got 15; the Stats eyebrows and 10px labels got 15 and the benchmark 12px label rows ('You' / 'Average reader') got 18. The already matching paragraphs were left alone: the About body copy (14px, lineHeight 23, web `leading-relaxed`), the benchmark takeaway (web `leading-snug`, native 18), and the EmptyTab body (13px, lineHeight 21).

### 9. Coffee icon top aligns in the Vibe out header

On the web the Vibe out header row is `flex items-start justify-between` with the Coffee icon (size 18, `text-mocha/50`) given `mt-1`, so it sits at the top of the header, level with the title, while the Popular header is `items-end`. Native shared one `sectionHead` style with `alignItems: 'flex-end'` across both, so the icon (18, mutedA(0.5), marginTop 4 inert under flex-end) sat at the bottom, level with the subtitle. A `sectionHeadTop` style with `alignItems: 'flex-start'` was added and used only by the Vibe out header, so the icon's marginTop 4 now does its job and it sits level with the title. Popular keeps the flex-end `sectionHead`.

## Judgment calls

- **Reader open error detail switched too.** The `{error}` Text in the not ready branch of `src/screens/ReaderScreen.tsx` is plain italic in the web's Inter base stack (src/App.tsx:378), so it was switched to `sansItalic`. ReaderScreen was not a protected file this run.
- **One reader italic deliberately skipped.** The reader scrub peek snippet in `src/reader/ReaderChrome.tsx` (around line 260) uses `serifItalic`, but the web (Controls.tsx:205, `text-sm text-mocha italic`) is Inter italic. That file was owned by another active session this run, so it was left alone; a follow up should change that one Text to `FONTS.sansItalic`.
- **`includeFontPadding: false` applied more broadly than suggested.** It was added to every Text set to a lineHeight equal to its fontSize (Today section titles, swimlane titles, Stats Reading now, Today stat numbers, Stats hero and headline figures), not just the two Stats numerals, because Android clips glyphs at tight line heights and Popular has a descender.
- **Two extra Stats Texts got a fontFamily.** While adding issue 8's line heights to the Stats '{n} wpm' value and the 10px 'Average adult silent reading' footnote, both were given `fontFamily: FONTS.sans` (they had none and rendered in the system font), following the pack's own spillover principle. The benchmark takeaway paragraph still has no explicit fontFamily but sat on the do-not-touch list, so it was left; worth a later pass.
- **Fractional line heights kept as specified.** 16.5 and 19.5 were used directly; React Native accepts fractional values.
- **App version not bumped in this pack.** `app.json` was owned by another active session this run, so the `expo.version` bump was left to the commit step or that session.

## Check on your phone

- [ ] Confirm: on the home screen, the small lines under Popular and under Vibe out, and the author names under book covers and in rows, look like slanted plain text (Inter italic), while the big greeting area and the empty boxes still show the fancy bookish italic (Fraunces).
- [ ] Confirm: a search with no results shows 'Nothing on the shelf for that. Try another title or author.' in the plain slanted style at 14px.
- [ ] Confirm: on Stats, the two small italic lines near the bottom read in the plain slanted style, while the hero 'at about N words a minute' stays the fancy bookish italic.
- [ ] Confirm: in Settings, all the small helper text (including 'Currently N words a minute.' and the fit mode descriptions) looks like the same clean font as the rest of the app, not the system font.
- [ ] Confirm: the little coffee cup next to Vibe out sits up beside the title, while Popular keeps its 'see all' down at the bottom.
- [ ] Confirm: titles and rows everywhere look a hair tighter, the big Stats numbers sit snug in their boxes, and nothing looks clipped or cut off at the bottom of letters.

Everything else in this package was verified in code and by review.
