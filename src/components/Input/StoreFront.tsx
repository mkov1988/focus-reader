import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BookCard } from './BookCard';
import { BookCover, type CoverVariant } from './BookCover';
import { SaveButton } from './SaveButton';
import { InnerPageHeader } from '../InnerPageHeader';
import { sceneAt } from '../../services/scenes';
import { useDragScroll } from '../../hooks/useDragScroll';
import { usePress } from '../../hooks/usePress';
import { useStore, type TabKey, type ReadingProgress } from '../../store/useStore';
import { webLibraryService as library } from '../../services/library';
import type { BookMetadata, VibePage } from '../../services/types';
import { THEMES } from '../../theme';
import { startPressGesture } from '../../utils/pressGesture';
import { haptics } from '../../utils/haptics';
import {
    Coffee, Search, BookOpen, Library, Notebook,
    ChevronRight, ArrowRight, Moon, Clock, Loader2, X,
    Menu, Settings, Info, BarChart3, Check, Sun,
    Heart, Flame, Rocket, Eye, Anchor,
} from 'lucide-react';

// Vibe icons can be a Lucide icon OR a small custom SVG component (e.g. the
// "Ugly Cries" squiggly face), so they share this looser type rather than
// LucideIcon. Both accept `size`/`className` and inherit `currentColor`.
type VibeIcon = ComponentType<{ size?: number | string; className?: string }>;

// Shown only if Gutendex can't be reached, so the shelf is never empty.
const FALLBACK_BOOKS: (BookMetadata & { variant?: CoverVariant; tint?: string })[] = [
    { id: 'f-walden', title: 'Walden', author: 'Henry David Thoreau', variant: 'framed' },
    { id: 'f-middlemarch', title: 'Middlemarch', author: 'George Eliot', variant: 'label' },
    { id: 'f-willows', title: 'Wind in the Willows', author: 'Kenneth Grahame', variant: 'solid', tint: 'bg-mustard' },
    { id: 'f-pride', title: 'Pride and Prejudice', author: 'Jane Austen', variant: 'solid', tint: 'bg-coral-accent' },
    { id: 'f-room', title: 'A Room with a View', author: 'E. M. Forster', variant: 'framed' },
    { id: 'f-alice', title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', variant: 'solid', tint: 'bg-sage' },
];

// "Vibe out" — pick a feeling, not a genre. The BookTok-style genres these
// vibes evoke (contemporary/sports romance, YA, techno-thrillers) don't exist
// in the pre-1928 public-domain catalog, so each `key` maps to a hand-curated
// shelf of the closest classics (see VIBE_SHELVES in services/library.ts).
const SquigglyFaceIcon = ({ size = 24, className = "" }: { size?: number | string, className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <circle cx="12" cy="12" r="10" />
        <path d="M7 9l2 2-2 2" />
        <path d="M17 9l-2 2 2 2" />
        <path d="M8 15c1-1.5 2.5-1.5 4 0s3 1.5 4 0" />
    </svg>
);

const VIBES = [
    { icon: Coffee, title: 'Cozy Corners', sub: 'a warm hug in book form', key: 'cozy', desc: 'A warm hug in book form. Found families, gentle banter, and a safe world where everything turns out okay.' },
    { icon: Heart, title: 'Tangled Sheets', sub: 'butterflies and slow tension', key: 'tangled', desc: 'Butterflies and high stakes. Romantic tension you feel in your chest, two people you cannot help rooting for.' },
    { icon: Flame, title: 'Big Firsts', sub: 'figuring it out, against the odds', key: 'bigfirsts', desc: 'Big emotions and bigger firsts. Growing up and figuring out who you are, against the odds.' },
    { icon: SquigglyFaceIcon, title: 'Ugly Cries', sub: 'a beautiful, cathartic heartbreak', key: 'uglycries', desc: 'Emotionally destroyed, in the best way. Cathartic heartbreak that leaves an ache long after the last page.' },
    { icon: Rocket, title: 'New Realms', sub: 'escape into another universe', key: 'newrealms', desc: 'Leave the real world behind. New universes, new rules, magic and epic scale.' },
    { icon: Moon, title: 'Up All Night', sub: 'too tense to put down', key: 'upallnight', desc: 'Heart rate up, lights still on. Tension so high you have to know what happens next.' },
    { icon: Eye, title: 'Mind Breakers', sub: 'creeped out, reality bent', key: 'mindbreakers', desc: 'Creeped out and quietly unnerved. Reality bent, with an eerie feeling that lingers after the last page.' },
    { icon: Anchor, title: 'Level Heads', sub: 'ancient wisdom for real life', key: 'levelheads', desc: 'Ancient wisdom for real life. Building resilience, mastering your emotions, and finding tranquility amidst chaos.' },
];

// Staff-picks shelf scrolls horizontally, so its cards need a longer touch
// hold than the default before a press commits to a pickup — otherwise a
// deliberate sideways swipe (which often begins with the finger briefly still)
// gets grabbed as a book-lift and the swipe never scrolls the shelf. A quick
// tap still opens; a genuine long-press still lifts.
const SHELF_HOLD_MS = 400;

const TABS: { key: TabKey; icon: LucideIcon; label: string }[] = [
    { key: 'today', icon: BookOpen, label: 'Today' },
    { key: 'library', icon: Library, label: 'Library' },
    { key: 'notebook', icon: Notebook, label: 'Notebook' },
];

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
    <p className="text-center text-[10px] font-semibold tracking-[0.22em] text-mocha/80 uppercase">{children}</p>
);

const CoverSkeleton = () => (
    <div className="w-36 shrink-0">
        <div className="w-full aspect-[2/3] rounded-l-[3px] rounded-r-xl bg-espresso/[0.07] animate-pulse" />
        <div className="h-3 bg-espresso/[0.07] rounded mt-2.5 w-3/4 animate-pulse" />
        <div className="h-2.5 bg-espresso/[0.05] rounded mt-1.5 w-1/2 animate-pulse" />
    </div>
);

// One "Vibe out" row. Press-down nudges the icon + chevron; release runs onClick.
function Vibe({ icon: Icon, title, sub, onClick }: { icon: VibeIcon; title: string; sub: string; onClick: () => void }) {
    const { pressed, pressProps } = usePress();
    return (
        <button
            type="button"
            onClick={onClick}
            {...pressProps}
            className={`w-full min-h-[64px] flex items-center gap-3.5 rounded-2xl px-4 py-3 ring-1 text-left select-none bg-cream/70 transition-[transform,box-shadow,border-color] duration-150 ${pressed ? 'ring-coral-accent/40 scale-[0.99] shadow-[inset_0_1px_4px_rgba(58,42,30,0.08)]' : 'ring-espresso/10'}`}
        >
            <span className={`w-10 h-10 rounded-xl bg-cream/80 ring-1 ring-espresso/10 flex items-center justify-center text-espresso shrink-0 transition-transform duration-150 ${pressed ? 'scale-110 -rotate-6' : ''}`}>
                <Icon size={20} />
            </span>
            <span className="flex-1 min-w-0">
                <span className="block font-serif text-[16px] font-medium text-espresso leading-tight">{title}</span>
                <span className="block text-[12px] italic text-mocha mt-0.5">{sub}</span>
            </span>
            <ChevronRight size={18} className={`shrink-0 transition-[transform,color] duration-150 ${pressed ? 'translate-x-1 text-coral-accent' : 'text-espresso/25'}`} />
        </button>
    );
}

function EmptyTab({ icon: Icon, title, body, footnote = 'Coming soon' }: { icon: LucideIcon; title: string; body: string; footnote?: string | null }) {
    return (
        <div className="rounded-3xl bg-cream/60 ring-1 ring-espresso/10 px-6 py-10 text-center">
            <span className="inline-flex w-12 h-12 rounded-2xl bg-cream ring-1 ring-espresso/10 items-center justify-center text-coral-accent">
                <Icon size={22} />
            </span>
            <h3 className="font-serif text-[20px] font-semibold text-espresso mt-4">{title}</h3>
            <p className="font-serif italic text-[13px] text-mocha leading-relaxed mt-2 max-w-xs mx-auto">{body}</p>
            {footnote && <p className="text-[10px] font-semibold tracking-[0.22em] text-mocha/60 uppercase mt-5">{footnote}</p>}
        </div>
    );
}

/**
 * Full-screen inner page (Reading Stats / Settings / About) opened from the
 * menu's "More" group: the shared back+title header over a scrollable column,
 * matching the warm-beige page shell, backed out of via the header.
 */
function OverlayPage({ title, eyebrow, onBack, children }: { title: string; eyebrow?: string; onBack: () => void; children: React.ReactNode }) {
    return (
        <div
            className="fixed inset-0 z-[60] bg-warm-beige overflow-y-auto overscroll-contain animate-fade-in"
            role="dialog"
            aria-label={title}
            aria-modal="true"
            style={{ backgroundImage: 'radial-gradient(120% 80% at 50% -10%, rgba(212,154,63,0.10), transparent 55%)' }}
        >
            <InnerPageHeader title={title} eyebrow={eyebrow} backLabel="Back to home" onBack={onBack} />
            <main className="max-w-md mx-auto px-5 pt-5" style={{ paddingBottom: 'max(3rem, env(safe-area-inset-bottom))' }}>
                {children}
            </main>
        </div>
    );
}

/** Estimated read time from a word count and the reader's words-per-minute. */
function formatReadTime(words: number | undefined, wpm: number): string | null {
    if (!words || words < 1) return null;
    const m = Math.round(words / Math.max(1, wpm));
    if (m < 1) return '< 1 min';
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem >= 5 ? `${h} hr ${rem} min` : `${h} hr`;
}

/** Small pill showing a book's estimated read time (bedtime-friendly heuristic). */
function ReadChip({ words, wpm, className = '' }: { words?: number; wpm: number; className?: string }) {
    const t = formatReadTime(words, wpm);
    if (!t) return null;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full bg-espresso/[0.06] px-2 py-0.5 text-[10px] font-semibold tracking-[0.02em] text-mocha ${className}`}>
            <Clock size={10} className="shrink-0" /> {t}
        </span>
    );
}

/** A pill in the vibe filter row — the primary navigation anchors. */
function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold select-none ring-1 transition-[transform,background-color,color,border-color] duration-150 active:scale-[0.97] ${active ? 'bg-coral-accent text-[rgb(var(--coral-accent-text))] ring-coral-accent' : 'bg-cream/70 text-espresso ring-espresso/12'}`}
        >
            {children}
        </button>
    );
}

