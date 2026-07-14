# Storefront accessibility roles, labels, and states

> **Status: implemented and committed 2026-07-13.** Commit `d82603b` on `feat/native-ui-web-parity` in the native repo. Adversarial review passed with no unresolved findings.


## Mission

Close the storefront accessibility gaps in the native Focus Reader Android app so TalkBack users get the same semantics the web app exposes through aria attributes. Concretely: label the resume hero cover "Resume {title}" and hide lifted covers from the accessibility tree, add accessibilityRole="button" to every tappable Pressable that mirrors a web `<button>`, add selected state to the save toggle and filter chips, make the toast announce itself politely, and give both search inputs an accessible name. All changes are small metadata additions. No visuals, layout, or behavior should change for sighted users.

## Context

Focus Reader is a cozy speed-reading app for public-domain books (warm coffeeshop aesthetic, book covers on shelves, an RSVP reader). It exists twice:

- Web app at `C:/Users/Michael/Desktop/Focus Reader`. This is the READ-ONLY source of truth for look and behavior. You may read any file there to confirm what the web does. Never modify anything in that repo.
- Native app at `C:/Users/Michael/Desktop/Focus Reader Android`. This is where ALL changes go. It is an Expo SDK 54 project on React Native 0.81 with reanimated 4, gesture-handler 2.28, zustand, expo-image, expo-haptics, lucide-react-native, and react-navigation native-stack.

This is a full React Native app. Never introduce a WebView.

The native storefront screens (Today, Library, Results, vibe pages) are ports of the web's `src/components/Input/StoreFront.tsx`. The web version uses real `<button>` elements (implicit button role), `aria-label`, `aria-pressed`, `aria-hidden`, and a `role="status" aria-live="polite"` toast. The native ports carry most of the labels already but are missing roles, states, hidden gating, and the live region.

## Before you start

1. Run `git status` in `C:/Users/Michael/Desktop/Focus Reader Android`. Expect to be on branch `feat/native-ui-web-parity`. Work on that branch.
2. Another session may hold uncommitted changes in `src/reader/ReaderChrome.tsx`, `src/reader/displays.tsx`, `src/reader/useReelEngine.ts`, and `app.json`. Read the current state of any file before editing it, keep your edits surgical, and do not revert changes you did not make. This package does not need to touch those four files at all.
3. Ideally run this package after the press-feedback-micromotion parity package. If that package already landed, the Pressables below may have gained animated press styles; the accessibility additions here layer on top without conflict. If a listed line number has drifted, trust the described behavior and re-locate the code.

## Issues to fix

### 1. Today screen: hero cover label, hidden state, and missing button roles

Delta id: `today-a11y-roles-labels`

**What the web does** (`src/components/Input/StoreFront.tsx` in the web repo):

- Resume hero cover (lines 974 to 977): `role="button"` with `aria-label={"Resume " + progress.title}`. While the cover is lifted into the open transition (`openingSlotId === 'hero'`) it drops the role, sets `tabIndex={-1}`, clears the label, and sets `aria-hidden`, so the placeholder slab is invisible to screen readers.
- Today's pick hero cover (lines 1047 to 1050): same pattern with `aria-label={"Open " + todaysPick.title}` and the same aria-hidden gating while lifted.
- Vibe rows (lines 103 to 117): each "Vibe out" row is a real `<button type="button">`, so it has the implicit button role with its title and sub text as the accessible name.
- Swimlane "see all" (line 201) and the Today Popular section's "see all": real `<button>` elements.
- Menu button (lines 725 to 732): a `<button>` with `aria-label="Menu"`.
- Resume button (lines 1019 to 1030), Recents button (lines 1031 to 1039, `aria-label="Recently read"`), and the Start Reading button on the pick hero: all real `<button>` elements.

**What the native app does** (`src/screens/TodayScreen.tsx` in the native repo):

