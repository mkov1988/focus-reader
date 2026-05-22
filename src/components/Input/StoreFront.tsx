import { useCallback, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BookCard } from './BookCard';
import { BookCover, type CoverVariant } from './BookCover';
import { usePress } from '../../hooks/usePress';
import { webLibraryService as library } from '../../services/library';
import type { BookMetadata } from '../../services/types';
import {
    Coffee, Search, BookOpen, Library, Bookmark, Notebook,
    ChevronRight, ArrowRight, ArrowLeft, Moon, Clock, Leaf, Feather, Loader2, X,
} from 'lucide-react';

// Featured hero book (Project Gutenberg id) — Walden, to match the quote.
const HERO_ID = '205';
const HERO_TITLE = 'Walden; or, Life in the Woods';

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
    { icon: Moon, title: 'Bedtime Read', sub: 'soft endings, no cliffhangers', tint: '#ECE9DE', topic: 'fairy tales' },
    { icon: Coffee, title: 'Sunday Morning', sub: 'savor with a second cup', tint: '#F1E8D6', topic: 'poetry' },
    { icon: Clock, title: 'Under 30 Minutes', sub: 'a story between trains', tint: '#EFE9DB', topic: 'short stories' },
    { icon: Leaf, title: 'Garden & Hearth', sub: 'pastorals & quiet rooms', tint: '#EAF0E2', topic: 'nature' },
    { icon: Feather, title: 'Essays by Lamplight', sub: 'slow thinking, slow weather', tint: '#F0EAD9', topic: 'essays' },
];

const TABS = [
    { icon: BookOpen, label: 'Today' },
    { icon: Library, label: 'Library' },
    { icon: Bookmark, label: 'Shelves' },
    { icon: Notebook, label: 'Notebook' },
];

const THEMES = [
    ['bg-cream', 'bg-coral-accent', 'bg-espresso', 'bg-warm-oat'],
    ['bg-cream', 'bg-sage', 'bg-espresso', 'bg-mocha'],
    ['bg-warm-oat', 'bg-mocha', 'bg-coral-accent', 'bg-cream'],
    ['bg-cream', 'bg-mustard', 'bg-espresso', 'bg-sage'],
];

function greeting() {
    const h = new Date().getHours();
    if (h < 12) return { hi: 'Good morning', line: "the coffee's on." };
    if (h < 17) return { hi: 'Good afternoon', line: "a fresh pot's brewing." };
    return { hi: 'Good evening', line: 'the kettle is on.' };
}

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
    <p className="text-center text-[10px] font-semibold tracking-[0.22em] text-mocha/80 uppercase">{children}</p>
);

const Squiggle = () => (
    <div className="flex justify-center my-7" aria-hidden>
        <svg width="64" height="10" viewBox="0 0 64 10" fill="none">
            <path d="M1 5 Q 9 0 17 5 T 33 5 T 49 5 T 63 5" stroke="#6B5544" strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    </div>
);

const CoverSkeleton = () => (
    <div className="w-36 shrink-0">
        <div className="w-full aspect-[2/3] rounded-l-[3px] rounded-r-xl bg-espresso/[0.07] animate-pulse" />
        <div className="h-3 bg-espresso/[0.07] rounded mt-2.5 w-3/4 animate-pulse" />
        <div className="h-2.5 bg-espresso/[0.05] rounded mt-1.5 w-1/2 animate-pulse" />
    </div>
);