/** A horizontal carousel section: header + optional "see all" + scroller. The
 *  pt-7 -mt-4 leaves headroom for the cover bookmarks poking above each card. */
function Swimlane({ title, onSeeAll, children }: { title: string; onSeeAll?: () => void; children: React.ReactNode }) {
    const scrollRef = useDragScroll();
    return (
        <section className="mt-10">
            <div className="flex items-end justify-between mb-3">
                <h3 className="font-serif text-[18px] font-semibold text-espresso tracking-tight leading-none">{title}</h3>
                {onSeeAll && (
                    <button type="button" onClick={onSeeAll} className="group flex items-center text-[13px] font-semibold text-coral-accent shrink-0 pb-0.5 select-none active:text-coral-accent/70">
                        see all <ArrowRight size={14} className="ml-1 transition-transform duration-150 group-active:translate-x-1" />
                    </button>
                )}
            </div>
            <div ref={scrollRef} className="flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-pl-5 -mx-5 px-5 pt-7 -mt-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {children}
                <div className="w-1 shrink-0" />
            </div>
        </section>
    );
}

// One row in the Recents list (Library tab). Tap to reopen the book at the
// exact word it was left on — the open animation lifts from this row's cover.
function RecentRow({ r, onOpen }: { r: ReadingProgress; onOpen: (book: BookMetadata, originRect: DOMRect | null, startIndex?: number) => void }) {
    const coverRef = useRef<HTMLDivElement>(null);
    const pct = r.totalTokens > 0 ? Math.min(100, Math.round((r.currentIndex / r.totalTokens) * 100)) : 0;
    const open = () => {
        const book: BookMetadata = { id: r.bookId, title: r.title, author: r.author, coverUrl: r.coverUrl, textUrl: r.textUrl };
        onOpen(book, coverRef.current?.getBoundingClientRect() ?? null, r.currentIndex);
    };
    return (
        <button
            type="button"
            onClick={open}
            aria-label={`Resume ${r.title} by ${r.author}, ${pct}% complete`}
            className="w-full flex items-center gap-3.5 rounded-2xl px-3.5 py-3 ring-1 ring-espresso/10 bg-cream/70 text-left select-none active:scale-[0.99] active:ring-coral-accent/40 transition-[transform,border-color] duration-150"
            style={{ touchAction: 'manipulation' }}
        >
            <div ref={coverRef} className="shrink-0 w-12">
                <BookCover title={r.title} author={r.author} coverUrl={r.coverUrl} variant="framed" size="sm" />
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="font-serif text-[15px] font-medium text-espresso leading-snug line-clamp-1">{r.title}</h3>
                <p className="text-[11px] text-mocha italic line-clamp-1 mt-0.5">{r.author}</p>
                <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1 rounded-full bg-espresso/10 overflow-hidden">
                        <div className="h-full rounded-full bg-coral-accent" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-semibold tracking-[0.1em] text-mocha tabular-nums shrink-0">{pct}%</span>
                </div>
            </div>
            <ChevronRight size={18} className="text-espresso/25 shrink-0" />
        </button>
    );
}

// A catalog book as a Recents-style list row, used for the vibe subcategory
// shelves. Tap opens the book instantly, lifting from this row's cover. No
// progress bar (these are unstarted), and covers are the app's generated covers
// (shelf books carry no cover URL) so the rows stay light and never hotlink.
function BookRow({ book, onOpen }: { book: BookMetadata; onOpen: (book: BookMetadata, originRect: DOMRect | null, startIndex?: number) => void }) {
    const coverRef = useRef<HTMLDivElement>(null);
    // A relative wrapper, not a single <button>: the open area is a button and
    // the save toggle is a sibling laid over its right edge, so we never nest a
    // button inside a button (invalid) while both stay tappable.
    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => onOpen(book, coverRef.current?.getBoundingClientRect() ?? null)}
                aria-label={`Open ${book.title} by ${book.author}`}
                className="w-full flex items-center gap-3.5 rounded-2xl px-3.5 py-2.5 pr-14 ring-1 ring-espresso/10 bg-cream/70 text-left select-none active:scale-[0.99] active:ring-coral-accent/40 transition-[transform,border-color] duration-150"
                style={{ touchAction: 'manipulation' }}
            >
                <div ref={coverRef} className="shrink-0 w-11">
                    <BookCover title={book.title} author={book.author} coverUrl={book.coverUrl} variant="framed" size="sm" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-serif text-[15px] font-medium text-espresso leading-snug line-clamp-1">{book.title}</h3>
                    <p className="text-[11px] text-mocha italic line-clamp-1 mt-0.5">{book.author}</p>
                </div>
            </button>
            <SaveButton book={book} tone="plain" className="absolute right-2.5 top-1/2 -translate-y-1/2" />
        </div>
    );
}

interface StoreFrontProps {
    /**
     * Fire-and-forget: kick the App-level "open this book" flow on touch-down.
     * The transition takes over the gesture and decides commit vs cancel on
     * touch-up. The App handles download + open animation.
     */
    onOpenBook: (book: BookMetadata, originRect: DOMRect | null, opts: { slotId: string; startIndex?: number; targetRect?: DOMRect | null }) => void;
    /** Keyboard / screen-reader path: open a book without the press-and-hold
     *  gesture. The animation still plays, but commit is automatic. */
    onOpenBookInstant: (book: BookMetadata, originRect: DOMRect | null, startIndex?: number) => void;
    /** Slot identifier of the *specific physical instance* currently being
     *  lifted (e.g. "hero" vs "shelf:84"). The matching slot hides itself so
     *  the floating cover doesn't visually double — other slots for the same
     *  book id stay put. */
    openingSlotId?: string | null;
}

