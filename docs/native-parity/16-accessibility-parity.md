# Storefront accessibility roles, labels, and states

**Done.** Implemented and committed as `d82603b` on `feat/native-ui-web-parity`, 2026-07-13, independent review passed with no unresolved findings. This package closed the storefront accessibility gaps so TalkBack users get the same semantics the web app exposes through its aria attributes.

## What this fixed

Before this, the native storefront ports carried most of their accessibility labels but were missing the metadata that turns those labels into a real screen reader experience. Tappable Pressables that mirror web `<button>` elements had no button role, so TalkBack read them as plain views. The save toggle and the filter chips never announced whether they were on or off. The resume hero cover always said "Open" even when a book was in progress, and it stayed in the accessibility tree while it was lifted into the open transition. The toast never announced saves, and the two search inputs lost their accessible name as soon as the user typed over the placeholder. This work added roles, selected states, hidden gating, a live region, and accessible names to match the web, with no change to visuals, layout, or behavior for sighted users.

## What changed

Files touched: `src/components/InnerPageHeader.tsx`, `src/components/SaveButton.tsx`, `src/components/Toast.tsx`, `src/components/rows.tsx`, `src/components/ui.tsx`, `src/screens/ResultsScreen.tsx`, `src/screens/TodayScreen.tsx`.

### Issue 1: Today hero cover label, hidden state, and button roles

`HeroCover` used to always set `accessibilityRole="button"` with a fixed `accessibilityLabel={"Open " + book.title}`, even when it wrapped the resume hero, and while lifted it kept the placeholder slab fully accessible with that stale label. The web gives the resume hero cover `role="button"` with `aria-label={"Resume " + progress.title}` and the today's pick hero `aria-label={"Open " + todaysPick.title}`, and while `openingSlotId === 'hero'` it drops the role, sets `tabIndex={-1}`, clears the label, and sets `aria-hidden`. `HeroCover` got an optional `label` prop defaulting to `` `Open ${book.title}` ``. `HeroResume` now passes `` label={`Resume ${progress.title}`} `` (title only, no author) and `HeroPick` stays on the default. The hidden gating, where `accessible={!hidden}`, `accessibilityRole={hidden ? undefined : 'button'}`, `accessibilityLabel={hidden ? undefined : label}`, `importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}`, and `accessibilityElementsHidden={hidden}` all flip together when the cover lifts, was already in place from an earlier package in this run, so only the new label was wired through it. `accessibilityRole="button"` was added to the `VibeRow` Pressable, the Popular see-all Pressable, the menu Pressable (which already had `accessibilityLabel="Menu"`), the Resume Pressable, the Recents Pressable (which already had `accessibilityLabel="Recently read"`), and the Start Reading Pressable. Their text children ("see all", "Resume", "Start Reading", vibe titles) supply the accessible names, matching the web where the button content is the name.

### Issue 2: Library rows and the save toggle roles and toggle state

`RecentRow` and `BookRow` in `rows.tsx` carried matching `accessibilityLabel` strings (`"Resume " + r.title + " by " + r.author + ", " + pct + "% complete"` and `"Open " + book.title + " by " + book.author`) but no `accessibilityRole`, so TalkBack read them as plain views. Both Pressables now carry `accessibilityRole="button"`. `SaveButton` had the correct state dependent labels on both tones (`"Remove " + book.title + " from saved"` when saved, `"Save " + book.title + " for later"` when not) but no role and no state, so the toggle was never announced as one. Both tones, the plain circle Pressable and the ribbon `RibbonButton` Pressable, got `accessibilityRole="button"` plus `accessibilityState={{ selected: saved }}` tied to the `saved` value, mirroring the web's `aria-pressed={saved}`.

### Issue 3: Filter chip state, toast live region, and header button roles

`FilterChip` in `ui.tsx` had no role and no selected state, so TalkBack never said whether the chip was active. It now announces as a button with `accessibilityRole="button"` and `accessibilityState={{ selected: active }}`, matching the web's `aria-pressed={active}`. The shared `Swimlane` see-all Pressable got `accessibilityRole="button"`, and both `InnerPageHeader` controls, the back Pressable (label `backLabel`) and the menu Pressable (`accessibilityLabel="Menu"`), got `accessibilityRole="button"`. `ToastHost` was silent to TalkBack; it now sets `accessibilityLiveRegion="polite"` on the bubble container `Animated.View` (matching the web's `role="status" aria-live="polite"`) and additionally calls `AccessibilityInfo.announceForAccessibility(toast.message)` inside the existing toast effect. The explicit announcement is the reliable path on Android because the toast view remounts on each toast id (the `key={toast.id}`), and a freshly mounted live region does not always fire.

### Issue 4: Search inputs missing accessible names

Both search fields lost their accessible name once text replaced the placeholder. The Today search TextInput now has `accessibilityLabel="Search Focus Reader"` (matching its placeholder and the web's `aria-label`) and the Results search TextInput has `accessibilityLabel="Search all books"`, so screen readers still announce each field's purpose even after the user types into it.

## Judgment calls

- The prompt described `HeroCover` as always accessible with a stale label while lifted, but an earlier package in this run had already added the full hidden gating. That work was kept as is and only the new label prop was layered on top, so nothing was reverted.
- Michael's standing rule is to bump `expo.version` in `app.json` every change round, but this run forbid touching `app.json` because another session held uncommitted changes there. The bump was skipped and left for whoever handles the commit. Every edit in this package is screen reader metadata only, with no visual, layout, or behavior change anywhere.

## Check on your phone

Turn on TalkBack (Settings, then Accessibility, then TalkBack), open the app, and swipe through the home screen with one finger.

- [ ] Confirm: with a book in progress the hero cover reads "Resume {title}, button", and with no progress it reads "Open {title}, button".
- [ ] Confirm: while a cover is lifting into the open transition, TalkBack skips it entirely instead of reading a stale label.
- [ ] Confirm: every vibe row, both see-all controls, the menu circle, Resume, Recents, Start Reading, and the book rows say "button" after their name.
- [ ] Confirm: the save bookmark (both the cover ribbon and the small circle on rows) announces as a button and says "selected" once a book is saved, flipping back when you unsave.
- [ ] Confirm: filter chips on vibe pages announce as buttons and say "selected" when active.
- [ ] Confirm: saving a book makes the phone speak "Saved for later" on its own, and removing speaks "Removed from shelf", without focus jumping.
- [ ] Confirm: the back and menu buttons in inner page headers announce as buttons.
- [ ] Confirm: tap into a search box, type something, then touch the box again, and it still says "Search Focus Reader" (home) or "Search all books" (results) instead of going silent.

Everything else in this package was verified in code and by review: the type check passed clean, no visuals changed, and the hidden gating props were confirmed to flip together.
