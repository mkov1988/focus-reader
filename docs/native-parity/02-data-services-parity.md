# Data and Services Parity: Catalog Titles, Cover URLs, Fetch Semantics, Hydration Gate

**Done.** Implemented and committed as `1546115` on `feat/native-ui-web-parity`, 2026-07-13, independent review passed with no unresolved findings. This package brought the native Android app's data and services layer up to the web's exact semantics: catalog title cleanup, cover art threading, search and download error behavior, download timeouts, and the cold start hydration gate.

## What this fixed

Before this pass, six data layer behaviors diverged from the web. The bundled catalog skipped the title cleanup pass, so 37 books showed raw MARC markers like "$b". Live search results and anything saved or resumed from them dropped the real publisher cover the web keeps. A failed live search popped an error card the web never shows. The book download failure message read "HTTP 404" instead of a full sentence. Native aborted slow downloads at 60 seconds that the web would let finish. And a cold start painted its first frame from store defaults, flashing the wrong theme and the wrong home page before snapping to persisted state. All six now match the web.

## What changed

### 1. Bundled catalog titles are now cleaned (37 books no longer show raw MARC markers)

The web maps every bundled catalog entry through `cleanTitle` at module load (`src/services/library.ts:45-49`):

```ts
const CURATED: BookMetadata[] = (curatedJson as BookMetadata[]).map((b) => ({
    ...b,
    title: cleanTitle(b.title),
    coverUrl: hostedCoverUrl(b),
}));
```

`cleanTitle` (web `src/services/gutendex.ts:37-43`) strips MARC subfield markers and collapses whitespace:

```ts
.replace(/\s*:\s*\$[a-z]\b\s*/gi, ': ').replace(/\s+\$[a-z]\b\s*/gi, ' ').replace(/\s+/g, ' ').trim()
```

Native previously exported `CATALOG = catalogJson as BookMeta[]` with no cleanTitle mapping, so 37 of 988 titles rendered verbatim in the Browse grid, localSearch results, Today lanes, the reader header, and were persisted raw into `progressById` and `savedById`. `CATALOG` in `src/services/library.ts` now maps every entry through `cleanTitle` at module load, matching web `library.ts`:

```ts
export const CATALOG: BookMeta[] = (catalogJson as BookMeta[]).map((b) => ({ ...b, title: cleanTitle(b.title) }));
```

`cleanTitle` already existed in native `src/services/gutenberg.ts:55-61`, character identical to the web's, and was imported into `library.ts`. This changes exactly 37 of 988 titles: id 16 "Peter Pan : $b [Peter and Wendy]" becomes "Peter Pan: [Peter and Wendy]", id 271 "Black Beauty : $b The autobiography of a horse" becomes "Black Beauty: The autobiography of a horse", id 2350 "His last bow : $b Some later reminiscences of Sherlock Holmes" is cleaned, and id 33016 has a double space collapsed. Because BookCover hashes title plus author for its generated fallback, cleaning the title also realigns the generated cover hash seed for those 37 books with the web. VibeScreen and `gutendexSearch` (`src/services/gutenberg.ts:95`) already cleaned their own paths, so only the bundled catalog path needed the fix. Already opened books keep the dirty title in Recents or Saved until reopened; progress records self heal on next open since updateProgress overwrites title, and saved records heal on re toggle. No migration was needed.

### 2. coverUrl is now threaded through BookMeta, live search results, and persisted records

`BookMetadata` on the web carries `coverUrl?: string` (`src/services/types.ts:17`), the live Gutendex search maps `coverUrl: b.formats['image/jpeg']` (web `src/services/gutendex.ts:75`), and that stored cover renders across Recents rows, the Today resume hero, and Saved rows, so a book saved or resumed from live search keeps its real cover everywhere. Native's `BookMeta` (`src/services/gutenberg.ts:13-21`) had id, title, author, downloads, textUrl, and words but no coverUrl, `gutendexSearch` dropped `formats['image/jpeg']` entirely, and the save and progress paths omitted it, so a live search book not in the mirror 404'd on the id keyed cover (`src/components/BookCover.tsx:71`: `uri = coverUrlProp ?? coverUrl(id)`) and fell back to the generated cover everywhere.