- `HeroCover` (lines 288 to 308) always sets `accessibilityRole="button"` and a fixed `accessibilityLabel={"Open " + book.title}`, even when it wraps the resume hero (used by `HeroResume` at line 329 with `startIndex={progress.currentIndex}`, and by `HeroPick` at line 384 without). When `hidden` is true (`open.openingSlotId === 'hero'`, line 271) the placeholder slab renders but the View stays fully accessible with the stale label.
- `VibeRow` (lines 226 to 253): Pressable with no `accessibilityRole`.
- Popular "see all" Pressable (lines 144 to 147): no `accessibilityRole`.
- Menu Pressable (lines 105 to 111): has `accessibilityLabel="Menu"` but no role.
- `HeroResume`'s Resume Pressable (lines 355 to 361): no role. Recents Pressable (lines 362 to 369): has `accessibilityLabel="Recently read"` but no role.
- `HeroPick`'s Start Reading Pressable (lines 396 to 402): no role.

**Change for parity:**

1. Give `HeroCover` an optional `label` prop (default `` `Open ${book.title}` ``). Pass `` label={`Resume ${progress.title}`} `` from `HeroResume`. Keep `HeroPick` on the default. The web label uses the title only, no author.
2. While `hidden` is true, remove the cover from the accessibility tree: set `accessible={!hidden}`, `accessibilityRole={hidden ? undefined : 'button'}`, `accessibilityLabel={hidden ? undefined : label}`, and add `importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}` (plus `accessibilityElementsHidden={hidden}` for iOS completeness).
3. Add `accessibilityRole="button"` to: `VibeRow`'s Pressable, the Popular see-all Pressable, the menu Pressable, the Resume Pressable, the Recents Pressable, and the Start Reading Pressable. Their text children ("see all", "Resume", "Start Reading", vibe titles) supply the accessible names, matching the web where the button content is the name.

RecentRow, BookRow, and BookCard already carry proper labels; their roles are handled in issues 2 and 3.

### 2. Library rows and the save toggle: missing roles and toggle state

Delta id: `library-row-a11y-roles`

**What the web does:**

- `RecentRow` (web `src/components/Input/StoreFront.tsx` lines 224 to 229): a real `<button>` with `aria-label={"Resume " + r.title + " by " + r.author + ", " + pct + "% complete"}`.
- `BookRow` (lines 260 to 265): a real `<button>` with `aria-label={"Open " + book.title + " by " + book.author}`.
- `SaveButton` (web `src/components/Input/SaveButton.tsx` lines 41 to 48): both tones share `aria-pressed={saved}` plus the state-dependent `aria-label` (`"Remove " + book.title + " from saved"` when saved, `"Save " + book.title + " for later"` when not), so screen readers announce it as a toggle.

**What the native app does:**

- `src/components/rows.tsx`: `RecentRow`'s Pressable (lines 45 to 47) and `BookRow`'s Pressable (lines 82 to 84) carry word-for-word matching `accessibilityLabel` strings but no `accessibilityRole`. TalkBack reads them as plain views.
- `src/components/SaveButton.tsx`: the plain tone Pressable (lines 89 to 104, label at line 92) and the ribbon tone `RibbonButton` Pressable (lines 129 to 133, label at line 131) both have the correct state-dependent labels but no `accessibilityRole` and no `accessibilityState`, so the saved or unsaved state is never announced as a toggle.

**Change for parity:**

1. Add `accessibilityRole="button"` to `RecentRow`'s Pressable and `BookRow`'s Pressable in `rows.tsx`.
2. Add `accessibilityRole="button"` and `accessibilityState={{ selected: saved }}` to BOTH SaveButton tones: the plain Pressable and the `RibbonButton` Pressable. `RibbonButton` receives `saved` as a prop already, so both spots have the value at hand. Fix both in `SaveButton.tsx`; do not fix only the plain tone.

The label strings already match the web exactly. Only role and state metadata is missing.

### 3. Shared components: filter chip state, toast live region, header button roles

Delta id: `theme-a11y-roles-and-states-missing`

**What the web does:**

- `FilterChip` (web `StoreFront.tsx` lines 179 to 190): a real `<button>` with `aria-pressed={active}` (line 184).
- Toast (web `src/App.tsx` lines 400 to 406): the bubble has `role="status"` and `aria-live="polite"`, so a save announces "Saved for later" to screen readers without stealing focus.
- The inner page header's back and menu controls are real buttons.

**What the native app does:**

