import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { ReaderView } from './components/Reader/ReaderView';
import { type VisualizationMode } from './components/Reader/VisualizationSelector';
import { StoreFront } from './components/Input/StoreFront';
import { TextInput } from './components/Input/TextInput';
import { BookOpenTransition } from './components/Reader/BookOpenTransition';
import { useStore } from './store/useStore';
import { useRSVP } from './hooks/useRSVP';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { parseText, type ParsedText } from './utils/textProcessing';
import { webLibraryService as library } from './services/library';
import type { BookMetadata } from './services/types';
import { THEMES } from './theme';
import './index.css';

// Configuration Constants
const DEFAULT_WPM = 300;
const DEFAULT_FONT_SIZE = 56;
const SENTENCE_START_MULTIPLIER = 1.8;
const SENTENCE_START_OFFSET = 500;
const LINE_START_MULTIPLIER = 1.5;

// Throttle progress writes to ~once / 2s while reading — at 600 WPM the index
// changes ~10x per second, far more often than we need to persist.
const PROGRESS_SAVE_INTERVAL_MS = 2000;

/** Synthesise a centred rect when a caller couldn't capture one. */
function fallbackRect(): DOMRect {
    const w = 110, h = 165;
    return new DOMRect(window.innerWidth / 2 - w / 2, window.innerHeight / 2 - h / 2, w, h);
}



interface PendingOpen {
    book: BookMetadata;
    originRect: DOMRect;
    /** Gesture-tracking rect (defaults to originRect if not given). */
    targetRect?: DOMRect;
    /** Identifies the *physical instance* being lifted — e.g. "hero" vs
     *  "shelf:84" — so only that copy hides while the same book in another
     *  slot (Today's Pick + On the front table) stays in place. */
    slotId: string;
    startIndex?: number;
}