The fix, end to end: added `coverUrl?: string` to `BookMeta` in `src/services/gutenberg.ts`; mapped `coverUrl: b.formats?.['image/jpeg']` in `gutendexSearch`; passed `coverUrl={book.coverUrl}` to BookCard in `ResultsScreen`; persisted `coverUrl: book.coverUrl` in `ReaderScreen.saveNow` and `SaveButton.toggleSaved` (the store's `ReadingProgress` and `SavedBook` interfaces already declared it at `src/store.ts:23` and `:32`); and read it back everywhere the web does, in `src/components/rows.tsx` (`progressToBook`, RecentRow's BookCover, BookRow's BookCover), `src/screens/LibraryScreen.tsx` saved rows, and the `src/screens/TodayScreen.tsx` resume hero (both the BookMeta and the BookCover). The floating cover in `src/open/OpenTransition.tsx` also got `coverUrl` so it does not swap mid animation (recorded as a judgment call below). For the 988 bundled books nothing changed visually since both platforms use the id keyed mirror plus generated fallback; this only shows on live Gutendex search hits and anything saved or resumed from them.

### 3. A failed live search now shows the quiet empty state instead of an error card

On the web, `webLibraryService.search` (`src/services/library.ts:148-158`) runs localSearch first and, on zero local hits, calls `gutendex.search` inside try/catch and returns `[]` on any failure, so the error card copy "Search failed. Please check your connection and try again." is never reached for a text search. An offline search renders only the italic centered empty state "Nothing on the shelf for that. Try another title or author." Native previously called `gutendexSearch` directly, which throws `Search failed (${res.status})` on failure or a network TypeError when offline, so an offline search rendered both the dismissable accent tinted error card and the empty state line below it.

A shared async `search(q)` helper was added to `src/services/library.ts` mirroring `webLibraryService.search`: localSearch first, then `gutendexSearch` inside try/catch resolving to `[]`. `ResultsScreen.run` now calls it, so a failed or offline search shows only the "Nothing on the shelf for that. Try another title or author." empty state with no error card. The empty state copy already matched word for word, and the error card code stays in place for genuinely unexpected failures.

### 4. Download failure copy now reads the full web sentence instead of "HTTP 404"

The web's tier 3 fetch (`src/services/library.ts:199`) throws `Could not download the book (${res.status}).`, shown verbatim in the error UI's italic detail line alongside its two siblings "No readable plain-text edition is available for this title." and "The downloaded file appears to be empty." Native's `fetchText` previously threw `HTTP ${res.status}` for both tier 2 and tier 3, so the reader error screen showed "HTTP 404", and a timeout abort surfaced the raw "Aborted" text.

`fetchText` now throws `Could not download the book (${res.status}).` on a non ok response. This is safe for tier 2 because those failures are swallowed on both platforms (web's fetchHostedBook returns undefined, native's try/catch falls through to tier 3). Any abort rejection is remapped to `Could not download the book (timed out).`, so the raw "Aborted" string can never reach the reader error screen. The other two native error strings already matched the web exactly.

### 5. Slow tier 3 downloads now wait indefinitely like the web

The web's tier 2 and tier 3 fetches use plain `fetch()` with no application timeout, so a multi megabyte book over a slow link keeps downloading until it succeeds or genuinely fails while the "Brewing your book…" state persists. Native's `fetchText` wrapped fetch in an AbortController: 30_000 ms for the mirror tier and 60_000 ms for the live Gutenberg tier, so a download still in flight at 60 seconds rejected even though it would have completed given more time.

`fetchText`'s timeout parameter is now optional, with no AbortController created when it is absent. The tier 3 Gutenberg fetch passes no timeout and waits indefinitely like the web. The tier 2 mirror fetch keeps its explicit 30_000 ms timeout, now carrying a code comment marking it as a deliberate native only fast fallthrough optimization (the typical mirror fetch is about 9 ms, so 30 seconds is generous). Combined with issue 4, no abort should ever reach the reader error screen.

### 6. First paint now waits for AsyncStorage rehydration

The web's zustand persist uses the default localStorage storage (`src/store/useStore.ts:97`, no `storage` option), which rehydrates synchronously at store creation, so the very first render already carries the persisted themeIndex, mode, wpm, visMode, fitMode, progressById, savedById, and stats. A light theme user never sees a dark flash, and the Today resume hero renders the in progress book immediately. Native's persist uses `createJSONStorage(() => AsyncStorage)` (`src/store.ts:118`), which rehydrates asynchronously, and `App.tsx` gated first paint only on fonts, so a cold start rendered defaults (mode 'dark', themeIndex 0, wpm 300, empty progressById, so Today briefly showed today's pick instead of the resume hero) and snapped to persisted state a beat later.

`App.tsx` now gates first paint on both fonts and store hydration, using `useStore.persist.hasHydrated()` for the initial state plus an `onFinishHydration` subscription:

```tsx
const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated());
useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
}, []);
if ((!fontsLoaded && !fontError) || !hydrated) return null;
```

The effect re checks `hasHydrated` inside itself to close the race where hydration finishes between first render and subscribe. All hooks stay above the early return. The first rendered frame now already reflects persisted theme, mode, wpm, visMode, fitMode, progress, saved books, and stats. AsyncStorage rehydration is fast (a few ms), so no separate loading UI was needed.

## Judgment calls

1. **Timeout copy.** Any abort rejection is remapped to `Could not download the book (timed out).`, with the remap placed inside `fetchText` itself, so no code path can leak the raw "Aborted" string even though after removing the tier 3 timeout no path should abort.
2. **Open transition cover.** `coverUrl` was also passed to the floating BookCover in `src/open/OpenTransition.tsx`, which the prompt did not list. Without it, a live search book with real cover art would swap to the generated cover during the open animation and swap back after. The change is one prop on a BookMeta already in scope.
3. **Version bump deferred.** The standing rule to bump `expo.version` in `app.json` every change round conflicted with this run's hard rule that `app.json` must not be modified. The hard rule won, so the version bump was left for the session that owns `app.json`.
4. **Hydration gate shape.** The gate uses `return null` (matching the existing fonts gate) rather than holding the Expo splash screen. The prompt allowed either, and the repo does not currently use expo-splash-screen's preventAutoHideAsync.

## Check on your phone

- [ ] Confirm: searching "Peter Pan" shows the title "Peter Pan: [Peter and Wendy]" with no dollar sign gibberish, and "Black Beauty" reads "Black Beauty: The autobiography of a horse".
- [ ] Confirm: an obscure live search hit not on the built in shelf shows a real book cover in the results grid, not the plain generated one.
- [ ] Confirm: after saving and reading one of those live search books, its real cover shows up in Library under Saved for later, in the reading list, and on the big resume card on the home page.
- [ ] Confirm: with airplane mode on, searching for something not on the shelf shows only the quiet "Nothing on the shelf for that. Try another title or author." line, with no error box above it.
- [ ] Confirm: a book that fails to download shows a full sentence like "Could not download the book (404)." and never "HTTP 404" or "Aborted".
- [ ] Confirm: switching to light theme, setting an unusual reading speed, reading a few pages, then fully closing and reopening the app opens already in light theme with your book on the resume card, with no dark flicker and no split second of the wrong home page.

Everything else in this package (the coverUrl type threading, the shared search helper, and the indefinite tier 3 wait versus the silent 30 second tier 2 fallthrough) was verified in code and by review.
