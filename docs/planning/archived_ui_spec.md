i w# Store Front UI Specification

**Author**: UI Agent

## 1. Aesthetic Adherence
Based on the provided reference (`desired ui reference.png`), we are adopting a **Soft Minimalist / Cozy** aesthetic. 
- Avoid sharp corners; embrace `rounded-2xl` and `rounded-full`.
- Use flat backgrounds with subtle, non-intrusive drop shadows for depth.
- No heavy skeuomorphism (like 3D wood textures).

## 2. Design Tokens (Tailwind Mapping)
- **Background Color**: `#F5EBE1` (A warm, off-white/beige). We will map this to `bg-stone-100` or a custom `bg-[#F5EBE1]`.
- **Search Button / Accents**: `#E86A6B` (Soft Coral/Red). Map to `bg-red-400` or custom `bg-[#E86A6B]`.
- **Primary Text**: Dark brown/grey for high contrast readability (`text-stone-800`).
- **Secondary Text (Authors)**: The accent coral color (`text-[#E86A6B]`).
- **Typography**: Inter or similar clean sans-serif for UI elements (`font-sans`).

## 3. Layout Structure
1. **Header Area**: 
   - Fixed top padding. how 
   - Large, rounded full-width search input (`rounded-full bg-stone-200/50`) with a detached circular search icon button on the right.
2. **Category Row**: 
   - A `flex flex-row overflow-x-auto gap-4` container.
   - Items are vertical flex columns: Icon on top (soft backgrounds), Text label below.
3. **Section Header**: 
   - "Popular" / "eBooks". Bold, left-aligned (`text-xl font-bold`).
   - "View All" pill and circular `<` `>` buttons right-aligned. (Arrows default hidden `hidden sm:flex` on mobile to save space).
4. **Book Cards**:
   - Aspect ratio standard book cover (e.g., 2:3).
   - Rounded corners (`rounded-xl`), slight shadow (`shadow-md`).
   - Responsive Width: `w-32` on mobile, scaling up to `w-36` on sm+.
   - Title heavy beneath the cover.
   - Author standard weight, accent color beneath the title.
5. **Horizontal Scrollers (Special Constraint)**:
   - Ensure negative margins (`-mx-6 px-6`) on the container, but use an empty `div` spacer at the end of the flex row to ensure the final card is not clipped flush against the screen edge on iOS/Android.
5. **Bottom Navigation**:
   - Fixed to bottom (`fixed bottom-0 w-full` pane).
   - White background with soft top shadow.
   - 5 evenly spaced, minimal outline icons.

## 4. Micro-Interactions
- Hovering over a book card slightly translates it `transform -translate-y-1` and increases shadow `shadow-lg` (duration `150ms ease-in-out`).
- Pressing (active state) the search or navigation buttons scales them down `scale-95`.
