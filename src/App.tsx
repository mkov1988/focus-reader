import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Bookmark } from 'lucide-react';
import { ReaderView } from './components/Reader/ReaderView';
import { InnerPageHeader } from './components/InnerPageHeader';
import { type VisualizationMode } from './components/Reader/VisualizationSelector';
import { StoreFront } from './components/Input/StoreFront';
import { BookOpenTransition } from './components/Reader/BookOpenTransition';
import { useStore } from './store/useStore';
import { useRSVP } from './hooks/useRSVP';
import { useImmersiveMode } from './hooks/useImmersiveMode';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useReaderGestures } from './hooks/useReaderGestures';
import { parseText, type ParsedText } from './utils/textProcessing';
import { haptics } from './utils/haptics';
import { webLibraryService as library } from './services/library';
import { getScenes } from './services/scenes';
import type { BookMetadata } from './services/types';
import { THEMES } from './theme';
import './index.css';

// Configuration Constants
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
    /** Keyboard / screen-reader activation: skip pointer tracking, auto-open. */
    keyboardActivated?: boolean;
}

function App() {
    const viewMode = useStore((s) => s.viewMode);
    const setViewMode = useStore((s) => s.setViewMode);
    const updateProgress = useStore((s) => s.updateProgress);
    const addSession = useStore((s) => s.addSession);
    const themeIndex = useStore((s) => s.themeIndex);
    const mode = useStore((s) => s.mode);
    const wpm = useStore((s) => s.wpm);
    const setWpm = useStore((s) => s.setWpm);
    const visMode = useStore((s) => s.visMode);
    const setVisMode = useStore((s) => s.setVisMode);

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
        // Triplet (R G B) so Tailwind's `text-focal/50` etc. resolve correctly
        // via `rgb(var(--focal-color) / <alpha-value>)`.
        root.style.setProperty('--focal-color', palette.focalRgb);
        
        root.dataset.mode = mode;
    }, [themeIndex, mode]);

    const [parsedText, setParsedText] = useState<ParsedText | null>(null);
    const [bookTitle, setBookTitle] = useState<string>('Focus Reader');
    const [activeBook, setActiveBook] = useState<BookMetadata | null>(null);
    // Reader font size is fixed for now — the in-header "Aa" slider was removed
    // pending a reader-controls rework. ReaderView still honours the value.
    const [fontSize] = useState(DEFAULT_FONT_SIZE);

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
        readableStartWord: parsedText?.readableStartWord ?? 0,
        readableEndWord: parsedText?.readableEndWord,
        onComplete: handleComplete,
    });

    const { chromeVisible, handlePeek, resetIdleTimer } = useImmersiveMode({
        isPlaying: rsvp.isPlaying,
    });

    const handleVisModeChange = (mode: VisualizationMode) => {
        setVisMode(mode);
        if (mode !== 'sentence') setLineStartIndices(new Set());
    };

    // Adapter: the store's setWpm takes a value, the keyboard hook prefers
    // an updater function. Pull the latest wpm from the store on demand.
    const setWpmUpdater = useCallback((update: (prev: number) => number) => {
        setWpm(update(useStore.getState().wpm));
    }, [setWpm]);

    useKeyboardShortcuts({
        isActive: viewMode === 'READING',
        rsvp,
        setWpm: setWpmUpdater,
        onEscape: () => { rsvp.pause(); setViewMode('INPUT'); },
        onActivity: resetIdleTimer,
    });

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

    /** Keyboard / screen-reader path. Same animation, no gesture: the cover
     *  springs open on mount, "Brewing your book…" shows, and the transition
     *  closes into the reader as soon as text is parsed. */
    const handleOpenBookInstant = useCallback((book: BookMetadata, originRect: DOMRect | null, startIndex?: number) => {
        setPendingError(null);
        setPendingParsed(null);
        setPending({
            book,
            originRect: originRect ?? fallbackRect(),
            slotId: `kbd:${book.id}`,
            startIndex,
            keyboardActivated: true,
        });
    }, []);

    // Fetch + parse the pending book in parallel with the open animation.
    useEffect(() => {
        if (!pending) return;
        let alive = true;
        library.fetchContent(pending.book)
            .then((text) => {
                if (!alive) return;
                const parsed = parseText(text);
                // Prefer an authored scene map over heuristically detected chapters,
                // so the reader's scrubber shows scene names ("A Mad Tea-Party") that
                // match the home hero's "previously" recap. Falls back to detected
                // chapters for books without a map. (services/scenes.ts)
                const scenes = getScenes(pending.book.id);
                if (scenes.length > 0) {
                    parsed.chapters = scenes.map((s) => ({ title: s.label, wordIndex: s.startIndex, lineIndex: 0 }));
                    parsed.chapterConfidence = 'high';
                }
                setPendingParsed(parsed);
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
        } else if (pendingParsed.readableStartWord > 0) {
            pendingSeekRef.current = pendingParsed.readableStartWord;
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

    const handleBack = () => {
        rsvp.pause();
        setViewMode('INPUT');
    };

    // Pause when the app goes to the background (screen lock, app switch, incoming
    // call). Otherwise the RSVP loop and the session timer keep running while the
    // phone is away, drifting the reading position and inflating reading stats.
    // A ref keeps the listener stable without re-subscribing each render.
    const rsvpRef = useRef(rsvp);
    useEffect(() => { rsvpRef.current = rsvp; }, [rsvp]);
    useEffect(() => {
        const onHidden = () => { if (document.visibilityState === 'hidden') rsvpRef.current.pause(); };
        document.addEventListener('visibilitychange', onHidden);
        return () => document.removeEventListener('visibilitychange', onHidden);
    }, []);

    // Touch gestures for the reading view: tap to peek controls without pausing,
    // swipe L/R to skip sentence, swipe down to exit. Haptic confirmation on tap.
    const readerGestures = useReaderGestures({
        onTap: () => { haptics.tick(); handlePeek(); },
        onSwipeLeft: () => { resetIdleTimer(); rsvp.skipToSentence(1); },
        onSwipeRight: () => { resetIdleTimer(); rsvp.skipToSentence(-1); },
        onSwipeDown: handleBack,
    });

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

    // ── Track reading sessions (one span of continuous play → pause). ─────
    // On play, snapshot the start; on pause, emit (words, ms) and clear.
    // Drives the "Your Reading" card on the storefront.
    const sessionStartRef = useRef<{ at: number; index: number } | null>(null);
    const currentIndexRef = useRef(rsvp.currentIndex);
    useEffect(() => { currentIndexRef.current = rsvp.currentIndex; }, [rsvp.currentIndex]);
    useEffect(() => {
        if (rsvp.isPlaying) {
            sessionStartRef.current = { at: Date.now(), index: rsvp.currentIndex };
        } else if (sessionStartRef.current) {
            const { at, index } = sessionStartRef.current;
            const ms = Date.now() - at;
            const words = Math.max(0, currentIndexRef.current - index);
            if (ms > 0 && words > 0) addSession(words, ms);
            sessionStartRef.current = null;
        }
        // currentIndexRef is read at pause-time only, not a dependency.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rsvp.isPlaying, addSession]);

    return (
        <div className="app-root">
            {/* ═══ STORE FRONT VIEW ═══ */}
            {viewMode === 'INPUT' && (
                <StoreFront
                    onOpenBook={handleOpenBook}
                    onOpenBookInstant={handleOpenBookInstant}
                    openingSlotId={pending?.slotId ?? null}
                />
            )}

            {/* ═══ READING VIEW ═══ */}
            {viewMode === 'READING' && (
                <div className="reading-view">
                    <InnerPageHeader title={bookTitle} backLabel="Back" onBack={handleBack} collapsed={!chromeVisible} />
                    <main className="reading-main" {...readerGestures} style={{ touchAction: 'pan-y' }}>
                        <ReaderView
                            parsedText={parsedText}
                            rsvp={rsvp}
                            visMode={visMode}
                            onChangeVisMode={handleVisModeChange}
                            fontSize={fontSize}
                            wpm={wpm}
                            onWpmChange={setWpm}
                            onLineBreaksChange={setLineStartIndices}
                            chromeVisible={chromeVisible}
                            onActivity={resetIdleTimer}
                        />
                    </main>
                </div>
            )}

            {/* ═══ BOOK-OPEN TRANSITION ═══
                Keyed by book + slot so React unmounts/remounts cleanly between
                rapid sequential opens — otherwise the transition's geometry
                ref stays locked to the first book's slot position. */}
            {pending && (
                <BookOpenTransition
                    key={`${pending.slotId}:${pending.book.id}`}
                    book={pending.book}
                    originRect={pending.originRect}
                    targetRect={pending.targetRect}
                    loaded={pendingParsed !== null}
                    error={pendingError}
                    autoCommit={pending.keyboardActivated}
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
                    <button type="button" onClick={() => setPendingError(null)} aria-label="Dismiss" className="text-mocha hover:text-espresso shrink-0 mt-0.5">
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* ═══ CONFIRMATION TOAST (e.g. "Saved for later") ═══ */}
            <Toast />
        </div>
    );
}

/** Transient confirmation bubble driven by the store's `toast`. Each new toast
 *  carries a fresh id; keying the node on it remounts a fresh one-shot CSS
 *  animation (slide up + fade in, hold, fade out) — no timers or effect state.
 *  The bubble is non-interactive, so it stays `pointer-events-none` throughout
 *  and never blocks taps beneath it. Used to confirm a save-for-later. */
function Toast() {
    const toast = useStore((s) => s.toast);
    if (!toast) return null;
    return (
        <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed left-1/2 z-[95] animate-toast"
            style={{ bottom: 'max(1.75rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
        >
            <div className="flex items-center gap-2.5 rounded-full bg-cream pl-2.5 pr-4 py-2 ring-1 ring-espresso/10 shadow-[0_8px_24px_rgba(58,42,30,0.20)]">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-coral-accent text-[rgb(var(--coral-accent-text))]">
                    <Bookmark size={14} fill="currentColor" />
                </span>
                <span className="text-[13px] font-semibold text-espresso whitespace-nowrap">{toast.message}</span>
            </div>
        </div>
    );
}

export default App;