- `FilterChip` (`src/components/ui.tsx` lines 60 to 77): Pressable with no role and no selected state. Its text child provides a name but TalkBack never says whether the chip is active.
- `Swimlane`'s see-all Pressable (`src/components/ui.tsx` lines 105 to 108): no role. This is the shared swimlane used across vibe pages, distinct from the Today Popular see-all in issue 1.
- `ToastHost` (`src/components/Toast.tsx` lines 36 to 48): no `accessibilityLiveRegion` and no announcement, so saves are silent to TalkBack.
- `InnerPageHeader` (`src/components/InnerPageHeader.tsx`): the back Pressable (lines 49 to 58, `accessibilityLabel={backLabel}`) and menu Pressable (lines 68 to 77, `accessibilityLabel="Menu"`) have labels but no role.

**Change for parity:**

1. `FilterChip`: add `accessibilityRole="button"` and `accessibilityState={{ selected: active }}`.
2. `Swimlane` see-all: add `accessibilityRole="button"`.
3. `InnerPageHeader`: add `accessibilityRole="button"` to both the back and menu Pressables.
4. `ToastHost`: add `accessibilityLiveRegion="polite"` to the toast container `Animated.View`, and additionally call `AccessibilityInfo.announceForAccessibility(toast.message)` inside the existing `useEffect` that runs on each new toast (import `AccessibilityInfo` from react-native). The explicit announcement is the reliable path on Android because the toast view remounts per toast id (the `key={toast.id}`), and a freshly mounted live region does not always fire. Keep the live region attribute too for parity with the web's `aria-live="polite"`.

BookCard and InnerPageHeader labels are already present; only roles, state, and the live region are missing.

### 4. Search inputs: missing accessible names

Delta id: `search-input-missing-accessibility-label`

**What the web does:**

- Home search input (web `StoreFront.tsx` lines 711 to 717): `aria-label="Search Focus Reader"` (line 715), matching its placeholder.
- Results search input (lines 909 to 915): `aria-label="Search all books"` (line 913).

So screen readers announce the field's purpose even when it contains text.

**What the native app does:**

- Today search TextInput (`src/screens/TodayScreen.tsx` lines 90 to 98): placeholder "Search Focus Reader" but no `accessibilityLabel`. TalkBack announces the placeholder only while the field is empty; once the user types, the field has no accessible name.
- Results search TextInput (`src/screens/ResultsScreen.tsx` lines 92 to 100): placeholder "Search all books", same gap.

**Change for parity:**

1. Add `accessibilityLabel="Search Focus Reader"` to the Today TextInput.
2. Add `accessibilityLabel="Search all books"` to the Results TextInput.

The Clear buttons on both screens, the Dismiss button on Results, the Menu button on Today, and InnerPageHeader's back and menu already carry correct accessibilityLabels matching the web aria-labels; do not touch those labels.

## Acceptance checklist

- [ ] With a book in progress, TalkBack reads the hero cover as "Resume {title}, button"; with no progress it reads "Open {title}, button"; while a cover is lifted into the open transition it is skipped entirely by TalkBack.
- [ ] Every Vibe out row, both see-all controls (Today Popular and shared Swimlane), the Today menu button, Resume, Recents, Start Reading, RecentRow, and BookRow announce as buttons in TalkBack.
- [ ] The save bookmark (both the cover ribbon and the small circle on rows) announces as a button with a selected state that flips when toggled, alongside its existing "Save {title} for later" or "Remove {title} from saved" label.
- [ ] Filter chips on vibe pages announce as buttons and announce selected when active.
- [ ] Saving a book causes TalkBack to speak "Saved for later" (and removing speaks "Removed from shelf") without moving focus.
- [ ] The back and menu buttons in every inner page header announce as buttons.
- [ ] Both search fields announce their purpose ("Search Focus Reader" on home, "Search all books" on results) even after text has been typed into them.
- [ ] Nothing visual changed anywhere; only screen reader output differs.

## Verification

