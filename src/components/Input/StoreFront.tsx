import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BookCard } from './BookCard';
import { BookCover, type CoverVariant } from './BookCover';
import { InnerPageHeader } from '../InnerPageHeader';
import { usePress } from '../../hooks/usePress';
import { useStore, type TabKey, type ReadingProgress } from '../../store/useStore';
import { webLibraryService as library } from '../../services/library';
import type { BookMetadata } from '../../services/types';
import { THEMES } from '../../theme';
import { startPressGesture } from '../../utils/pressGesture';
import { haptics } from '../../utils/haptics';
import {
    Coffee, Search, BookOpen, Library, Bookmark, Notebook,
    ChevronRight, ArrowRight, Moon, Clock, Leaf, Feather, Loader2, X,
    Menu, Settings, Info, BarChart3, Check, Sun,
} from 'lucide-react';

// Shown only if Gutendex can't be reached, so the shelf is never empty.
const FALLBACK_BOOKS: (BookMetadata & { variant?: CoverVariant; tint?: string })[] = [
    { id: 'f-walden', title: 'Walden', author: 'Henry David Thoreau', variant: 'framed' },
    { id: 'f-middlemarch', title: 'Middlemarch', author: 'George Eliot', variant: 'label' },
    { id: 'f-willows', title: 'Wind in the Willows', author: 'Kenneth Grahame', variant: 'solid', tint: 'bg-mustard' },
    { id: 'f-pride', title: 'Pride and Prejudice', author: 'Jane Austen', variant: 'solid', tint: 'bg-coral-accent' },
    { id: 'f-room', title: 'A Room with a View', author: 'E. M. Forster', variant: 'framed' },
    { id: 'f-alice', title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', variant: 'solid', tint: 'bg-sage' },
];

const DOORS = [
    { icon: Moon, title: 'Bedtime Read', sub: 'soft endings, no cliffhangers', topic: 'fairy tales' },
    { icon: Coffee, title: 'Sunday Morning', sub: 'savor with a second cup', topic: 'poetry' },
    { icon: Clock, title: 'Under 30 Minutes', sub: 'a story between trains', topic: 'short stories' },
    { icon: Leaf, title: 'Garden & Hearth', sub: 'pastorals & quiet rooms', topic: 'nature' },
    { icon: Feather, title: 'Essays by Lamplight', sub: 'slow thinking, slow weather', topic: 'essays' },
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
    { key: 'shelves', icon: Bookmark, label: 'Shelves' },
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

// A "small door" row. Press-down nudges the icon + chevron; release runs onClick.
function Door({ icon: Icon, title, sub, onClick }: { icon: LucideIcon; title: string; sub: string; onClick: () => void }) {
    const { pressed, pressProps } = usePress();
    return (
        <button
            type="button"
            onClick={onClick}
            {...pressProps}
            className={`w-full min-h-[64px] flex items-center gap-3.5 rounded-2xl px-4 py-3 ring-1 text-left select-none bg-cream/70 transition-[transform,box-shadow,border-color] duration-150 ${pressed ? 'ring-coral-accent/40 scale-[0.99] shadow-[inset_0_1px_4px_rgba(58,42,30,0.08)]' : 'ring-espresso/10'}`}
        >
            <span className={`w-10 h-10 rounded-xl bg-cream/80 ring-1 ring-espresso/10 flex items-center justify-center text-coral-accent shrink-0 transition-transform duration-150 ${pressed ? 'scale-110 -rotate-6' : ''}`}>
                <Icon size={18} />
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
    const stats = useStore((s) => s.stats);
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

    const [curated, setCurated] = useState<BookMetadata[] | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
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

    const [mode, setMode] = useState<'home' | 'results'>('home');
    const [results, setResults] = useState<BookMetadata[]>([]);
    const [resultsLabel, setResultsLabel] = useState('');
    const [searching, setSearching] = useState(false);

    const [error, setError] = useState<string | null>(null);

    // Load the curated shelf once on mount.
    useEffect(() => {
        let alive = true;
        library.getCurated()
            .then((books) => { if (alive) setCurated(books.slice(0, 12)); })
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
    const shelfCleanup = useRef<(() => void) | null>(null);
    const shelfRef = useCallback((node: HTMLDivElement | null) => {
        shelfCleanup.current?.();
        shelfCleanup.current = null;
        if (!node) return;

        const onWheel = (e: WheelEvent) => {
            // Let native horizontal wheel / trackpad gestures pass through.
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            const atStart = node.scrollLeft <= 0;
            const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 1;
            if ((e.deltaY > 0 && atEnd) || (e.deltaY < 0 && atStart)) return;
            node.scrollLeft += e.deltaY;
            e.preventDefault();
        };

        const PAN_SLOP = 10; // matches the card's mouse pickup threshold
        let panId: number | null = null;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let panning = false;

        const onPointerDown = (e: PointerEvent) => {
            if (e.pointerType !== 'mouse') return; // touch/pen pan natively
            panId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = node.scrollLeft;
            panning = false;
            try { node.setPointerCapture(panId); } catch { /* not capturable */ }
        };
        const onPointerMove = (e: PointerEvent) => {
            if (panId === null || e.pointerId !== panId) return;
            const dx = e.clientX - startX;
            if (!panning) {
                // Engage only on a clearly horizontal drag past the slop; a
                // vertical-leaning drag is left for the card's lift.
                if (Math.abs(dx) <= PAN_SLOP || Math.abs(dx) <= Math.abs(e.clientY - startY)) return;
                panning = true;
                startX = e.clientX;          // re-anchor so the pan doesn't jump
                startLeft = node.scrollLeft;
                node.style.cursor = 'grabbing';
            }
            node.scrollLeft = startLeft - (e.clientX - startX);
            e.preventDefault();
        };
        const endPan = (e: PointerEvent) => {
            if (panId === null || e.pointerId !== panId) return;
            // Null out before releasing: releasePointerCapture synchronously
            // dispatches lostpointercapture (which re-enters here), and a card
            // stealing capture for a vertical lift lands here too.
            const id = panId;
            panId = null;
            panning = false;
            node.style.cursor = '';
            try { node.releasePointerCapture(id); } catch { /* already released */ }
        };

        node.addEventListener('wheel', onWheel, { passive: false });
        node.addEventListener('pointerdown', onPointerDown);
        node.addEventListener('pointermove', onPointerMove);
        node.addEventListener('pointerup', endPan);
        node.addEventListener('pointercancel', endPan);
        node.addEventListener('lostpointercapture', endPan);
        shelfCleanup.current = () => {
            node.removeEventListener('wheel', onWheel);
            node.removeEventListener('pointerdown', onPointerDown);
            node.removeEventListener('pointermove', onPointerMove);
            node.removeEventListener('pointerup', endPan);
            node.removeEventListener('pointercancel', endPan);
            node.removeEventListener('lostpointercapture', endPan);
        };
    }, []);

    const runQuery = useCallback(async (label: string, fn: () => Promise<BookMetadata[]>) => {
        setMode('results');
        setResultsLabel(label);
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

    const submitSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const q = query.trim();
        if (q) runQuery(`“${q}”`, () => library.search(q));
    };

    const clearResults = () => {
        setMode('home');
        setQuery('');
        setResults([]);
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
        mode === 'results'
            ? { title: resultsLabel, eyebrow: 'Reading room results', backLabel: 'Back', onBack: () => { haptics.tick(); clearResults(); } }
            : activeTab === 'library'
            ? { title: 'Library', backLabel: 'Back to home', onBack: goHome }
            : activeTab === 'shelves'
            ? { title: 'Shelves', backLabel: 'Back to home', onBack: goHome }
            : activeTab === 'notebook'
            ? { title: 'Notebook', backLabel: 'Back to home', onBack: goHome }
            : null;

    const shelf = curated ?? [];

    // ─── Hero card content: real progress vs. today's pick ────────────────
    const hasProgress = progress !== null && progress.totalTokens > 0;
    const progressPct = hasProgress
        ? Math.min(100, Math.round((progress.currentIndex / progress.totalTokens) * 100))
        : 0;

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

                {mode === 'results' ? (
                    /* ── Search / topic results: an inner page. Back returns to
                       wherever the search was launched from (home or Recents). ── */
                    <section className="mb-7">
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
                                                        <BookCover title={progress.title} author={progress.author} coverUrl={progress.coverUrl} variant="framed" size="sm" />
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
                                                        <BookCover title={todaysPick.title} author={todaysPick.author} coverUrl={todaysPick.coverUrl} variant="framed" size="sm" />
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
                                    <h2 className="font-serif text-[22px] font-semibold text-espresso tracking-tight leading-none">Staff picks</h2>
                                    <p className="text-[12px] text-mocha italic mt-1">Hand picked for the front table</p>
                                </div>
                                <button type="button" onClick={() => runQuery('Most loved', () => library.getCurated())} className="group flex items-center text-[13px] font-semibold text-coral-accent hover:text-coral-accent/80 active:text-coral-accent/70 transition-colors shrink-0 pb-0.5 select-none">
                                    see all <ArrowRight size={14} className="ml-1 transition-transform duration-150 group-active:translate-x-1" />
                                </button>
                            </div>
                            <div ref={shelfRef} className="flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-pl-5 -mx-5 px-5" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                {curated === null
                                    ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="snap-start flex-shrink-0 w-44"><CoverSkeleton /></div>)
                                    : shelf.map((book) => {
                                        const fb = book as BookMetadata & { variant?: CoverVariant; tint?: string };
                                        const slotId = `shelf:${book.id}`;
                                        return (
                                            <div key={book.id} className="snap-start flex-shrink-0">
                                                <BookCard
                                                    title={book.title}
                                                    author={book.author}
                                                    coverUrl={book.coverUrl}
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

                        {/* Mood doors — 44px+ touch targets, consistent iconography */}
                        <section className="mt-14">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h2 className="font-serif text-[22px] font-semibold text-espresso tracking-tight leading-none">A few small doors</h2>
                                    <p className="text-[12px] text-mocha italic mt-1">Curated collections for specific moods.</p>
                                </div>
                                <Coffee size={18} className="text-mocha/50 mt-1" />
                            </div>
                            <div className="flex flex-col gap-2.5">
                                {DOORS.map((d) => (
                                    <Door key={d.title} icon={d.icon} title={d.title} sub={d.sub} onClick={() => runQuery(d.title, () => library.getByTopic(d.topic))} />
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
                    <>
                        {recents.length > 0 && (
                            <p className="font-serif italic text-[14px] text-mocha leading-relaxed border-l-2 border-coral-accent/50 pl-3.5 mb-6">
                                Pick up any book exactly where you left it.
                            </p>
                        )}
                        {recents.length === 0 ? (
                            <EmptyTab
                                icon={Clock}
                                title="Nothing read yet"
                                body="Books you open will gather here, each remembering the exact word you stopped on."
                                footnote={null}
                            />
                        ) : (
                            <div className="flex flex-col gap-2.5">
                                {recents.map((r) => (
                                    <RecentRow key={r.bookId} r={r} onOpen={onOpenBookInstant} />
                                ))}
                            </div>
                        )}
                    </>
                ) : activeTab === 'shelves' ? (
                    <EmptyTab
                        icon={Bookmark}
                        title="No shelves yet"
                        body="Save books into shelves like ‘Lazy Sundays’ or ‘Train Rides’ to keep a private collection."
                    />
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

                            {/* Appearance: light / dark */}
                            <p className="text-[10px] font-semibold tracking-[0.22em] text-mocha/70 uppercase mb-3">Appearance</p>
                            <div className="flex gap-1.5 bg-espresso/[0.06] ring-1 ring-espresso/10 rounded-full p-1 mb-6">
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

                            {/* Theme */}
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

                            {/* Placeholders */}
                            <p className="text-[10px] font-semibold tracking-[0.22em] text-mocha/70 uppercase mt-7 mb-2">More</p>
                            <div className="flex flex-col">
                                {[
                                    { icon: BarChart3, label: 'Reading Stats' },
                                    { icon: Settings, label: 'Settings' },
                                    { icon: Info, label: 'About' },
                                ].map(({ icon: Icon, label }) => (
                                    <div key={label} className="flex items-center gap-3 rounded-2xl px-3.5 py-3 opacity-45 select-none cursor-default">
                                        <Icon size={18} className="text-mocha shrink-0" />
                                        <span className="flex-1 font-serif text-[15px] text-espresso">{label}</span>
                                        <span className="text-[9px] font-semibold tracking-[0.16em] text-mocha/70 uppercase">Soon</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
