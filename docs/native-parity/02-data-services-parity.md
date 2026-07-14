# Data and Services Parity: Catalog Titles, Cover URLs, Fetch Semantics, Hydration Gate

> **Status: implemented and committed 2026-07-13.** Commit `1546115` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings.


## Mission

Bring the native Android app's data and services layer to exact web semantics. Six confirmed deltas: the bundled catalog skips the cleanTitle pass so 37 titles show raw MARC markers, live search results and persisted records drop cover art the web keeps, a failed search shows an error card the web never shows, the book download failure copy differs, native adds download timeouts the web does not have, and the first frame paints from store defaults instead of persisted state. Fix all six in the native repo only.

## Context

Focus Reader is a cozy speed reading app for public domain books. It exists twice:

- Web app at `C:/Users/Michael/Desktop/Focus Reader`. This is the READ ONLY source of truth for look and behavior. Never modify anything in this repo. Read it freely to confirm behavior.
- Native app at `C:/Users/Michael/Desktop/Focus Reader Android`. ALL changes go here. It is an Expo SDK 54 project on React Native 0.81 with reanimated 4, gesture-handler 2.28, zustand, expo-image, expo-haptics, lucide-react-native, and react-navigation native-stack.

This is a full React Native app. Never introduce a WebView.

Useful background: book text is served through a tiered ladder (bundled books, device file cache, a static mirror at `https://focus-reader-48z.pages.dev/books`, then live Project Gutenberg). Covers resolve by book id to `https://focus-reader-48z.pages.dev/covers/<id>.webp` and fall back to a generated cover when the image fails. The bundled catalog (`src/data/catalog.json`, 988 books) is title identical to the web's `src/data/curated.json`.