// A "small door" row. Press-down nudges the icon + chevron; release runs onClick.
function Door({ icon: Icon, title, sub, tint, onClick }: { icon: LucideIcon; title: string; sub: string; tint: string; onClick: () => void }) {
    const { pressed, pressProps } = usePress();
    return (
        <button
            onClick={onClick}
            {...pressProps}
            className={`w-full flex items-center gap-3.5 rounded-2xl px-4 py-3.5 ring-1 text-left select-none transition-[transform,box-shadow,border-color] duration-150 ${pressed ? 'ring-coral-accent/40 scale-[0.99] shadow-[inset_0_1px_4px_rgba(58,42,30,0.08)]' : 'ring-espresso/8'}`}
            style={{ backgroundColor: tint }}
        >
            <span className={`w-10 h-10 rounded-xl bg-cream/80 ring-1 ring-espresso/8 flex items-center justify-center text-coral-accent shrink-0 transition-transform duration-150 ${pressed ? 'scale-110 -rotate-6' : ''}`}>
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

interface StoreFrontProps {
    onOpenText: (text: string, title: string) => void;
    onManualInput?: () => void;
}

export function StoreFront({ onOpenText, onManualInput }: StoreFrontProps) {
    const { hi, line } = greeting();
    const heroPress = usePress();

    const [curated, setCurated] = useState<BookMetadata[] | null>(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');

    const [mode, setMode] = useState<'home' | 'results'>('home');
    const [results, setResults] = useState<BookMetadata[]>([]);
    const [resultsLabel, setResultsLabel] = useState('');
    const [searching, setSearching] = useState(false);

    const [openingTitle, setOpeningTitle] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Load the curated shelf once on mount.
    useEffect(() => {
        let alive = true;
        library.getCurated()
            .then((books) => { if (alive) setCurated(books.slice(0, 8)); })
            .catch(() => { if (alive) setCurated(FALLBACK_BOOKS); });
        return () => { alive = false; };
    }, []);

    const openBook = useCallback(async (book: BookMetadata) => {
        setError(null);
        setOpeningTitle(book.title);
        try {
            const text = await library.fetchContent(book);
            onOpenText(text, book.title);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not open that book.');
        } finally {
            setOpeningTitle(null);
        }
    }, [onOpenText]);

    const openHero = useCallback(async () => {
        setError(null);
        setOpeningTitle('Walden');
        try {
            const book = await library.getById(HERO_ID);
            if (!book) throw new Error('Featured book is unavailable right now.');
            const text = await library.fetchContent(book);
            onOpenText(text, HERO_TITLE);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not open Walden.');
        } finally {
            setOpeningTitle(null);
        }
    }, [onOpenText]);

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
        setSearchOpen(false);
        setResults([]);
    };

    const shelf = curated ?? [];

    return (
        <div
            className="min-h-screen bg-warm-beige pb-14 font-sans text-espresso selection:bg-coral-accent/20 overflow-x-hidden"
            style={{
                backgroundImage:
                    'radial-gradient(120% 80% at 50% -10%, rgba(212,154,63,0.10), transparent 55%), radial-gradient(90% 60% at 100% 0%, rgba(194,103,75,0.07), transparent 50%)',
            }}
        >
            <main className="max-w-md mx-auto px-5 pt-6">
                {/* Brand + search */}
                <header className="mb-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <span className="w-9 h-9 rounded-xl bg-cream ring-1 ring-espresso/10 flex items-center justify-center text-coral-accent shadow-sm">
                                <Coffee size={18} />
                            </span>
                            <div className="leading-tight">
                                <h1 className="font-serif text-[18px] font-semibold text-espresso">Focus Reader</h1>
                                <p className="text-[9px] font-semibold tracking-[0.22em] text-mocha/70 uppercase">A Quiet Library</p>
                            </div>
                        </div>
                        <button
                            aria-label="Search"
                            onClick={() => setSearchOpen((v) => !v)}
                            className={`w-10 h-10 rounded-full ring-1 flex items-center justify-center select-none active:scale-90 transition-[transform,color,background-color] duration-150 shadow-sm ${searchOpen ? 'bg-espresso text-cream ring-espresso' : 'bg-cream text-mocha ring-espresso/10 hover:text-coral-accent'}`}
                        >
                            {searchOpen ? <X size={18} /> : <Search size={18} />}
                        </button>
                    </div>

                    {searchOpen ? (
                        <form onSubmit={submitSearch} className="mt-4 flex gap-2.5">
                            <div className="flex-1 bg-cream rounded-full px-5 py-3 flex items-center gap-3 ring-1 ring-espresso/10 shadow-[inset_0_1px_3px_rgba(58,42,30,0.08)] focus-within:ring-coral-accent/40 transition-shadow">
                                <Search size={18} className="text-mocha/70 shrink-0" />
                                <input
                                    autoFocus
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search by title or author…"
                                    className="bg-transparent border-none outline-none w-full text-espresso placeholder-mocha/60 font-medium"
                                />
                            </div>
                            <button type="submit" className="bg-coral-accent text-cream w-12 h-12 rounded-full flex items-center justify-center shadow-[0_3px_8px_rgba(194,103,75,0.35)] hover:scale-95 active:scale-90 transition-transform shrink-0">
                                <Search size={20} />
                            </button>
                        </form>
                    ) : (
                        <div className="mt-5">
                            <p className="font-serif italic text-[15px] text-mocha">{hi}, friend &mdash;</p>
                            <h2 className="font-serif text-[30px] font-semibold text-espresso leading-tight tracking-tight">{line}</h2>
                        </div>
                    )}
                </header>

                {error && (
                    <div className="mb-5 flex items-start gap-2 rounded-2xl bg-coral-accent/10 ring-1 ring-coral-accent/30 px-4 py-3 text-[13px] text-espresso">
                        <span className="flex-1">{error}</span>
                        <button onClick={() => setError(null)} aria-label="Dismiss" className="text-mocha hover:text-espresso shrink-0"><X size={16} /></button>
                    </div>
                )}

                {mode === 'results' ? (
                    /* ── Search / topic results ── */
                    <section className="mb-7">
                        <div className="flex items-center gap-3 mb-4">
                            <button onClick={clearResults} className="w-9 h-9 rounded-full bg-cream ring-1 ring-espresso/10 flex items-center justify-center text-mocha hover:text-coral-accent select-none active:scale-90 transition-[transform,color] duration-150 shrink-0">
                                <ArrowLeft size={18} />
                            </button>
                            <div className="min-w-0">
                                <p className="text-[11px] font-semibold tracking-[0.16em] text-mocha/70 uppercase">Reading room results</p>
                                <h2 className="font-serif text-[20px] font-semibold text-espresso leading-tight truncate">{resultsLabel}</h2>
                            </div>
                        </div>

                        {searching ? (
                            <div className="grid grid-cols-2 gap-y-6 justify-items-center">
                                {Array.from({ length: 6 }).map((_, i) => <CoverSkeleton key={i} />)}
                            </div>
                        ) : results.length === 0 ? (
                            <p className="text-center text-[14px] text-mocha italic py-10">Nothing on the shelf for that. Try another title or author.</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-y-6 justify-items-center">
                                {results.map((book) => (
                                    <BookCard key={book.id} title={book.title} author={book.author} coverUrl={book.coverUrl} onClick={() => openBook(book)} />
                                ))}
                            </div>
                        )}
                    </section>
                ) : (
                    /* ── Home ── */
                    <>
                        {/* Theme swatches */}
                        <section className="mb-6 -mx-5 px-5 overflow-hidden">
                            <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                {THEMES.map((bars, i) => (
                                    <button key={i} className={`shrink-0 flex items-center gap-1 rounded-full px-2.5 py-2 select-none active:scale-95 active:gap-[5px] transition-[transform,gap,box-shadow] duration-150 ${i === 0 ? 'bg-cream ring-2 ring-coral-accent/50 shadow-sm' : 'bg-cream/70 ring-1 ring-espresso/10'}`} aria-label={`Theme ${i + 1}`}>
                                        {bars.map((b, j) => (<span key={j} className={`w-1.5 h-5 rounded-[2px] ${b} ring-1 ring-espresso/5`} />))}
                                    </button>
                                ))}
                                <div className="w-2 shrink-0" />
                            </div>
                        </section>

                        {/* Continue reading hero */}
                        <section className="mb-2">
                            <div className="rounded-3xl bg-cream ring-1 ring-espresso/10 shadow-[0_4px_18px_rgba(58,42,30,0.07)] p-5">
                                <Eyebrow>&middot; Pick up where you left off &middot;</Eyebrow>
                                <div className="flex gap-4 mt-4">
                                    <div
                                        onClick={openHero}
                                        {...heroPress.pressProps}
                                        className="relative shrink-0 w-[88px] rotate-[-4deg] mt-1 cursor-pointer select-none"
                                    >
                                        <span className="absolute -top-1.5 right-3 z-10 w-3 h-6 bg-coral-accent rounded-b-sm shadow-sm before:content-[''] before:absolute before:bottom-0 before:left-0 before:border-x-[6px] before:border-x-transparent before:border-b-[5px] before:border-b-warm-beige" />
                                        <BookCover title="Walden" author="H. D. Thoreau" variant="framed" size="sm" pressed={heroPress.pressed} />
                                    </div>
                                    <div className="flex-1 min-w-0 pt-1">
                                        <h3 className="font-serif text-[20px] font-semibold text-espresso leading-tight">
                                            Walden; <span className="italic text-coral-accent">or, Life in the Woods</span>
                                        </h3>
                                        <p className="font-serif italic text-[12px] text-mocha mt-1">Henry David Thoreau &middot; Ch. II</p>
                                    </div>
                                </div>
                                <p className="font-serif italic text-[13px] text-mocha leading-relaxed mt-4">
                                    &ldquo;I went to the woods because I wished to live deliberately&hellip;&rdquo; &mdash; three pages remain in this sitting. Settle in.
                                </p>
                                <div className="mt-4">
                                    <div className="flex justify-between text-[10px] font-semibold tracking-[0.12em] text-mocha uppercase mb-1.5">
                                        <span>Page 142 / 312</span>
                                        <span>2h 18m &middot; 280 wpm</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-espresso/10 overflow-hidden">
                                        <div className="h-full rounded-full bg-coral-accent" style={{ width: '46%' }} />
                                    </div>
                                </div>
                                <div className="flex gap-3 mt-5">
                                    <button onClick={openHero} className="flex-1 flex items-center justify-center gap-2 bg-espresso text-cream rounded-full py-3.5 font-semibold text-[15px] shadow-[0_4px_12px_rgba(58,42,30,0.25)] hover:bg-espresso/90 active:scale-[0.98] transition-all">
                                        <BookOpen size={18} /> Resume
                                    </button>
                                    <button onClick={openHero} className="px-6 rounded-full bg-cream ring-1 ring-espresso/15 text-espresso font-semibold text-[15px] hover:ring-coral-accent/40 active:scale-[0.98] transition-all">
                                        RSVP
                                    </button>
                                </div>
                            </div>
                        </section>

                        <Squiggle />

                        {/* Front table shelf */}
                        <section className="mb-7">
                            <Eyebrow>Staff Picks &middot; This Week</Eyebrow>
                            <div className="flex justify-between items-end mt-3 mb-3">
                                <div>
                                    <h2 className="font-serif text-[22px] font-semibold text-espresso tracking-tight leading-none">On the front table</h2>
                                    <p className="text-[12px] text-mocha italic mt-1">Hand-picked from the public domain.</p>
                                </div>
                                <button onClick={() => runQuery('Most loved', () => library.getCurated())} className="group flex items-center text-[13px] font-semibold text-coral-accent hover:text-coral-accent/80 active:text-coral-accent/70 transition-colors shrink-0 pb-0.5 select-none">
                                    see all <ArrowRight size={14} className="ml-1 transition-transform duration-150 group-active:translate-x-1" />
                                </button>
                            </div>
                            <div className="flex gap-4 overflow-x-auto pb-6 snap-x scroll-pl-5 -mx-5 px-5" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                {curated === null
                                    ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="snap-start flex-shrink-0"><CoverSkeleton /></div>)
                                    : shelf.map((book) => {
                                        const fb = book as BookMetadata & { variant?: CoverVariant; tint?: string };
                                        return (
                                            <div key={book.id} className="snap-start flex-shrink-0">
                                                <BookCard title={book.title} author={book.author} coverUrl={book.coverUrl} variant={fb.variant} tint={fb.tint} onClick={() => openBook(book)} />
                                            </div>
                                        );
                                    })}
                                <div className="w-1 shrink-0" />
                            </div>
                        </section>

                        {/* Segmented sections */}
                        <section className="mb-6 -mx-5 px-5 overflow-hidden">
                            <div className="flex gap-1.5 overflow-x-auto bg-espresso/5 ring-1 ring-espresso/8 rounded-full p-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                {TABS.map((t, i) => {
                                    const Icon = t.icon;
                                    return (
                                        <button key={t.label} className={`shrink-0 flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold select-none active:scale-95 transition-all duration-150 ${i === 0 ? 'bg-espresso text-cream shadow-sm' : 'text-mocha hover:text-espresso'}`}>
                                            <Icon size={15} /> {t.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>

                        {/* Mood doors */}
                        <section className="mb-7">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="font-serif text-[22px] font-semibold text-espresso tracking-tight">A few small doors</h2>
                                <Coffee size={18} className="text-mocha/50" />
                            </div>
                            <div className="flex flex-col gap-2.5">
                                {DOORS.map((d) => (
                                    <Door key={d.title} icon={d.icon} title={d.title} sub={d.sub} tint={d.tint} onClick={() => runQuery(d.title, () => library.getByTopic(d.topic))} />
                                ))}
                            </div>
                        </section>

                        {/* Weekly stats */}
                        <section className="mb-5">
                            <div className="rounded-2xl bg-cream/70 ring-1 ring-espresso/8 px-5 py-5">
                                <Eyebrow>&middot; This Quiet Week &middot;</Eyebrow>
                                <div className="grid grid-cols-3 mt-4">
                                    {[{ n: '184', l: 'Minutes' }, { n: '92', l: 'Pages' }, { n: '276', l: 'Avg WPM' }].map((s, i) => (
                                        <div key={s.l} className={`text-center ${i !== 0 ? 'border-l border-espresso/10' : ''}`}>
                                            <p className="font-serif text-[28px] font-semibold text-espresso leading-none">{s.n}</p>
                                            <p className="text-[10px] font-semibold tracking-[0.15em] text-mocha uppercase mt-1.5">{s.l}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        {/* A note from the room */}
                        <section>
                            <div className="relative rounded-2xl bg-espresso text-cream px-5 py-5 overflow-hidden">
                                <Coffee size={86} className="absolute -right-4 -bottom-5 text-cream/5" />
                                <p className="text-[10px] font-semibold tracking-[0.22em] text-mustard/80 uppercase">&middot; A note from the room &middot;</p>
                                <p className="font-serif italic text-[16px] leading-relaxed mt-3 text-cream/95">
                                    &ldquo;Some books are to be tasted, others to be swallowed.&rdquo;
                                </p>
                                <p className="text-[10px] font-semibold tracking-[0.18em] text-mustard/70 uppercase mt-3">&mdash; Francis Bacon</p>
                                {onManualInput && (
                                    <button onClick={onManualInput} className="group mt-4 text-[12px] font-semibold text-mustard hover:text-mustard/80 transition-colors inline-flex items-center gap-1 select-none">
                                        or paste your own text <ArrowRight size={13} className="transition-transform duration-150 group-active:translate-x-1" />
                                    </button>
                                )}
                            </div>
                        </section>
                    </>
                )}
            </main>

            {/* Opening overlay */}
            {openingTitle && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-espresso/30 backdrop-blur-sm px-8">
                    <div className="bg-cream rounded-3xl ring-1 ring-espresso/10 shadow-xl px-7 py-6 flex flex-col items-center text-center max-w-xs">
                        <Loader2 size={28} className="text-coral-accent animate-spin" />
                        <p className="font-serif text-[16px] text-espresso mt-3">Brewing your book&hellip;</p>
                        <p className="text-[12px] italic text-mocha mt-1 line-clamp-2">{openingTitle}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