1. Type-check the native repo: run `npx tsc --noEmit` in `C:/Users/Michael/Desktop/Focus Reader Android`. It must pass clean.
2. Reason through the running behavior carefully, especially the HeroCover hidden gating: confirm the props flip together when `open.openingSlotId === 'hero'` and flip back when the transition aborts, and confirm `RibbonButton` receives everything it needs for its state (it gets `saved` as a prop).
3. Do NOT use the Expo web build to verify anything. Its dev server opens blank localhost tabs in the real browser and the web bundle breaks on zustand's `import.meta`. On-device checking is done by Michael on his Android phone.

When you finish, tell Michael exactly this, in plain everyday English: turn on TalkBack on your phone (Settings, then Accessibility, then TalkBack), then open the app and swipe through the home screen with one finger. Every tappable thing (the big book on top, the Resume and Recents buttons, the vibe rows, see all, the menu circle) should now say "button" after its name. The big book should say "Resume" plus its title when you have a book going, not "Open". Tap the little bookmark on any book cover and the phone should speak "Saved for later" out loud on its own. The bookmark should also say "selected" once a book is saved. Tap into the search box, type something, then touch the box again; it should still say "Search Focus Reader" instead of going silent. If all that happens, this package is done.

## Final note

When summarizing your work for Michael, use plain everyday language, no jargon, and avoid dashes in prose. Use commas or periods instead.

---

## Outcome, recorded 2026-07-13

Implemented in commit `d82603b` on `feat/native-ui-web-parity` in the native repo.

Files changed: `src/components/InnerPageHeader.tsx`, `src/components/SaveButton.tsx`, `src/components/Toast.tsx`, `src/components/rows.tsx`, `src/components/ui.tsx`, `src/screens/ResultsScreen.tsx`, `src/screens/TodayScreen.tsx`.

### Issue by issue

**Issue 1: Today screen hero cover label, hidden state, and missing button roles** (done)

HeroCover got an optional label prop defaulting to Open plus title; HeroResume now passes Resume plus title, HeroPick stays on the default. The hidden gating (accessible, role, label, importantForAccessibility, accessibilityElementsHidden all flipping together when the cover lifts) was already in place from an earlier package in this run, so I only wired the new label through it. Added accessibilityRole button to the VibeRow, the Popular see all, the menu button, Resume, Recents, and Start Reading.

**Issue 2: Library rows and save toggle roles and toggle state** (done)

RecentRow and BookRow Pressables in rows.tsx now carry accessibilityRole button. Both SaveButton tones (the plain circle and the ribbon) got accessibilityRole button plus accessibilityState selected tied to saved.

**Issue 3: Filter chip state, toast live region, header button roles** (done)

FilterChip announces as a button with a selected state. The shared Swimlane see all and both InnerPageHeader controls (back and menu) announce as buttons. ToastHost got accessibilityLiveRegion polite on the bubble container plus an explicit AccessibilityInfo.announceForAccessibility call inside the existing toast effect, since the per id remount makes the live region alone unreliable on Android.

**Issue 4: Search inputs missing accessible names** (done)

The Today search box now has accessibilityLabel Search Focus Reader and the Results search box has accessibilityLabel Search all books, matching their placeholders and the web aria labels.

### Judgment calls made during implementation

Two judgment calls. First, the prompt described HeroCover as always accessible with a stale label while lifted, but an earlier package in this run had already added the full hidden gating; I kept that work as is and layered only the new label prop on top, so nothing was reverted. Second, Michael's standing rule says to bump expo.version in app.json every change round, but this run forbids touching app.json because another session holds uncommitted changes there, so I skipped the bump; whoever handles the commit should bump the version. The package 03 cover inks decision did not come up in this package. No visual, layout, or behavior changes were made anywhere; every edit is screen reader metadata only.

### Testing performed

- `npx tsc --noEmit` in the native repo: clean at commit time.
- An independent adversarial review agent re-opened the uncommitted diff, checked every acceptance checklist item above against the native code and the cited web sources (exact constants, timings, easing curves, and copy strings), hunted for regressions (broken imports, accidental behavior changes, worklet violations), and re-ran the type check itself. Verdict: passed with no unresolved findings and zero fix rounds.
- The commit step re-ran the type check once more before staging, and staged only the files listed above (no blanket `git add`).
- Not yet done: the on-device checks in the Verification section above. Playback pacing and gesture feel only prove out on a real phone, so those remain for Michael on build 0.7.10 or later.