## Before you start

Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect branch `feat/native-ui-web-parity`. Another session may hold uncommitted changes in `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, `src/reader/useReelEngine.ts`, and `app.json`, and an untracked `metro.config.js` may be present. Read the current state of any file before editing it, and do not revert changes you did not make. If a line number cited below has drifted, trust the described behavior and re locate the code.

## Issues to fix

### 1. Bundled catalog titles are never cleaned (37 books show raw MARC markers)

Web behavior. The web maps every bundled catalog entry through `cleanTitle` at module load, in `src/services/library.ts:45-49`:

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

This changes exactly 37 of 988 titles. Examples: id 16 "Peter Pan : $b [Peter and Wendy]" becomes "Peter Pan: [Peter and Wendy]", id 271 "Black Beauty : $b The autobiography of a horse" becomes "Black Beauty: The autobiography of a horse", id 2350 "His last bow : $b Some later reminiscences of Sherlock Holmes" is cleaned, id 33016 has a double space collapsed. Cleaned titles then flow into shelves, search results, the reader header, progress records, and saved records.

Native behavior. `src/services/library.ts:24` exports `CATALOG = catalogJson as BookMeta[]` with NO cleanTitle mapping, so the 37 dirty titles render verbatim in the Browse grid (ResultsScreen), localSearch results, TodayScreen lanes (popular shelf plus today's pick), the reader header, and get persisted raw into `progressById` and `savedById` via ReaderScreen.saveNow and SaveButton.toggleSaved. VibeScreen already applies cleanTitle to vibes.json, and `gutendexSearch` already cleans live search titles (`src/services/gutenberg.ts:95`), so only the bundled catalog path is affected. Cleaning the title also changes the generated cover's hash seed (BookCover hashes title plus author), so after the fix generated covers for those 37 books match the web's.

Fix. Map CATALOG through cleanTitle at module load, exactly like web `library.ts:45-49`:

```ts
export const CATALOG: BookMeta[] = (catalogJson as BookMeta[]).map((b) => ({ ...b, title: cleanTitle(b.title) }));
```

`cleanTitle` already exists in native `src/services/gutenberg.ts:55-61` and is character identical to the web's. Import it into `src/services/library.ts` (the file already imports from `./gutenberg`).

Note. Users who already opened one of the 37 books keep the dirty title in Recents or Saved until they reopen it. The progress record self heals on next open since updateProgress overwrites title. Saved records only heal on re toggle. No migration needed.

### 2. coverUrl is dropped from BookMeta, live search results, and persisted records

Web behavior. `BookMetadata` carries `coverUrl?: string` (web `src/services/types.ts:17`). The live Gutendex search maps `coverUrl: b.formats['image/jpeg']` (web `src/services/gutendex.ts:75`), so a search hit outside the mirrored cover set still shows the real publisher cover art in the results grid (`coverUrl={book.coverUrl}` at StoreFront.tsx:945), only degrading to the generated cover if that image errors. `updateProgress` persists `coverUrl: activeBook.coverUrl` (web `src/App.tsx:269`, and again at 287 in the on exit save), and `toggleSaved` persists `coverUrl: book.coverUrl` (web `SaveButton.tsx:34`). Recents rows (StoreFront.tsx:232), the Today resume hero (StoreFront.tsx:992), and Saved rows (StoreFront.tsx:1244) all render that stored cover, so a book saved or resumed from live search keeps its real cover everywhere.

Native behavior. `BookMeta` (`src/services/gutenberg.ts:13-21`) has id, title, author, downloads, textUrl, words, but NO coverUrl. `gutendexSearch` (`src/services/gutenberg.ts:93-99`) drops `formats['image/jpeg']` entirely. `ReaderScreen.saveNow` (`src/screens/ReaderScreen.tsx:120-131`) and `SaveButton.toggleSaved` (`src/components/SaveButton.tsx:84`) omit coverUrl, even though the store's `ReadingProgress` and `SavedBook` interfaces already declare it (`src/store.ts:23` and `src/store.ts:32`). All covers resolve by id to the mirror (`src/components/BookCover.tsx:71`: `uri = coverUrlProp ?? coverUrl(id)`), so for a live search book not in the mirror this 404s and every surface shows only the generated fallback cover.

Fix, in these steps:

1. Add `coverUrl?: string` to `BookMeta` in `src/services/gutenberg.ts`.
2. In `gutendexSearch`, map `coverUrl: b.formats?.['image/jpeg']`.
3. Results grid: in `src/screens/ResultsScreen.tsx`, pass `coverUrl={book.coverUrl}` to BookCard. BookCard already accepts a coverUrl prop (`src/components/BookCard.tsx:30,43`) and forwards it to BookCover at line 105, and BookCover's coverUrlProp already wins over the id derived mirror URL, so no component changes are needed.
4. Persist it: add `coverUrl: book.coverUrl` to the `updateProgress` call in ReaderScreen.saveNow (fields at ReaderScreen.tsx:122-129) and to the `toggleSaved` call in SaveButton.tsx:84.
5. Read it back everywhere the web does:
   - `src/components/rows.tsx`: `progressToBook` (line 19-21) should carry `coverUrl: r.coverUrl`; RecentRow's BookCover (line 58) should get `coverUrl={r.coverUrl}`; BookRow's BookCover (line 97) should get `coverUrl={book.coverUrl}`.
   - `src/screens/LibraryScreen.tsx:79`: include `coverUrl: b.coverUrl` in the BookMeta built for saved rows.
   - `src/screens/TodayScreen.tsx`: the resume hero builds a BookMeta at line 319 (add `coverUrl: progress.coverUrl`) and renders BookCover at line 330 (add `coverUrl={progress.coverUrl}`). The HeroPick cover at line 385 needs nothing since today's pick is a bundled book resolved by id.

Note. For the 988 bundled books nothing changes visually (both platforms use the id keyed mirror plus generated fallback). This only shows on live Gutendex search hits and anything saved or resumed from them. The memory rule about never hotlinking covers concerns the bundled shelves; the web deliberately still uses the Gutendex jpeg for live hits, so match it.

### 3. A failed live search shows an error card instead of the quiet empty state

Web behavior. `webLibraryService.search` (web `src/services/library.ts:148-158`) runs localSearch first; on zero local hits it calls `gutendex.search` inside try/catch and RETURNS `[]` on any failure. Because the service never throws, StoreFront's runQuery catch (which would set the error 'Search failed. Please check your connection and try again.' at StoreFront.tsx:532) is never reached for a text search. An offline search renders only the italic centered empty state: "Nothing on the shelf for that. Try another title or author." (StoreFront.tsx:935). The error card is effectively dead for search on web.

Native behavior. `ResultsScreen.run` calls `local.length > 0 ? local : await gutendexSearch(q)` (`src/screens/ResultsScreen.tsx:46`), and `gutendexSearch` throws on failure (`Search failed (${res.status})` at `src/services/gutenberg.ts:91`, or a network TypeError when offline). The catch (ResultsScreen.tsx:48-50) sets error 'Search failed. Please check your connection and try again.' and results `[]`, so an offline search renders BOTH the dismissable accent tinted error card (ResultsScreen.tsx:81-88) AND the empty state line below it (ResultsScreen.tsx:114-117).

Fix. Wrap the gutendex fallback in try/catch resolving to `[]` on failure, matching web library.ts:153-157, so a failed or offline search shows only the "Nothing on the shelf for that. Try another title or author." empty state with no error card. The cleanest shape is a shared `search(q)` helper in `src/services/library.ts` mirroring `webLibraryService.search` (localSearch first, then a caught gutendexSearch), with ResultsScreen calling it. The empty state copy already matches word for word; leave the error card code in place for any genuinely unexpected failure, it just must not fire for a failed live search.

### 4. Book download failure copy says "HTTP 404" instead of the web sentence

Web behavior. The tier 3 fetch (web `src/services/library.ts:199`) throws:

```ts
if (!res.ok) throw new Error(`Could not download the book (${res.status}).`);
```

The other two service errors, "No readable plain-text edition is available for this title." (line 196) and "The downloaded file appears to be empty." (line 202), are shown verbatim in the error UI's italic detail line.

Native behavior. `fetchText` throws `new Error(\`HTTP ${res.status}\`)` (`src/services/library.ts:92`) for BOTH tier 2 and tier 3, so ReaderScreen's error state (which renders the raw message, caught at `src/screens/ReaderScreen.tsx:68`) shows "HTTP 404". The other two error strings (native library.ts:152 and 155) already match web exactly. A timeout abort surfaces as the raw abort text ("Aborted"), which has no web counterpart.

Fix. Make the tier 3 path throw `Could not download the book (${res.status}).` on a non ok response. Since tier 2 failures are silently swallowed on both platforms (web's fetchHostedBook returns undefined, native's try/catch at library.ts:146-148 falls through to tier 3), it is safe to change the throw inside `fetchText` itself. Also map any abort or timeout rejection that can still reach the user to the same readable sentence rather than leaking "Aborted". Coordinate with issue 5 so the surfaced copy matches end to end.

### 5. Native aborts slow downloads that the web would eventually complete

Web behavior. `fetchContent`'s tier 2 (fetchHostedBook, web library.ts:211-221) and tier 3 (web library.ts:198) fetches use plain `fetch()` with no application timeout. A multi megabyte book over a slow link keeps downloading until it succeeds or genuinely fails, and the "Brewing your book…" state simply persists.

Native behavior. `fetchText` (`src/services/library.ts:87-97`) wraps fetch in an AbortController: 30_000 ms default for the mirror tier (called at line 138), 60_000 ms for the live Gutenberg tier (line 153). A download still in flight at the deadline rejects even though it would have completed given more time. A tier 2 abort silently falls through to tier 3 (fine), but a tier 3 abort surfaces the raw "Aborted" string on the reader's error screen.

Fix. Remove the 60_000 ms timeout from the tier 3 call so it waits indefinitely like the web (make the timeout parameter optional and pass none, or skip the AbortController when no timeout is given). Keep the 30_000 ms tier 2 timeout as a deliberate fast fallthrough optimization, and add a short code comment saying it is intentional and native only (the typical mirror fetch is about 9 ms, so 30 s is generous). After this, no abort should ever reach the reader's error screen; if any path can still abort, give it the "Could not download the book" style copy from issue 4.

### 6. First paint uses store defaults because AsyncStorage rehydration is not awaited

Web behavior. zustand persist with the default localStorage storage (web `src/store/useStore.ts:97`, no `storage` option passed) rehydrates synchronously at store creation. The very first render already has the persisted themeIndex, mode, wpm, visMode, fitMode, progressById, savedById, and stats. A light theme user never sees a dark flash (defaults are mode 'dark', themeIndex 0, wpm 300), and the Today resume hero renders the in progress book immediately.

Native behavior. persist uses `createJSONStorage(() => AsyncStorage)` (`src/store.ts:118`), which rehydrates asynchronously. `App.tsx` gates first paint only on fonts (useFonts at App.tsx:49-56, returning null until loaded) with no hydration gate anywhere in the repo (zero matches for hasHydrated, onRehydrateStorage, or rehydrate). Cold start therefore renders defaults (mode 'dark', themeIndex 0, wpm 300, empty progressById, so Today briefly shows today's pick instead of the resume hero, per TodayScreen.tsx:41-53) and then snaps to the persisted state a beat later.

Fix. Hold first paint until the store has rehydrated, extending the existing fonts gate in App.tsx. A clean shape:

```tsx
const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated());
useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
}, []);
if ((!fontsLoaded && !fontError) || !hydrated) return null;
```

Keeping the Expo splash screen visible until both gates pass is an acceptable alternative. Either way, the first rendered frame must already reflect persisted theme, mode, wpm, visMode, fitMode, progress, saved books, and stats. Watch hook order: the current App.tsx returns null before other logic, so keep all hooks above any early return. AsyncStorage rehydration is fast (a few ms), so no separate loading UI is needed.

## Acceptance checklist

- [ ] Browse, search, Today lanes, and the reader header show "Peter Pan: [Peter and Wendy]" (and the other 36 cleaned titles) with no "$b" anywhere, and newly persisted progress and saved records store the cleaned title.
- [ ] A live Gutendex search hit outside the mirror shows its real publisher cover in the results grid, and after saving or reading it, its cover appears in Saved rows, Recents rows, and the Today resume hero.
- [ ] Searching for a term with no local hits while offline shows only the italic "Nothing on the shelf for that. Try another title or author." line, with no error card above it.
- [ ] A book whose download fails with an HTTP error shows the detail "Could not download the book (404)." (with the real status), never "HTTP 404" and never "Aborted".
- [ ] A very slow tier 3 Gutenberg download keeps loading indefinitely instead of erroring at 60 seconds; the tier 2 mirror fetch still gives up at 30 seconds and falls through silently.
- [ ] Cold starting the app with a light theme, custom wpm, and a book in progress paints the first frame already themed light with the resume hero showing; nothing flashes in from defaults.

## Verification

Type check the native repo:

```
cd "C:/Users/Michael/Desktop/Focus Reader Android"
npx tsc --noEmit
```

Then reason through the running behavior carefully by reading the code paths you changed end to end. Do NOT use the Expo web build to verify anything: it opens blank localhost tabs in the real browser and the web bundle breaks on zustand's import.meta. On device checking is done by Michael on his Android phone.

Tell Michael to check these things on his phone, in plain words:

1. Search for "Peter Pan". The title should read "Peter Pan: [Peter and Wendy]" with no dollar sign gibberish. Same for "Black Beauty".
2. Search for something obscure that is not in the built in shelf, like "Meditations Long", so the app asks the live catalog. The results should show real book covers, not just the plain generated ones. Save one of those books and start reading it, then check that its cover shows up in the Library under Saved for later, in the reading list, and on the big resume card on the home page.
3. Turn on airplane mode and search for something not on the built in shelf. You should see only the quiet "Nothing on the shelf for that" line, no error box.
4. If a book ever fails to download, the message should be a full sentence like "Could not download the book (404)." and never something cryptic like "HTTP 404" or "Aborted".
5. Switch to the light theme, set your speed to something unusual, read a few pages, then fully close the app and reopen it. It should open already in light theme with your book on the resume card, with no dark flicker and no split second of the wrong home page.

## Final note

When summarizing the work for Michael, use plain everyday language and avoid dashes in prose. Explain what changed and what he should notice, not implementation trivia.

---

## Outcome, recorded 2026-07-13

Implemented in commit `1546115` on `feat/native-ui-web-parity` in the native repo.

Files changed: `App.tsx`, `src/components/SaveButton.tsx`, `src/components/rows.tsx`, `src/open/OpenTransition.tsx`, `src/screens/LibraryScreen.tsx`, `src/screens/ReaderScreen.tsx`, `src/screens/ResultsScreen.tsx`, `src/screens/TodayScreen.tsx`, `src/services/gutenberg.ts`, `src/services/library.ts`.

### Issue by issue

**1. Bundled catalog titles never cleaned (37 books show raw MARC markers)** (done)

CATALOG in src/services/library.ts now maps every entry through cleanTitle at module load, matching web library.ts. Browse, search, Today lanes, reader header, and newly persisted progress and saved records all pick up the clean titles, and the generated cover hash seed now matches the web for those 37 books.

**2. coverUrl dropped from BookMeta, live search results, and persisted records** (done)

Added coverUrl to BookMeta, mapped formats['image/jpeg'] in gutendexSearch, passed it to BookCard in ResultsScreen, persisted it in ReaderScreen.saveNow and SaveButton.toggleSaved, and read it back in rows.tsx (progressToBook, RecentRow, BookRow), LibraryScreen saved rows, and the TodayScreen resume hero (both the BookMeta and the BookCover). Also passed it to the open transition's floating cover so the cover does not swap mid animation (recorded as a judgment call).

**3. Failed live search shows an error card instead of the quiet empty state** (done)

Added a shared async search(q) helper in src/services/library.ts mirroring webLibraryService.search: localSearch first, gutendexSearch inside try/catch resolving to []. ResultsScreen.run now calls it, so an offline search renders only the italic empty state. The error card code stays for genuinely unexpected failures.

**4. Download failure copy says HTTP 404 instead of the web sentence** (done)

fetchText now throws 'Could not download the book (status).' on a non ok response (safe for tier 2 since those failures are swallowed on both platforms) and remaps any abort rejection to 'Could not download the book (timed out).' so raw 'Aborted' text can never reach the reader error screen.

**5. Native aborts slow downloads the web would complete** (done)

fetchText's timeout parameter is now optional with no AbortController when absent. The tier 3 Gutenberg fetch passes no timeout and waits indefinitely like the web. The tier 2 mirror fetch keeps its explicit 30 second timeout with a comment marking it as a deliberate native only fast fallthrough optimization.

**6. First paint uses store defaults because AsyncStorage rehydration is not awaited** (done)

App.tsx now gates first paint on both fonts and useStore.persist hydration, using hasHydrated for the initial state plus an onFinishHydration subscription (with a re check inside the effect to close the race where hydration finishes between first render and subscribe). All hooks stay above the early return.

### Judgment calls made during implementation

1) Timeout/abort copy: the prompt asked for 'Could not download the book' style copy on any abort that could reach the user; I chose 'Could not download the book (timed out).' and put the remap inside fetchText itself so no code path can ever leak the raw 'Aborted' string, even though after removing the tier 3 timeout no path should abort. 2) I also passed coverUrl to the floating BookCover in src/open/OpenTransition.tsx, which the prompt did not list; without it a live search book with real cover art would swap to the generated cover during the open animation and swap back after, and the change is one prop on the same BookMeta already in scope. 3) The standing memory rule about bumping expo.version in app.json every change round conflicts with this run's hard rule that app.json must not be modified; the hard rule wins, so the version bump is left for the session that owns app.json. 4) Hydration gate uses return null (matching the existing fonts gate) rather than holding the Expo splash screen; the prompt allowed either and the repo does not currently use expo-splash-screen's preventAutoHideAsync.

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