function App() {
    const viewMode = useStore((s) => s.viewMode);
    const setViewMode = useStore((s) => s.setViewMode);
    const updateProgress = useStore((s) => s.updateProgress);
    const themeIndex = useStore((s) => s.themeIndex);
    const mode = useStore((s) => s.mode);

    // Apply the active theme + light/dark mode to the document root. Doing this
    // at the App shell (always mounted) keeps the storefront AND the reader in
    // sync — switch theme/mode anywhere and every view recolours.
    useEffect(() => {
        const root = document.documentElement;
        const theme = THEMES[themeIndex] ?? THEMES[0];
        const palette = mode === 'dark' ? theme.dark : theme.light;
        
        root.style.setProperty('--bg', palette.bg);
        root.style.setProperty('--surface', palette.surface);
        root.style.setProperty('--surface-sunken', palette.surfaceSunken);
        root.style.setProperty('--text', palette.text);
        root.style.setProperty('--text-muted', palette.textMuted);
        
        root.style.setProperty('--coral-accent-rgb', palette.accentRgb);
        root.style.setProperty('--coral-accent-text', palette.accentText);
        root.style.setProperty('--focal-color', `rgb(${palette.focalRgb})`);
        
        root.dataset.mode = mode;
    }, [themeIndex, mode]);

    const [parsedText, setParsedText] = useState<ParsedText | null>(null);
    const [bookTitle, setBookTitle] = useState<string>('Focus Reader');
    const [activeBook, setActiveBook] = useState<BookMetadata | null>(null);
    const [visMode, setVisMode] = useState<VisualizationMode>('rsvp');
    const [wpm, setWpm] = useState(DEFAULT_WPM);
    const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);

    // ── Book-open transition state ─────────────────────────────────────
    const [pending, setPending] = useState<PendingOpen | null>(null);
    /** Text + parsed tokens for the *pending* book, captured asynchronously. */
    const [pendingParsed, setPendingParsed] = useState<ParsedText | null>(null);
    const [pendingError, setPendingError] = useState<string | null>(null);
    /** Seek target that has to wait for `parsedText` to update before applying. */
    const pendingSeekRef = useRef<number | null>(null);

    const handleComplete = useCallback(() => { }, []);
    const [lineStartIndices, setLineStartIndices] = useState<Set<number>>(new Set());

    const rsvp = useRSVP({
        tokens: parsedText?.tokens || [],
        wpm,
        sentenceStartMultiplier: visMode === 'sentence' ? SENTENCE_START_MULTIPLIER : 1,
        sentenceStartOffset: visMode === 'sentence' ? SENTENCE_START_OFFSET : 0,
        lineStartMultiplier: visMode === 'sentence' ? LINE_START_MULTIPLIER : 1,
        lineStartIndices,
        onComplete: handleComplete,
    });

    const handleVisModeChange = (mode: VisualizationMode) => {
        setVisMode(mode);
        if (mode !== 'sentence') setLineStartIndices(new Set());
    };

    useKeyboardShortcuts({
        isActive: viewMode === 'READING',
        rsvp,
        setWpm,
        onEscape: () => { rsvp.pause(); setViewMode('INPUT'); },
    });

    const handleTextSubmit = (text: string) => {
        const parsed = parseText(text);
        setParsedText(parsed);
        setBookTitle('Your Text');
        setActiveBook(null); // Pasted text isn't a library book — don't track progress for it.
        rsvp.reset();
        setViewMode('READING');
    };

    /** StoreFront fires this on touch-down; the transition takes over the gesture. */
    const handleOpenBook = useCallback((book: BookMetadata, originRect: DOMRect | null, opts: { slotId: string; startIndex?: number; targetRect?: DOMRect | null }) => {
        setPendingError(null);
        setPendingParsed(null);
        setPending({
            book,
            originRect: originRect ?? fallbackRect(),
            targetRect: opts.targetRect ?? undefined,
            slotId: opts.slotId,
            startIndex: opts.startIndex,
        });
    }, []);

    // Fetch + parse the pending book in parallel with the open animation.
    useEffect(() => {
        if (!pending) return;
        let alive = true;
        library.fetchContent(pending.book)
            .then((text) => {
                if (!alive) return;
                setPendingParsed(parseText(text));
            })
            .catch((e: unknown) => {
                if (!alive) return;
                setPendingError(e instanceof Error ? e.message : 'Could not open that book.');
            });
        return () => { alive = false; };
    }, [pending]);

    /** Once the transition finishes its exit animation, swap into the reader. */
    const completePendingOpen = useCallback(() => {
        if (!pending || !pendingParsed) return;
        setParsedText(pendingParsed);
        setBookTitle(pending.book.title);
        setActiveBook(pending.book);
        rsvp.reset();
        if (pending.startIndex && pending.startIndex > 0) {
            pendingSeekRef.current = pending.startIndex;
        }
        setViewMode('READING');
        setPending(null);
        setPendingParsed(null);
    }, [pending, pendingParsed, rsvp, setViewMode]);

    /** Bail out (Esc, backdrop tap, or fetch error). */
    const cancelPendingOpen = useCallback(() => {
        setPending(null);
        setPendingParsed(null);
    }, []);

    /** Apply a queued seek once `parsedText` has actually updated for the new book. */
    useEffect(() => {
        if (pendingSeekRef.current !== null && parsedText && parsedText.tokens.length > 0) {
            const target = pendingSeekRef.current;
            pendingSeekRef.current = null;
            rsvp.seek(target);
        }
    }, [parsedText, rsvp]);

    const handlePlay = () => {
        setViewMode('TEXT_INPUT');
    };

    const handleBack = () => {
        rsvp.pause();
        setViewMode('INPUT');
    };

    // ── Persist reading progress for library books, throttled. ────────────
    const lastSavedAtRef = useRef(0);
    const lastSavedIndexRef = useRef(-1);
    useEffect(() => {
        if (!activeBook || !parsedText || viewMode !== 'READING') return;
        const total = parsedText.tokens.length;
        if (total === 0) return;
        const now = Date.now();
        const sinceSave = now - lastSavedAtRef.current;
        const indexChanged = rsvp.currentIndex !== lastSavedIndexRef.current;
        if (indexChanged && (!rsvp.isPlaying || sinceSave >= PROGRESS_SAVE_INTERVAL_MS)) {
            updateProgress({
                bookId: activeBook.id,
                title: activeBook.title,
                author: activeBook.author,
                coverUrl: activeBook.coverUrl,
                textUrl: activeBook.textUrl,
                currentIndex: rsvp.currentIndex,
                totalTokens: total,
            });
            lastSavedAtRef.current = now;
            lastSavedIndexRef.current = rsvp.currentIndex;
        }
    }, [rsvp.currentIndex, rsvp.isPlaying, activeBook, parsedText, viewMode, updateProgress]);

    // Save on leaving the reader so the latest position sticks even if the
    // throttle window hadn't elapsed yet.
    useEffect(() => {
        if (viewMode !== 'READING' && activeBook && parsedText && lastSavedIndexRef.current !== rsvp.currentIndex && parsedText.tokens.length > 0) {
            updateProgress({
                bookId: activeBook.id,
                title: activeBook.title,
                author: activeBook.author,
                coverUrl: activeBook.coverUrl,
                textUrl: activeBook.textUrl,
                currentIndex: rsvp.currentIndex,
                totalTokens: parsedText.tokens.length,
            });
            lastSavedIndexRef.current = rsvp.currentIndex;
        }
    }, [viewMode, activeBook, parsedText, rsvp.currentIndex, updateProgress]);

    return (
        <div className="app-root">
            {/* ═══ STORE FRONT VIEW ═══ */}
            {viewMode === 'INPUT' && (
                <StoreFront
                    onOpenBook={handleOpenBook}
                    onManualInput={handlePlay}
                    openingSlotId={pending?.slotId ?? null}
                />
            )}

            {/* ═══ TEXT INPUT VIEW ═══ */}
            {viewMode === 'TEXT_INPUT' && (
                <div className="reading-view">
                    <header className="reading-header">
                        <button onClick={() => setViewMode('INPUT')} className="icon-btn">
                            <ArrowLeft size={20} />
                        </button>
                        <span className="reading-title">Paste or Pick Text</span>
                    </header>
                    <main className="reading-main" style={{ padding: '2rem 1rem' }}>
                        <TextInput onTextSubmit={handleTextSubmit} />
                    </main>
                </div>
            )}

            {/* ═══ READING VIEW ═══ */}
            {viewMode === 'READING' && (
                <div className="reading-view">
                    <header className="reading-header">
                        <button onClick={handleBack} className="icon-btn">
                            <ArrowLeft size={20} />
                        </button>
                        <span className="reading-title">{bookTitle}</span>
                        <div className="reading-controls">
                            <span className="control-label">Aa</span>
                            <input
                                type="range"
                                min="32"
                                max="96"
                                value={fontSize}
                                onChange={(e) => setFontSize(Number(e.target.value))}
                                className="size-slider"
                            />
                        </div>
                    </header>
                    <main className="reading-main">
                        <ReaderView
                            parsedText={parsedText}
                            rsvp={rsvp}
                            visMode={visMode}
                            onChangeVisMode={handleVisModeChange}
                            fontSize={fontSize}
                            wpm={wpm}
                            onWpmChange={setWpm}
                            onLineBreaksChange={setLineStartIndices}
                        />
                    </main>
                </div>
            )}

            {/* ═══ BOOK-OPEN TRANSITION ═══ */}
            {pending && (
                <BookOpenTransition
                    book={pending.book}
                    originRect={pending.originRect}
                    targetRect={pending.targetRect}
                    loaded={pendingParsed !== null}
                    error={pendingError}
                    onComplete={completePendingOpen}
                    onCancel={cancelPendingOpen}
                />
            )}

            {/* ═══ ERROR TOAST (open failed) ═══ */}
            {pendingError && !pending && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] max-w-sm w-[calc(100%-2rem)] bg-cream rounded-2xl ring-1 ring-coral-accent/30 shadow-xl px-4 py-3 flex items-start gap-3">
                    <div className="flex-1 text-[13px] text-espresso">
                        <p className="font-semibold">Couldn't open that book.</p>
                        <p className="text-mocha italic mt-0.5">{pendingError}</p>
                    </div>
                    <button onClick={() => setPendingError(null)} aria-label="Dismiss" className="text-mocha hover:text-espresso shrink-0 mt-0.5">
                        <X size={16} />
                    </button>
                </div>
            )}
        </div>
    );
}

export default App;
