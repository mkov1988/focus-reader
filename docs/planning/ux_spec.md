# Store Front UX Specification

**Author**: UX Agent

## 1. User Goal
The user wants to seamlessly discover, search for, and select a book to read with minimal cognitive load, bypassing traditional file management.

## 2. User Flow
1. **Landing (Store Front)**: User opens the app and lands on the Store Front (the new default `INPUT` mode).
2. **Discovery**: User can scroll vertically through curated horizontal lists ("Popular", "eBooks", "New").
3. **Filtering**: User can tap category chips ("All", "eBooks", "Fiction", etc.) to filter visible lists.
4. **Targeted Search**: User taps the top search bar, types a query, and hits the "Search" button. The view updates to show Gutendex API results.
5. **Selection**: User taps a Book Card. 
6. **Transition**: A loading spinner briefly appears while the text is fetched, sanitized, and stored, then the app transitions seamlessly into `READING` mode.

## 3. UI States
- **Ideal State**: Curated lists loaded with colorful covers and clear titles.
- **Empty State (Search)**: If a search yields nothing, show a friendly illustration with "No books found. Try a different term or browse our popular titles."
- **Loading State**: Skeleton loaders matching the dimensions of the Book Cards while waiting for the Gutendex API.
- **Error State**: "Unable to connect to the library. Please check your internet connection." with a "Retry" button.

## 4. Accessibility (A11y)
- The search input must AutoFocus or be easily reachable via `Tab`.
- Hidden `aria-label` on book cards (e.g., "Read Her Radiant Curse by Elizabeth Lim").
- The horizontal carousels must support `Shift + Scroll` or trackpad swiping naturally.