export function StoreFront({ onOpenBook, onOpenBookInstant, openingSlotId }: StoreFrontProps) {
    /** Cover-rect source for the lift visual (where the cover starts from).
     *  Also the gesture commit zone: release the lifted book over the cover's
     *  footprint to open, drag it away (e.g. right, off the cover) to cancel. */
    const heroCoverRef = useRef<HTMLDivElement>(null);

    const themeIndex = useStore((s) => s.themeIndex);
    const setThemeIndex = useStore((s) => s.setThemeIndex);
    const themeMode = useStore((s) => s.mode);
    const toggleMode = useStore((s) => s.toggleMode);
    const activeTab = useStore((s) => s.activeTab);
    const setActiveTab = useStore((s) => s.setActiveTab);
    const progressById = useStore((s) => s.progressById);
    const savedById = useStore((s) => s.savedById);
    const stats = useStore((s) => s.stats);
    const fitMode = useStore((s) => s.fitMode);
    const setFitMode = useStore((s) => s.setFitMode);
    // Note: applying the accent + mode to the document root happens in the App
    // shell (always mounted), so the reader stays themed too.

    // Recently-read books, newest first. The hero "pick up where you left off"
    // points at the most recent; the Library tab lists them all. Each carries
    // its own currentIndex so any book resumes exactly where it was left.
    const recents = useMemo(
        () => Object.values(progressById).sort((a, b) => b.lastReadAt - a.lastReadAt),
        [progressById],
    );
    const progress = recents[0] ?? null;

    // Saved-for-later pile, newest first. Shown below Reading in the Library tab.
    const saved = useMemo(
        () => Object.values(savedById).sort((a, b) => b.savedAt - a.savedAt),
        [savedById],
    );

    const [curated, setCurated] = useState<BookMetadata[] | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    // Inner pages opened from the menu's "More" group, backed out of like the
    // other inner pages. Full-screen layers rather than tabs (they're not part of
    // the primary Browse nav).
    const [statsOpen, setStatsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [aboutOpen, setAboutOpen] = useState(false);
    const [query, setQuery] = useState('');

    // ── Menu drawer: slide-in / swipe-to-dismiss / animated close ─────────
    const drawerPanelRef = useRef<HTMLDivElement>(null);
    const [drawerOffset, setDrawerOffset] = useState(0);
    const [drawerDragging, setDrawerDragging] = useState(false);
    const [drawerClosing, setDrawerClosing] = useState(false);
    const DRAWER_MS = 240;

    // Open animation: when the menu mounts, snap the panel offscreen
    // synchronously (before paint) then animate it back to 0 next frame.
    useLayoutEffect(() => {
        if (menuOpen && !drawerClosing) {
            const w = drawerPanelRef.current?.offsetWidth ?? 320;
            setDrawerOffset(w);
            const id = requestAnimationFrame(() => setDrawerOffset(0));
            return () => cancelAnimationFrame(id);
        }
    }, [menuOpen, drawerClosing]);

    const closeMenu = useCallback(() => {
        if (drawerClosing) return;
        haptics.tick();
        setDrawerClosing(true);
        const w = drawerPanelRef.current?.offsetWidth ?? 320;
        setDrawerOffset(w);
        window.setTimeout(() => {
            setMenuOpen(false);
            setDrawerClosing(false);
            setDrawerOffset(0);
        }, DRAWER_MS);
    }, [drawerClosing]);

    const handleDrawerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (drawerClosing) return;
        // Don't start a swipe from interactive controls — they need their taps.
        const t = e.target as HTMLElement;
        if (t.closest('button, input, [role="button"], a, label, select, textarea')) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const startTime = Date.now();
        const pointerId = e.pointerId;
        let captured = false;

        const cleanup = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
        };

        const onMove = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId) return;
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (!captured) {
                // Vertical-dominant — user is scrolling the drawer's contents.
                if (Math.abs(dy) > Math.abs(dx) + 4 && Math.abs(dy) > 8) {
                    cleanup();
                    return;
                }
                // Leftward — not a dismiss, bail.
                if (dx < -8) { cleanup(); return; }
                // Rightward — claim it as a swipe-to-close gesture.
                if (dx > 8) {
                    captured = true;
                    setDrawerDragging(true);
                }
            }
            if (captured) setDrawerOffset(Math.max(0, dx));
        };

        const onUp = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId) return;
            cleanup();
            setDrawerDragging(false);
            if (!captured) return;
            const dx = ev.clientX - startX;
            const elapsed = Date.now() - startTime;
            const velocity = elapsed > 0 ? dx / elapsed : 0;
            const w = drawerPanelRef.current?.offsetWidth ?? 320;
            // Commit on either: dragged past 35% of width, OR fast rightward flick.
            if (dx > w * 0.35 || velocity > 0.5) closeMenu();
            else setDrawerOffset(0);
        };

        const onCancel = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId) return;
            cleanup();
            setDrawerDragging(false);
            setDrawerOffset(0);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
    };

    const [mode, setMode] = useState<'home' | 'results' | 'vibe'>('home');
    // The open "Vibe out" page (hero + subcategory shelves) and its label/icon.
    const [vibe, setVibe] = useState<VibePage | null>(null);
    const [vibeMeta, setVibeMeta] = useState<{ title: string; icon: VibeIcon; desc: string } | null>(null);
    // Active vibe filter chip: null = the curated overview; otherwise a subcategory
    // title, 'short' (length filter), or 'continue' (in-progress books here).
    const [vibeFilter, setVibeFilter] = useState<string | null>(null);
    const wpm = useStore((s) => s.wpm);
    const setWpm = useStore((s) => s.setWpm);

    // Descending into an inner page (a vibe, search results, or a non-Today tab)
    // should open it at its own top, not inherit the page's current scroll offset.
    // Reset scroll on every page change so position is never carried across.
    useLayoutEffect(() => {
        window.scrollTo(0, 0);
    }, [mode, activeTab]);
    const [results, setResults] = useState<BookMetadata[]>([]);
    const [resultsLabel, setResultsLabel] = useState('');
    // Optional title intro for a results page. Set for "Vibe out" drill-downs so
    // each shows its own icon + blurb above the grid; null for plain search.
    const [resultsIntro, setResultsIntro] = useState<{ icon?: VibeIcon; desc: string } | null>(null);
    const [searching, setSearching] = useState(false);

    const [error, setError] = useState<string | null>(null);

    // Load the curated catalog once on mount. We keep the whole set in state so
    // the Popular shelf can pick the true top 100 by downloads (the `popular`
    // memo); Browse and search read the full module-level list separately.
    useEffect(() => {
        let alive = true;
        library.getCurated()
            .then((books) => { if (alive) setCurated(books); })
            .catch(() => { if (alive) setCurated(FALLBACK_BOOKS); });
        return () => { alive = false; };
    }, []);

    // The featured book shown when there is no real reading progress yet.
    const todaysPick = useMemo<BookMetadata | null>(() => curated?.[0] ?? null, [curated]);

    /** Touch-down handler for any "open this book" surface. The transition
     *  will then track the rest of the gesture (move / up) at the window level.
     *  `targetRect` is the press-target area (e.g. the whole hero card so its
     *  Resume button counts as "inside"); origin is always the cover.
     *  `slotId` identifies which physical instance was pressed so we only
     *  hide that one — not every copy of the same book on screen. */
    const press = useCallback(
        (book: BookMetadata, originRect: DOMRect | null, opts: { slotId: string; startIndex?: number; targetRect?: DOMRect | null }) => {
            onOpenBook(book, originRect, opts);
        },
        [onOpenBook],
    );

    /** Convenience: grab the hero cover's rect (lift origin + commit zone). */
    const heroOrigin = () => heroCoverRef.current?.getBoundingClientRect() ?? null;

    /** Ref callback for the horizontal staff-picks shelf. A mouse can neither
     *  drag-scroll an overflow container nor (with the scrollbar hidden) reach
     *  one, so we add two desktop affordances. Touch panning is the native one
     *  and is left untouched.
     *
     *  1. Wheel → horizontal: translate vertical wheel into horizontal scroll,
     *     but only while the shelf can still scroll that way; at either end we
     *     let the event through so the page scrolls. Native horizontal wheel
     *     (trackpad) passes through too.
     *
     *  2. Grab-and-drag: a sideways mouse drag anywhere on the shelf pans it.
     *     The shelf's cards yield horizontal mouse drags (`scrollsHorizontally`)
     *     so the same drag that scrolls here never also lifts a book; a vertical
     *     pull, a hold, or a tap still lifts/opens. We engage only past the same
     *     threshold the card uses to abort (10px), so a near-still click stays a
     *     tap. Capturing on pointerdown keeps moves coming if the cursor leaves
     *     the shelf; if a card claims the pointer for a vertical lift it steals
     *     capture and we get `lostpointercapture`, which resets us.
     *
     *  Non-passive wheel listener is required to call preventDefault. */
    // Mouse drag-to-scroll for the Popular shelf (touch pans natively). The same
    // hook drives every vibe-page lane so they all drag identically.
    const shelfRef = useDragScroll();

    const runQuery = useCallback(async (
        label: string,
        fn: () => Promise<BookMetadata[]>,
        intro: { icon?: VibeIcon; desc: string } | null = null,
    ) => {
        setMode('results');
        setResultsLabel(label);
        setResultsIntro(intro);
        setSearching(true);
        setResults([]);
        setError(null);
        try {
            setResults(await fn());
        } catch {
            setError('Search failed. Please check your connection and try again.');
        } finally {
            setSearching(false);
        }
    }, []);

    /** The catch-all Browse page: every curated book, shown in the results grid,
     *  which doubles as the search surface (the page carries its own search box).
     *  This is where books beyond the top-100 Popular shelf stay reachable. */
    const openBrowse = useCallback(() => {
        haptics.tick();
        setActiveTab('today');
        runQuery('Browse', () => library.getCurated());
    }, [runQuery, setActiveTab]);

    /** Open a full vibe page (deeper-cuts hero + subcategory shelves). Loads the
     *  bundled vibe data, so it is instant and works offline. */
    const openVibe = useCallback(async (v: { key: string; title: string; icon: VibeIcon; desc: string }) => {
        haptics.tick();
        setMode('vibe');
        setVibeFilter(null);
        setVibe(null);
        setVibeMeta({ title: v.title, icon: v.icon, desc: v.desc });
        setError(null);
        try {
            setVibe(await library.getVibePage(v.key));
        } catch {
            setError('Could not open that shelf. Please try again.');
        }
    }, []);

    const submitSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const q = query.trim();
        if (q) runQuery(`“${q}”`, () => library.search(q));
    };

    const clearResults = () => {
        setMode('home');
        setQuery('');
        setResults([]);
        setResultsIntro(null);
        setVibe(null);
        setVibeMeta(null);
        setVibeFilter(null);
    };

    /** Jump to the dedicated Recents list (Library tab). Clears any active
     *  search first so the tab content actually shows. */
    const goToRecents = () => {
        haptics.tick();
        clearResults();
        setActiveTab('library');
    };

    /** Back out of any inner page (Recents / Shelves / Notebook) to the Today
     *  home page. Inner pages are entered from the drawer or a button and always
     *  climb back here. (See feedback-navigation-model.) */
    const goHome = () => {
        haptics.tick();
        clearResults();
        setActiveTab('today');
    };

    // The inner-page header lives in the top bar (the shared InnerPageHeader,
    // also worn by the reader): a back control + title where the
    // search/menu sits on home. Non-null = we're on an inner page; null = the
    // Today home page, which keeps the [search][menu] bar and never gets a back
    // control or title. (See feedback-navigation-model.)
    const innerHeader: { title: string; eyebrow?: string; backLabel: string; onBack: () => void } | null =
        mode === 'vibe'
            ? { title: vibeMeta?.title ?? 'Vibe', eyebrow: 'Vibe out', backLabel: 'Back', onBack: () => { haptics.tick(); clearResults(); } }
            : mode === 'results'
            ? { title: resultsLabel, eyebrow: resultsIntro ? 'Vibe out' : 'Reading room results', backLabel: 'Back', onBack: () => { haptics.tick(); clearResults(); } }
            : activeTab === 'library'
            ? { title: 'Library', backLabel: 'Back to home', onBack: goHome }
            : activeTab === 'notebook'
            ? { title: 'Notebook', backLabel: 'Back to home', onBack: goHome }
            : null;

    // The Popular shelf: the most-read books, capped at 100. curated.json is built
    // most-downloaded-first; we sort defensively and slice. Everything beyond this
    // stays reachable in Browse (nothing is removed from the app).
    const popular = useMemo(
        () => [...(curated ?? [])].sort((a, b) => (b.downloadCount ?? 0) - (a.downloadCount ?? 0)).slice(0, 100),
        [curated],
    );

    // ─── Hero card content: real progress vs. today's pick ────────────────
    const hasProgress = progress !== null && progress.totalTokens > 0;
    const progressPct = hasProgress
        ? Math.min(100, Math.round((progress.currentIndex / progress.totalTokens) * 100))
        : 0;
    // The scene the reader left off in (books with an authored scene map only),
    // for the calm "previously…" recap on the resume hero.
    const heroScene = progress ? sceneAt(progress.bookId, progress.currentIndex) : null;

    /** Press-and-hold on the hero cover — lifts the book with the cover as the
     *  commit zone (release over it to open, drag away to cancel). */
    const pressHero = useCallback((book: BookMetadata, startIndex?: number) => {
        press(book, heroOrigin(), { slotId: 'hero', startIndex });
    }, [press]);

    /** Keyboard activation (Enter/Space) on hero surface — no gesture available,
     *  fall back to instant-open. */
    const keyboardOpenHero = useCallback((book: BookMetadata, startIndex?: number) => {
        onOpenBookInstant(book, heroOrigin(), startIndex);
    }, [onOpenBookInstant]);

    const progressBook = (): BookMetadata | null => progress && {
        id: progress.bookId,
        title: progress.title,
        author: progress.author,
        coverUrl: progress.coverUrl,
        textUrl: progress.textUrl,
    };

    // ─── Reading Stats figures ────────────────────────────────────────────
    // Derived from cumulative session totals (stats) plus per-book progress.
    // There is no daily series yet (we store lifetime totals + each book's
    // last-read time, not timestamped sessions), so no streak or weekly chart.
    const statMinutes = Math.round(stats.msRead / 60000);
    const statPages = Math.floor(stats.wordsRead / 250); // ~250 words/page (publishing std)
    const avgWpm = stats.msRead > 0 ? Math.round(stats.wordsRead / (stats.msRead / 60000)) : null;
    const isFinished = (r: ReadingProgress) => r.totalTokens > 0 && r.currentIndex / r.totalTokens >= 0.99;
    const finishedCount = recents.filter(isFinished).length;
    const readingNow = recents.filter((r) => !isFinished(r));
    const BASELINE_WPM = 250; // a typical adult silent-reading pace
    const minutesSaved = avgWpm && avgWpm > BASELINE_WPM
        ? Math.round(stats.wordsRead / BASELINE_WPM - stats.wordsRead / avgWpm)
        : 0;
    // Benchmark against an "average reader" (the 250 wpm baseline): two pace bars
    // scaled to whichever is faster, plus a faster/slower takeaway.
    const avgReaderMinutes = Math.round(stats.wordsRead / BASELINE_WPM);
    const benchMax = Math.max(avgWpm ?? 0, BASELINE_WPM);
    const youBarW = avgWpm ? Math.round((avgWpm / benchMax) * 100) : 0;
    const avgBarW = Math.round((BASELINE_WPM / benchMax) * 100);
    const paceRatio = avgWpm ? avgWpm / BASELINE_WPM : null;
    const pacePct = paceRatio ? Math.round(Math.abs(paceRatio - 1) * 100) : 0;
    const paceFaster = paceRatio !== null && paceRatio > 1.03;
    const paceSlower = paceRatio !== null && paceRatio < 0.97;
    const hasAnyStats = stats.wordsRead > 0 || recents.length > 0;
    const fmtDuration = (min: number) => {
        if (min < 1) return '< 1m';
        if (min < 60) return `${min}m`;
        const h = Math.floor(min / 60);
        const m = min % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    };

    return (
        <div
            className="min-h-screen bg-warm-beige font-sans text-espresso selection:bg-coral-accent/20 overflow-x-clip"
            style={{
                backgroundImage:
                    'radial-gradient(120% 80% at 50% -10%, rgba(212,154,63,0.10), transparent 55%), radial-gradient(90% 60% at 100% 0%, rgba(194,103,75,0.07), transparent 50%)',
            }}
        >
            {/* ── Sticky top bar. The Today home page keeps [search][menu]; every
                 inner page (and the reader) instead render the shared
                 reader-style [back][title] bar — no search/menu, back out to home to
                 reach those — so they all wear one header. (See InnerPageHeader.) ── */}
            {innerHeader ? (
                <InnerPageHeader
                    title={innerHeader.title}
                    eyebrow={innerHeader.eyebrow}
                    backLabel={innerHeader.backLabel}
                    onBack={innerHeader.onBack}
                />
            ) : (
                <header className="sticky top-0 z-30 bg-warm-beige border-b border-espresso/[0.08]">
                    <div
                        className="max-w-md mx-auto px-5 py-3.5 flex items-center gap-3 min-h-[68px]"
                        style={{ paddingTop: 'max(0.875rem, env(safe-area-inset-top))' }}
                    >
                        <form onSubmit={submitSearch} className="flex-1">
                            <div className="bg-cream rounded-full px-5 py-3.5 flex items-center gap-3 ring-1 ring-espresso/10 shadow-[inset_0_1px_3px_rgba(58,42,30,0.08)] focus-within:ring-coral-accent/40 transition-shadow">
                                <Search size={18} className="text-mocha/70 shrink-0" />
                                <input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search Focus Reader"
                                    aria-label="Search Focus Reader"
                                    className="bg-transparent border-none outline-none w-full text-espresso placeholder-mocha/60 font-medium"
                                />
                                {query && (
                                    <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-mocha/60 hover:text-espresso shrink-0">
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        </form>
                        <button
                            type="button"
                            aria-label="Menu"
                            onClick={() => { haptics.tick(); setMenuOpen(true); }}
                            className="w-12 h-12 rounded-full bg-cream ring-1 ring-espresso/10 flex items-center justify-center text-espresso shrink-0 shadow-sm active:scale-90 transition-transform"
                        >
                            <Menu size={20} />
                        </button>
                    </div>
                </header>
            )}

            <main
                className="max-w-md mx-auto px-5 pt-5"
                style={{ paddingBottom: 'max(3rem, env(safe-area-inset-bottom))' }}
            >
                {error && (
                    <div className="mb-5 flex items-start gap-2 rounded-2xl bg-coral-accent/10 ring-1 ring-coral-accent/30 px-4 py-3 text-[13px] text-espresso">
                        <span className="flex-1">{error}</span>
                        <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="text-mocha hover:text-espresso shrink-0"><X size={16} /></button>
                    </div>
                )}

                {mode === 'vibe' ? (
                    /* ── Vibe page (bedtime-style IA): a calm intro, filter chips as
                       primary anchors, one opinionated "pick", then chunked swimlanes
                       with read-time chips. Tapping a chip / "see all" focuses to a
                       bounded set. (See design brief: minimize decision fatigue.) ── */
                    <section className="mb-7">
                        {vibeMeta && (
                            <p className="font-serif italic text-[14px] text-mocha leading-relaxed border-l-2 border-coral-accent/50 pl-3.5 mb-5">{vibeMeta.desc}</p>
                        )}
                        {vibe === null ? (
                            <div className="flex gap-5 overflow-hidden -mx-5 px-5">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="flex-shrink-0 w-44"><CoverSkeleton /></div>
                                ))}
                            </div>
                        ) : (() => {
                            const shelves = vibe.shelves;
                            const allBooks = [...vibe.hero, ...shelves.flatMap((s) => s.books)];
                            const vibeIds = new Set(allBooks.map((b) => b.id));
                            const inProgress = recents.filter((r) => vibeIds.has(r.bookId) && r.totalTokens > 0);
                            const SHORT_MAX_MIN = 45;
                            const shortBooks = allBooks
                                .filter((b) => b.words && b.words / Math.max(1, wpm) <= SHORT_MAX_MIN)
                                .sort((a, b) => (a.words ?? 0) - (b.words ?? 0));
                            const heroPick = vibe.hero[0] ?? allBooks[0];
                            const deeperCuts = vibe.hero.slice(1);

                            const chips: { key: string | null; label: string }[] = [
                                { key: null, label: 'All' },
                                ...(shortBooks.length >= 3 ? [{ key: 'short', label: 'Short reads' }] : []),
                                ...(inProgress.length ? [{ key: 'continue', label: 'Continue' }] : []),
                                ...shelves.map((s) => ({ key: s.title as string | null, label: s.title })),
                            ];

                            // A swimlane card (carousel) with a read-time chip.
                            const laneCard = (book: BookMetadata, slotPrefix: string, widthClass = 'w-36') => {
                                const slotId = `${slotPrefix}:${book.id}`;
                                return (
                                    <div key={book.id} className="snap-start flex-shrink-0">
                                        <BookCard
                                            title={book.title} author={book.author} coverUrl={book.coverUrl} book={book}
                                            badge={<ReadChip words={book.words} wpm={wpm} />}
                                            widthClass={widthClass} holdMs={SHELF_HOLD_MS} scrollsHorizontally
                                            hidden={openingSlotId === slotId}
                                            onPress={(rect) => press(book, rect, { slotId, startIndex: progressById[book.id]?.currentIndex })}
                                            onActivate={(rect) => onOpenBookInstant(book, rect, progressById[book.id]?.currentIndex)}
                                        />
                                    </div>
                                );
                            };
                            // A grid card (focused / filtered views).
                            const gridCard = (book: BookMetadata) => {
                                const slotId = `vibe-grid:${book.id}`;
                                return (
                                    <BookCard
                                        key={book.id}
                                        title={book.title} author={book.author} coverUrl={book.coverUrl} book={book}
                                        badge={<ReadChip words={book.words} wpm={wpm} />}
                                        hidden={openingSlotId === slotId}
                                        onPress={(rect) => press(book, rect, { slotId, startIndex: progressById[book.id]?.currentIndex })}
                                        onActivate={(rect) => onOpenBookInstant(book, rect, progressById[book.id]?.currentIndex)}
                                    />
                                );
                            };
                            const pickFilter = (key: string | null) => { haptics.tick(); setVibeFilter(key); window.scrollTo(0, 0); };

                            return (
                                <>
                                    {/* filter chips — the primary navigation anchors */}
                                    <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                        {chips.map((c) => (
                                            <FilterChip key={c.key ?? 'all'} active={vibeFilter === c.key} onClick={() => pickFilter(c.key)}>{c.label}</FilterChip>
                                        ))}
                                    </div>

                                    {vibeFilter === null ? (
                                        <div>
                                            {/* one opinionated pick */}
                                            {heroPick && (
                                                <section className="mt-6 rounded-3xl bg-cream ring-1 ring-espresso/10 shadow-[0_4px_18px_rgba(58,42,30,0.07)] p-5">
                                                    <Eyebrow>&middot; Our pick for you &middot;</Eyebrow>
                                                    <div className="flex gap-4 mt-4">
                                                        <div className="shrink-0 w-[84px] rotate-[-4deg] mt-1">
                                                            <BookCover title={heroPick.title} author={heroPick.author} coverUrl={heroPick.coverUrl} variant="framed" size="sm" priority />
                                                        </div>
                                                        <div className="flex-1 min-w-0 pt-1">
                                                            <h3 className="font-serif text-[20px] font-semibold text-espresso leading-tight line-clamp-2">{heroPick.title}</h3>
                                                            <p className="font-serif italic text-[12px] text-mocha mt-1">{heroPick.author}</p>
                                                            <ReadChip words={heroPick.words} wpm={wpm} className="mt-2.5" />
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-3 mt-5">
                                                        <button
                                                            type="button"
                                                            onClick={() => onOpenBookInstant(heroPick, null, progressById[heroPick.id]?.currentIndex)}
                                                            className="flex-1 flex items-center justify-center gap-2 bg-coral-accent text-[rgb(var(--coral-accent-text))] rounded-full py-3.5 font-semibold text-[15px] shadow-md shadow-coral-accent/25"
                                                            style={{ touchAction: 'manipulation' }}
                                                        >
                                                            <BookOpen size={18} /> Start reading
                                                        </button>
                                                        <SaveButton book={heroPick} tone="plain" className="self-center" />
                                                    </div>
                                                </section>
                                            )}

                                            {inProgress.length > 0 && (
                                                <Swimlane title="Where you left off">
                                                    {inProgress.slice(0, 10).map((r) => {
                                                        const b: BookMetadata = { id: r.bookId, title: r.title, author: r.author, coverUrl: r.coverUrl, textUrl: r.textUrl };
                                                        const pct = Math.min(100, Math.round((r.currentIndex / r.totalTokens) * 100));
                                                        const slotId = `vibe-cont:${b.id}`;
                                                        return (
                                                            <div key={b.id} className="snap-start flex-shrink-0">
                                                                <BookCard
                                                                    title={b.title} author={b.author} coverUrl={b.coverUrl} book={b}
                                                                    badge={<span className="inline-flex items-center rounded-full bg-coral-accent/15 px-2 py-0.5 text-[10px] font-semibold text-coral-accent">{pct}% read</span>}
                                                                    holdMs={SHELF_HOLD_MS} scrollsHorizontally hidden={openingSlotId === slotId}
                                                                    onPress={(rect) => press(b, rect, { slotId, startIndex: r.currentIndex })}
                                                                    onActivate={(rect) => onOpenBookInstant(b, rect, r.currentIndex)}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </Swimlane>
                                            )}

                                            {shelves.map((shelf) => (
                                                <Swimlane key={shelf.title} title={shelf.title} onSeeAll={() => pickFilter(shelf.title)}>
                                                    {shelf.books.slice(0, 10).map((book) => laneCard(book, `vibe-${shelf.title}`))}
                                                </Swimlane>
                                            ))}

                                            {deeperCuts.length > 0 && (
                                                <Swimlane title="Deeper cuts">
                                                    {deeperCuts.slice(0, 10).map((book) => laneCard(book, 'vibe-hero', 'w-44'))}
                                                </Swimlane>
                                            )}
                                        </div>
                                    ) : vibeFilter === 'continue' ? (
                                        <div className="mt-6 flex flex-col gap-2.5">
                                            {inProgress.map((r) => <RecentRow key={r.bookId} r={r} onOpen={onOpenBookInstant} />)}
                                        </div>
                                    ) : (
                                        <div className="mt-6 grid grid-cols-2 gap-y-6 justify-items-center">
                                            {(vibeFilter === 'short' ? shortBooks : (shelves.find((s) => s.title === vibeFilter)?.books ?? [])).map((book) => gridCard(book))}
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </section>
                ) : mode === 'results' ? (
                    /* ── Search / topic results: an inner page. Back returns to
                       wherever the search was launched from (home or Recents). ── */
                    <section className="mb-7">
                        {/* Browse + plain search carry their own search box (this page
                            doubles as the search surface). Vibe "see all" pages skip it. */}
                        {!resultsIntro && (
                            <form onSubmit={submitSearch} className="mb-5">
                                <div className="bg-cream rounded-full px-5 py-3 flex items-center gap-3 ring-1 ring-espresso/10 shadow-[inset_0_1px_3px_rgba(58,42,30,0.08)] focus-within:ring-coral-accent/40 transition-shadow">
                                    <Search size={18} className="text-mocha/70 shrink-0" />
                                    <input
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Search all books"
                                        aria-label="Search all books"
                                        className="bg-transparent border-none outline-none w-full text-espresso placeholder-mocha/60 font-medium"
                                    />
                                    {query && (
                                        <button type="button" onClick={() => { setQuery(''); openBrowse(); }} aria-label="Clear search" className="text-mocha/60 hover:text-espresso shrink-0"><X size={16} /></button>
                                    )}
                                </div>
                            </form>
                        )}
                        {resultsIntro && (
                            <div className="mb-6">
                                <h2 className="font-serif text-[22px] font-semibold text-espresso tracking-tight leading-tight flex items-center">
                                    {resultsIntro.icon && <span aria-hidden="true" className="mr-2"><resultsIntro.icon size={24} /></span>}{resultsLabel}
                                </h2>
                                <p className="text-[13px] text-mocha italic mt-2 leading-relaxed">{resultsIntro.desc}</p>
                            </div>
                        )}
                        {searching ? (
                            <div className="grid grid-cols-2 gap-y-6 justify-items-center">
                                {Array.from({ length: 6 }).map((_, i) => <CoverSkeleton key={i} />)}
                            </div>
                        ) : results.length === 0 ? (
                            <p className="text-center text-[14px] text-mocha italic py-10">Nothing on the shelf for that. Try another title or author.</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-y-6 justify-items-center">
                                {results.map((book) => {
                                    const slotId = `search:${book.id}`;
                                    return (
                                        <BookCard
                                            key={book.id}
                                            title={book.title}
                                            author={book.author}
                                            coverUrl={book.coverUrl}
                                            book={book}
                                            hidden={openingSlotId === slotId}
                                            onPress={(rect) => press(book, rect, { slotId, startIndex: progressById[book.id]?.currentIndex })}
                                            onActivate={(rect) => onOpenBookInstant(book, rect, progressById[book.id]?.currentIndex)}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </section>
                ) : activeTab === 'today' ? (
                    /* ── Today: the home page. Everything else (Recents, Shelves,
                       Notebook, the reader, search results) is an inner page you
                       descend into and back out of — home alone has no back control. */
                    <div>
                        {/* Hero card: real progress if available, else today's pick.
                            Pressing the cover, the title, or Resume starts the open
                            gesture; Recents is a plain link to the Library tab. */}
                        <section>
                            <div
                                className="rounded-3xl bg-cream ring-1 ring-espresso/10 shadow-[0_4px_18px_rgba(58,42,30,0.07)] p-5"
                                style={{ touchAction: 'manipulation' }}
                            >
                                {hasProgress ? (
                                    <>
                                        <Eyebrow>&middot; Pick up where you left off &middot;</Eyebrow>
                                        <div className="flex gap-4 mt-4">
                                            <div
                                                role={openingSlotId === 'hero' ? undefined : 'button'}
                                                tabIndex={openingSlotId === 'hero' ? -1 : 0}
                                                aria-label={openingSlotId === 'hero' ? undefined : `Resume ${progress.title}`}
                                                aria-hidden={openingSlotId === 'hero' || undefined}
                                                onPointerDown={openingSlotId === 'hero' ? undefined : (e) => startPressGesture(e, {
                                                    onPress: () => { const b = progressBook(); if (b) pressHero(b, progress.currentIndex); },
                                                    onActivate: () => { const b = progressBook(); if (b) keyboardOpenHero(b, progress.currentIndex); },
                                                })}
                                                onKeyDown={openingSlotId === 'hero' ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const b = progressBook(); if (b) keyboardOpenHero(b, progress.currentIndex); } }}
                                                ref={heroCoverRef}
                                                className="relative shrink-0 w-[88px] rotate-[-4deg] mt-1 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-accent rounded-md"
                                                style={{ pointerEvents: openingSlotId === 'hero' ? 'none' : undefined, touchAction: 'manipulation' }}
                                            >
                                                {openingSlotId === 'hero' ? (
                                                    <div aria-hidden="true" className="w-full aspect-[2/3] rounded-l-[3px] rounded-r-xl bg-espresso/[0.13] ring-1 ring-espresso/10 shadow-[inset_0_3px_10px_rgba(58,42,30,0.22)] animate-fade-in" />
                                                ) : (
                                                    <>
                                                        <span className="absolute -top-1.5 right-3 z-10 w-3 h-6 bg-coral-accent rounded-b-sm shadow-sm before:content-[''] before:absolute before:bottom-0 before:left-0 before:border-x-[6px] before:border-x-transparent before:border-b-[5px] before:border-b-warm-beige" />
                                                        <BookCover title={progress.title} author={progress.author} coverUrl={progress.coverUrl} variant="framed" size="sm" priority />
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0 pt-1">
                                                <h3 className="font-serif text-[20px] font-semibold text-espresso leading-tight line-clamp-2">
                                                    {progress.title}
                                                </h3>
                                                <p className="font-serif italic text-[12px] text-mocha mt-1">{progress.author}</p>
                                            </div>
                                        </div>
                                        <div className="mt-5">
                                            <div className="flex justify-between text-[10px] font-semibold tracking-[0.12em] text-mocha uppercase mb-1.5">
                                                <span>{progressPct}% complete</span>
                                                <span>{progress.currentIndex.toLocaleString()} / {progress.totalTokens.toLocaleString()} words</span>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-espresso/10 overflow-hidden">
                                                <div className="h-full rounded-full bg-coral-accent transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
                                            </div>
                                        </div>
                                        {heroScene && heroScene.recap && (
                                            <div className="mt-4 rounded-xl bg-espresso/[0.04] ring-1 ring-espresso/[0.06] px-3.5 py-2.5">
                                                <p className="text-[9px] font-semibold tracking-[0.18em] text-mocha/70 uppercase">Previously &middot; {heroScene.label}</p>
                                                <p className="font-serif italic text-[12.5px] text-mocha leading-snug mt-1">{heroScene.recap}</p>
                                            </div>
                                        )}
                                        <div className="flex gap-3 mt-5">
                                            <button
                                                type="button"
                                                onPointerDown={(e) => startPressGesture(e, {
                                                    onPress: () => { const b = progressBook(); if (b) keyboardOpenHero(b, progress.currentIndex); },
                                                    onActivate: () => { const b = progressBook(); if (b) keyboardOpenHero(b, progress.currentIndex); },
                                                })}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const b = progressBook(); if (b) keyboardOpenHero(b, progress.currentIndex); } }}
                                                className="flex-1 flex items-center justify-center gap-2 bg-coral-accent text-[rgb(var(--coral-accent-text))] rounded-full py-3.5 font-semibold text-[15px] shadow-md shadow-coral-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-accent focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                                                style={{ touchAction: 'manipulation' }}
                                            >
                                                <BookOpen size={18} /> Resume
                                            </button>
                                            <button
                                                type="button"
                                                onClick={goToRecents}
                                                aria-label="Recently read"
                                                className="flex items-center gap-1.5 px-5 rounded-full bg-cream ring-1 ring-espresso/15 text-espresso font-semibold text-[15px] active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-accent focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                                                style={{ touchAction: 'manipulation' }}
                                            >
                                                <Clock size={16} /> Recents
                                            </button>
                                        </div>
                                    </>
                                ) : todaysPick ? (
                                    <>
                                        <Eyebrow>&middot; Today's pick &middot;</Eyebrow>
                                        <div className="flex gap-4 mt-4">
                                            <div
                                                role={openingSlotId === 'hero' ? undefined : 'button'}
                                                tabIndex={openingSlotId === 'hero' ? -1 : 0}
                                                aria-label={openingSlotId === 'hero' ? undefined : `Open ${todaysPick.title}`}
                                                aria-hidden={openingSlotId === 'hero' || undefined}
                                                onPointerDown={openingSlotId === 'hero' ? undefined : (e) => startPressGesture(e, {
                                                    onPress: () => pressHero(todaysPick),
                                                    onActivate: () => keyboardOpenHero(todaysPick),
                                                })}
                                                onKeyDown={openingSlotId === 'hero' ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); keyboardOpenHero(todaysPick); } }}
                                                ref={heroCoverRef}
                                                className="relative shrink-0 w-[88px] rotate-[-4deg] mt-1 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-accent rounded-md"
                                                style={{ pointerEvents: openingSlotId === 'hero' ? 'none' : undefined, touchAction: 'manipulation' }}
                                            >
                                                {openingSlotId === 'hero' ? (
                                                    <div aria-hidden="true" className="w-full aspect-[2/3] rounded-l-[3px] rounded-r-xl bg-espresso/[0.13] ring-1 ring-espresso/10 shadow-[inset_0_3px_10px_rgba(58,42,30,0.22)] animate-fade-in" />
                                                ) : (
                                                    <>
                                                        <span className="absolute -top-1.5 right-3 z-10 w-3 h-6 bg-coral-accent rounded-b-sm shadow-sm before:content-[''] before:absolute before:bottom-0 before:left-0 before:border-x-[6px] before:border-x-transparent before:border-b-[5px] before:border-b-warm-beige" />
                                                        <BookCover title={todaysPick.title} author={todaysPick.author} coverUrl={todaysPick.coverUrl} variant="framed" size="sm" priority />
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0 pt-1">
                                                <h3 className="font-serif text-[20px] font-semibold text-espresso leading-tight line-clamp-2">
                                                    {todaysPick.title}
                                                </h3>
                                                <p className="font-serif italic text-[12px] text-mocha mt-1">{todaysPick.author}</p>
                                            </div>
                                        </div>
                                        <p className="font-serif italic text-[13px] text-mocha leading-relaxed mt-4">
                                            A quiet beginning &mdash; press and hold to open the book.
                                        </p>
                                        <div className="flex gap-3 mt-5">
                                            <button
                                                type="button"
                                                onPointerDown={(e) => startPressGesture(e, {
                                                    onPress: () => keyboardOpenHero(todaysPick),
                                                    onActivate: () => keyboardOpenHero(todaysPick),
                                                })}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); keyboardOpenHero(todaysPick); } }}
                                                className="flex-1 flex items-center justify-center gap-2 bg-coral-accent text-[rgb(var(--coral-accent-text))] rounded-full py-3.5 font-semibold text-[15px] shadow-md shadow-coral-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-accent focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                                                style={{ touchAction: 'manipulation' }}
                                            >
                                                <BookOpen size={18} /> Start Reading
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="py-6 text-center">
                                        <Loader2 size={22} className="inline-block text-coral-accent animate-spin" />
                                        <p className="font-serif italic text-[13px] text-mocha mt-2">Setting the table…</p>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Front table shelf — horizontally scrolls; larger, tappable covers */}
                        <section className="mt-14">
                            <div className="flex justify-between items-end mb-4">
                                <div>
                                    <h2 className="font-serif text-[22px] font-semibold text-espresso tracking-tight leading-none">Popular</h2>
                                    <p className="text-[12px] text-mocha italic mt-1">The most read on Focus Reader</p>
                                </div>
                                <button type="button" onClick={openBrowse} className="group flex items-center text-[13px] font-semibold text-coral-accent hover:text-coral-accent/80 active:text-coral-accent/70 transition-colors shrink-0 pb-0.5 select-none">
                                    see all <ArrowRight size={14} className="ml-1 transition-transform duration-150 group-active:translate-x-1" />
                                </button>
                            </div>
                            <div ref={shelfRef} className="flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-pl-5 -mx-5 px-5 pt-7 -mt-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                {curated === null
                                    ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="snap-start flex-shrink-0 w-44"><CoverSkeleton /></div>)
                                    : popular.map((book) => {
                                        const fb = book as BookMetadata & { variant?: CoverVariant; tint?: string };
                                        const slotId = `shelf:${book.id}`;
                                        return (
                                            <div key={book.id} className="snap-start flex-shrink-0">
                                                <BookCard
                                                    title={book.title}
                                                    author={book.author}
                                                    coverUrl={book.coverUrl}
                                                    book={book}
                                                    variant={fb.variant}
                                                    tint={fb.tint}
                                                    widthClass="w-44"
                                                    holdMs={SHELF_HOLD_MS}
                                                    scrollsHorizontally
                                                    hidden={openingSlotId === slotId}
                                                    onPress={(rect) => press(book, rect, { slotId, startIndex: progressById[book.id]?.currentIndex })}
                                                    onActivate={(rect) => onOpenBookInstant(book, rect, progressById[book.id]?.currentIndex)}
                                                />
                                            </div>
                                        );
                                    })}
                                <div className="w-1 shrink-0" />
                            </div>
                        </section>

                        {/* "Vibe out" — pick a feeling, not a genre. 44px+ touch targets. */}
                        <section className="mt-14">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h2 className="font-serif text-[22px] font-semibold text-espresso tracking-tight leading-none">Vibe out</h2>
                                    <p className="text-[12px] text-mocha italic mt-1">Pick a feeling, not a genre.</p>
                                </div>
                                <Coffee size={18} className="text-mocha/50 mt-1" />
                            </div>
                            <div className="flex flex-col gap-2.5">
                                {VIBES.map((v) => (
                                    <Vibe key={v.title} icon={v.icon} title={v.title} sub={v.sub} onClick={() => openVibe(v)} />
                                ))}
                            </div>
                        </section>

                        {/* Reading stats — derived from real session tracking in App.tsx.
                            Cumulative across all books/time; weekly buckets are a future
                            enhancement (would need timestamped sessions, not just totals). */}
                        <section className="mt-14">
                            <div className="rounded-2xl bg-cream/70 ring-1 ring-espresso/10 px-5 py-5">
                                <Eyebrow>&middot; Your Reading &middot;</Eyebrow>
                                {(() => {
                                    const minutes = Math.round(stats.msRead / 60000);
                                    // ~250 words/page is the standard publishing approximation.
                                    const pages = Math.floor(stats.wordsRead / 250);
                                    const avgWpm = stats.msRead > 0
                                        ? Math.round(stats.wordsRead / (stats.msRead / 60000))
                                        : null;
                                    const cells = [
                                        { n: minutes.toLocaleString(), l: 'Minutes' },
                                        { n: pages.toLocaleString(), l: 'Pages' },
                                        { n: avgWpm !== null ? avgWpm.toLocaleString() : '—', l: 'Avg WPM' },
                                    ];
                                    return (
                                        <div className="grid grid-cols-3 mt-4">
                                            {cells.map((s, i) => (
                                                <div key={s.l} className={`text-center ${i !== 0 ? 'border-l border-espresso/10' : ''}`}>
                                                    <p className="font-serif text-[28px] font-semibold text-espresso leading-none tabular-nums">{s.n}</p>
                                                    <p className="text-[10px] font-semibold tracking-[0.15em] text-mocha uppercase mt-1.5">{s.l}</p>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        </section>

                        {/* A note from the room */}
                        <section className="mt-14">
                            <div className="relative rounded-2xl bg-espresso text-cream px-5 py-5 overflow-hidden">
                                <Coffee size={86} className="absolute -right-4 -bottom-5 text-cream/5" />
                                <p className="text-[10px] font-semibold tracking-[0.22em] text-mustard/80 uppercase">&middot; A note from the room &middot;</p>
                                <p className="font-serif italic text-[16px] leading-relaxed mt-3 text-cream/95">
                                    &ldquo;Some books are to be tasted, others to be swallowed.&rdquo;
                                </p>
                                <p className="text-[10px] font-semibold tracking-[0.18em] text-mustard/70 uppercase mt-3">&mdash; Francis Bacon</p>
                            </div>
                        </section>
                    </div>
                ) : activeTab === 'library' ? (
                    recents.length === 0 && saved.length === 0 ? (
                        <EmptyTab
                            icon={Library}
                            title="Your library is empty"
                            body="Open a book to pick up where you left off, or tap the bookmark on any book to save it for later."
                            footnote={null}
                        />
                    ) : (
                        <div className="flex flex-col gap-12">
                            {/* Reading — books in progress, each remembering its spot. */}
                            {recents.length > 0 && (
                                <section>
                                    <Eyebrow>&middot; Reading &middot;</Eyebrow>
                                    <p className="font-serif italic text-[13px] text-mocha leading-relaxed text-center mt-1.5 mb-4">
                                        Pick up any book exactly where you left it.
                                    </p>
                                    <div className="flex flex-col gap-2.5">
                                        {recents.map((r) => (
                                            <RecentRow key={r.bookId} r={r} onOpen={onOpenBookInstant} />
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Saved for later — the want-to-read pile. Grouping these
                                into named shelves (playlist-style) comes later. */}
                            <section>
                                <Eyebrow>&middot; Saved for later &middot;</Eyebrow>
                                {saved.length === 0 ? (
                                    <p className="font-serif italic text-[13px] text-mocha leading-relaxed text-center mt-1.5">
                                        Tap the bookmark on any book to keep it here for later.
                                    </p>
                                ) : (
                                    <div className="flex flex-col gap-2.5 mt-4">
                                        {saved.map((b) => (
                                            <BookRow
                                                key={b.bookId}
                                                book={{ id: b.bookId, title: b.title, author: b.author, coverUrl: b.coverUrl, textUrl: b.textUrl }}
                                                onOpen={onOpenBookInstant}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    )
                ) : (
                    <EmptyTab
                        icon={Notebook}
                        title="The notebook is blank"
                        body="Passages you highlight while reading will gather here — quiet thoughts kept aside."
                    />
                )}
            </main>

            {/* ═══ MENU DRAWER ═══
                Slides in from the right on open; swipe-right (or tap scrim,
                or tap the X) to dismiss with the same animation. */}
            {menuOpen && (
                <div className="fixed inset-0 z-[70]" role="dialog" aria-label="Menu" aria-modal="true">
                    {/* Scrim — fades in on mount via animation, fades out via inline opacity. */}
                    <div
                        className={`absolute inset-0 bg-espresso/40 ${drawerClosing ? '' : 'animate-fade-in'}`}
                        style={drawerClosing ? { opacity: 0, transition: `opacity ${DRAWER_MS}ms ease` } : undefined}
                        onClick={closeMenu}
                    />
                    {/* Panel */}
                    <div
                        ref={drawerPanelRef}
                        className="absolute right-0 top-0 bottom-0 w-[82%] max-w-xs bg-warm-beige shadow-2xl flex flex-col"
                        style={{
                            transform: `translate3d(${drawerOffset}px, 0, 0)`,
                            transition: drawerDragging ? 'none' : `transform ${DRAWER_MS}ms cubic-bezier(.2,.8,.25,1)`,
                            // Allow vertical pan inside the drawer (scrolling its content)
                            // while we still handle horizontal swipe-to-dismiss in JS.
                            touchAction: 'pan-y',
                        }}
                        onPointerDown={handleDrawerPointerDown}
                    >
                        {/* Tactile grab handle along the left edge — telegraphs the swipe affordance */}
                        <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-12 rounded-full bg-espresso/15 pointer-events-none" aria-hidden="true" />

                        <div className="flex items-center justify-between px-5 pt-6 pb-4">
                            <h2 className="font-serif text-[20px] font-semibold text-espresso">Menu</h2>
                            <button
                                type="button"
                                onClick={closeMenu}
                                aria-label="Close menu"
                                className="w-9 h-9 rounded-full bg-cream ring-1 ring-espresso/10 flex items-center justify-center text-mocha active:scale-90 transition-transform"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="px-5 pb-6 flex-1 overflow-y-auto">
                            {/* Primary navigation — the drawer is the single nav hub
                                (no bottom tab bar). The Library item opens the Recents list. */}
                            <p className="text-[10px] font-semibold tracking-[0.22em] text-mocha/70 uppercase mb-3">Browse</p>
                            <div className="flex flex-col gap-1.5 mb-7">
                                {TABS.map((t) => {
                                    const Icon = t.icon;
                                    const active = mode !== 'results' && activeTab === t.key;
                                    return (
                                        <button
                                            key={t.key}
                                            type="button"
                                            onClick={() => { haptics.tick(); clearResults(); setActiveTab(t.key); closeMenu(); }}
                                            aria-current={active ? 'page' : undefined}
                                            className={`w-full flex items-center gap-3 rounded-2xl px-3.5 py-3 ring-1 select-none active:scale-[0.99] transition-[transform,box-shadow,border-color] duration-150 text-left ${active ? 'bg-cream ring-coral-accent/50 shadow-sm' : 'bg-cream/60 ring-espresso/10'}`}
                                        >
                                            <Icon size={18} strokeWidth={active ? 2.4 : 2} className={`shrink-0 ${active ? 'text-coral-accent' : 'text-mocha'}`} />
                                            <span className="flex-1 font-serif text-[15px] text-espresso">{t.label}</span>
                                            {active && <Check size={16} className="text-coral-accent shrink-0" />}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* More — Appearance, Accent, and Reading display now
                                live on the Settings page (this drawer stays a thin
                                navigation hub). */}
                            <p className="text-[10px] font-semibold tracking-[0.22em] text-mocha/70 uppercase mt-7 mb-2">More</p>
                            <div className="flex flex-col">
                                {([
                                    { icon: BarChart3, label: 'Reading Stats', open: () => setStatsOpen(true) },
                                    { icon: Settings, label: 'Settings', open: () => setSettingsOpen(true) },
                                    { icon: Info, label: 'About', open: () => setAboutOpen(true) },
                                ] as const).map(({ icon: Icon, label, open }) => (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => { haptics.tick(); closeMenu(); open(); }}
                                        className="flex items-center gap-3 rounded-2xl px-3.5 py-3 select-none active:scale-[0.99] active:bg-cream/60 transition-[transform,background-color] duration-150 text-left"
                                    >
                                        <Icon size={18} className="text-mocha shrink-0" />
                                        <span className="flex-1 font-serif text-[15px] text-espresso">{label}</span>
                                        <ChevronRight size={18} className="text-espresso/25 shrink-0" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Reading Stats inner page ──────────────────────────────────
                 A full-screen layer wearing the shared inner-page header, opened
                 from the menu's "More" group and backed out of. Figures are the
                 derived `stat*` values above. ─────────────────────────────── */}
            {statsOpen && (
                <div
                    className="fixed inset-0 z-[60] bg-warm-beige overflow-y-auto overscroll-contain animate-fade-in"
                    role="dialog"
                    aria-label="Reading Stats"
                    aria-modal="true"
                    style={{ backgroundImage: 'radial-gradient(120% 80% at 50% -10%, rgba(212,154,63,0.10), transparent 55%)' }}
                >
                    <InnerPageHeader
                        title="Reading Stats"
                        eyebrow="Your reading life"
                        backLabel="Back to home"
                        onBack={() => { haptics.tick(); setStatsOpen(false); }}
                    />
                    <main
                        className="max-w-md mx-auto px-5 pt-5"
                        style={{ paddingBottom: 'max(3rem, env(safe-area-inset-bottom))' }}
                    >
                        {!hasAnyStats ? (
                            <EmptyTab
                                icon={BarChart3}
                                title="No reading yet"
                                body="Open a book and start reading. Your time, words, and pace will gather here."
                                footnote={null}
                            />
                        ) : (
                            <>
                                {/* Hero: total time in the reading room */}
                                <section className="relative rounded-2xl bg-espresso text-cream px-5 py-6 overflow-hidden">
                                    <BarChart3 size={96} className="absolute -right-4 -bottom-5 text-cream/[0.06]" />
                                    <p className="text-[10px] font-semibold tracking-[0.22em] text-mustard/80 uppercase">&middot; Time in the reading room &middot;</p>
                                    <p className="font-serif text-[44px] font-semibold leading-none mt-3 tabular-nums">{fmtDuration(statMinutes)}</p>
                                    <p className="font-serif italic text-[14px] text-cream/80 mt-2">
                                        {avgWpm ? `at about ${avgWpm.toLocaleString()} words a minute` : 'so far'}
                                    </p>
                                </section>

                                {/* Headline figures */}
                                <section className="grid grid-cols-2 gap-3 mt-4">
                                    {[
                                        { n: stats.wordsRead.toLocaleString(), l: 'Words read' },
                                        { n: statPages.toLocaleString(), l: 'Pages' },
                                        { n: avgWpm ? avgWpm.toLocaleString() : '—', l: 'Avg WPM' },
                                        { n: finishedCount.toLocaleString(), l: finishedCount === 1 ? 'Book finished' : 'Books finished' },
                                    ].map((c) => (
                                        <div key={c.l} className="rounded-2xl bg-cream/70 ring-1 ring-espresso/10 px-4 py-4 text-center">
                                            <p className="font-serif text-[30px] font-semibold text-espresso leading-none tabular-nums">{c.n}</p>
                                            <p className="text-[10px] font-semibold tracking-[0.14em] text-mocha uppercase mt-2">{c.l}</p>
                                        </div>
                                    ))}
                                </section>

                                {/* Benchmark: your pace head-to-head with an average reader */}
                                {avgWpm && (
                                    <section className="mt-3 rounded-2xl bg-cream/70 ring-1 ring-espresso/10 px-5 py-5">
                                        <p className="text-[10px] font-semibold tracking-[0.18em] text-mocha/80 uppercase">&middot; Against the average reader &middot;</p>
                                        <div className="mt-4 flex flex-col gap-3">
                                            {[
                                                { label: 'You', wpm: avgWpm, w: youBarW, accent: true },
                                                { label: 'Average reader', wpm: BASELINE_WPM, w: avgBarW, accent: false },
                                            ].map((b) => (
                                                <div key={b.label}>
                                                    <div className="flex items-baseline justify-between mb-1">
                                                        <span className="text-[12px] font-semibold text-espresso">{b.label}</span>
                                                        <span className="text-[12px] text-mocha tabular-nums">{b.wpm.toLocaleString()} wpm</span>
                                                    </div>
                                                    <div className="h-2.5 rounded-full bg-espresso/10 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${b.accent ? 'bg-coral-accent' : 'bg-mocha/40'}`}
                                                            style={{ width: `${b.w}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-[13px] text-espresso leading-snug mt-4">
                                            {paceFaster ? (
                                                <><span className="font-semibold">About {pacePct}% faster</span> than a typical reader{minutesSaved > 0 ? `, saving roughly ${fmtDuration(minutesSaved)} so far.` : '.'}</>
                                            ) : paceSlower ? (
                                                <>About <span className="font-semibold">{pacePct}% slower</span> than a typical reader, which is a perfectly good pace.</>
                                            ) : (
                                                <>Right around <span className="font-semibold">the average reader's pace</span>.</>
                                            )}
                                        </p>
                                        <p className="text-[11px] text-mocha/80 italic mt-2">
                                            The same {statPages.toLocaleString()} pages would take an average reader about {fmtDuration(avgReaderMinutes)}.
                                        </p>
                                        <p className="text-[10px] text-mocha/60 mt-3">Average adult silent reading is about {BASELINE_WPM} words a minute.</p>
                                    </section>
                                )}

                                {/* Reading now — tap to pick a book back up */}
                                {readingNow.length > 0 && (
                                    <section className="mt-9">
                                        <h3 className="font-serif text-[18px] font-semibold text-espresso tracking-tight leading-none mb-3">Reading now</h3>
                                        <div className="flex flex-col gap-2.5">
                                            {readingNow.slice(0, 6).map((r) => (
                                                <RecentRow
                                                    key={r.bookId}
                                                    r={r}
                                                    onOpen={(book, rect, idx) => { setStatsOpen(false); onOpenBookInstant(book, rect, idx); }}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Saved-for-later context */}
                                {saved.length > 0 && (
                                    <p className="text-center text-[12px] text-mocha italic mt-9">
                                        {saved.length} {saved.length === 1 ? 'book' : 'books'} saved for later in your Library.
                                    </p>
                                )}
                            </>
                        )}
                    </main>
                </div>
            )}

            {/* ── Settings inner page ───────────────────────────────────────
                 The app's preferences, consolidated here (they used to sit in the
                 menu drawer): appearance, accent, reading speed, reading display. */}
            {settingsOpen && (
                <OverlayPage title="Settings" eyebrow="Make it yours" onBack={() => { haptics.tick(); setSettingsOpen(false); }}>
                    <div className="flex flex-col gap-8">
                        {/* Appearance: light / dark */}
                        <div>
                            <p className="text-[10px] font-semibold tracking-[0.22em] text-mocha/70 uppercase mb-3">Appearance</p>
                            <div className="flex gap-1.5 bg-espresso/[0.06] ring-1 ring-espresso/10 rounded-full p-1">
                                {([
                                    { key: 'light', icon: Sun, label: 'Light' },
                                    { key: 'dark', icon: Moon, label: 'Dark' },
                                ] as const).map(({ key, icon: Icon, label }) => {
                                    const active = themeMode === key;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => { if (themeMode !== key) { toggleMode(); haptics.tick(); } }}
                                            aria-pressed={active}
                                            className={`flex-1 flex items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-semibold select-none active:scale-[0.98] transition-all duration-150 ${active ? 'bg-cream text-espresso shadow-sm ring-1 ring-espresso/10' : 'text-mocha'}`}
                                        >
                                            <Icon size={15} /> {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Accent theme */}
                        <div>
                            <p className="text-[10px] font-semibold tracking-[0.22em] text-mocha/70 uppercase mb-3">Accent</p>
                            <div className="flex flex-col gap-2">
                                {THEMES.map((t, i) => {
                                    const selected = i === themeIndex;
                                    return (
                                        <button
                                            key={t.label}
                                            type="button"
                                            onClick={() => { if (i !== themeIndex) { setThemeIndex(i); haptics.tick(); } }}
                                            aria-label={`Theme: ${t.label}`}
                                            aria-pressed={selected}
                                            className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 ring-1 select-none active:scale-[0.99] transition-[transform,box-shadow,border-color] duration-150 ${selected ? 'bg-cream ring-coral-accent/50 shadow-sm' : 'bg-cream/60 ring-espresso/10'}`}
                                        >
                                            <span className="flex items-center gap-1 shrink-0">
                                                {t.pills.map((color, j) => (
                                                    <span key={j} className="w-1.5 h-5 rounded-[2px] ring-1 ring-espresso/5" style={{ backgroundColor: color }} />
                                                ))}
                                            </span>
                                            <span className="flex-1 text-left font-serif text-[15px] text-espresso">{t.label}</span>
                                            {selected && <Check size={16} className="text-coral-accent shrink-0" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Reading speed (the default words-per-minute) */}
                        <div>
                            <p className="text-[10px] font-semibold tracking-[0.22em] text-mocha/70 uppercase mb-1">Reading speed</p>
                            <p className="text-[12px] text-mocha/80 italic mb-3">Used when you open a book. You can still change it while reading.</p>
                            <div className="flex flex-wrap gap-2">
                                {[200, 250, 300, 400, 500, 600].map((v) => (
                                    <FilterChip key={v} active={wpm === v} onClick={() => { if (wpm !== v) { setWpm(v); haptics.tick(); } }}>{v} wpm</FilterChip>
                                ))}
                            </div>
                            <p className="text-[12px] text-mocha mt-3">Currently <span className="font-semibold text-espresso tabular-nums">{wpm.toLocaleString()}</span> words a minute.</p>
                        </div>

                        {/* Reading display: focal-letter placement / long-word handling */}
                        <div>
                            <p className="text-[10px] font-semibold tracking-[0.22em] text-mocha/70 uppercase mb-3">Reading display</p>
                            <div className="flex flex-col gap-1.5">
                                {([
                                    { key: 'centerAll', label: 'Classic', desc: 'Every word colours a middle letter so it fits.' },
                                    { key: 'centerBig', label: 'Center long words', desc: 'Long words colour a middle letter so they fit.' },
                                    { key: 'shrink', label: 'Shrink long words', desc: 'Long words shrink a little so they fit.' },
                                    { key: 'compact', label: 'Compact', desc: 'Everything a touch smaller, so nothing clips.' },
                                ] as const).map(({ key, label, desc }) => {
                                    const selected = fitMode === key;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => { if (fitMode !== key) { setFitMode(key); haptics.tick(); } }}
                                            aria-pressed={selected}
                                            className={`flex items-start gap-3 rounded-2xl px-3.5 py-3 ring-1 select-none active:scale-[0.99] transition-[transform,box-shadow,border-color] duration-150 text-left ${selected ? 'bg-cream ring-coral-accent/50 shadow-sm' : 'bg-cream/60 ring-espresso/10'}`}
                                        >
                                            <span className="flex-1">
                                                <span className="block font-serif text-[15px] text-espresso">{label}</span>
                                                <span className="block text-[12px] text-mocha/80 leading-snug mt-0.5">{desc}</span>
                                            </span>
                                            {selected && <Check size={16} className="text-coral-accent shrink-0 mt-1" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </OverlayPage>
            )}

            {/* ── About inner page ──────────────────────────────────────────── */}
            {aboutOpen && (
                <OverlayPage title="About" eyebrow="Focus Reader" onBack={() => { haptics.tick(); setAboutOpen(false); }}>
                    {/* Hero */}
                    <section className="relative rounded-2xl bg-espresso text-cream px-5 py-7 overflow-hidden text-center">
                        <Coffee size={96} className="absolute -right-5 -bottom-6 text-cream/[0.06]" />
                        <span className="inline-flex w-12 h-12 rounded-2xl bg-cream/10 ring-1 ring-cream/15 items-center justify-center text-mustard">
                            <Coffee size={22} />
                        </span>
                        <h2 className="font-serif text-[26px] font-semibold mt-3">Focus Reader</h2>
                        <p className="font-serif italic text-[14px] text-cream/80 mt-1">A calm place to read the classics.</p>
                    </section>

                    {/* What it is */}
                    <section className="mt-5 rounded-2xl bg-cream/70 ring-1 ring-espresso/10 px-5 py-5">
                        <p className="text-[14px] text-espresso leading-relaxed">Focus Reader shows a book one word at a time, gently paced, so you can give it your full attention. No feed and no clutter. Just the words and you.</p>
                        <p className="text-[14px] text-espresso leading-relaxed mt-3">Every book here belongs to everyone. These are works in the public domain, the timeless ones, free to read.</p>
                    </section>

                    {/* Getting around */}
                    <section className="mt-5">
                        <p className="text-[10px] font-semibold tracking-[0.22em] text-mocha/70 uppercase mb-3">Getting around</p>
                        <div className="rounded-2xl bg-cream/70 ring-1 ring-espresso/10 divide-y divide-espresso/[0.07]">
                            {[
                                'Tap the page to play or pause.',
                                'Swipe left or right to step a sentence.',
                                'Swipe down to leave a book.',
                                'Set your pace and look in Settings.',
                            ].map((t) => (
                                <p key={t} className="px-5 py-3 text-[13px] text-espresso">{t}</p>
                            ))}
                        </div>
                    </section>

                    <p className="text-center font-serif italic text-[13px] text-mocha mt-7">Made with care, over many cups of coffee.</p>
                </OverlayPage>
            )}
        </div>
    );
}
