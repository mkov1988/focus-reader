import { useMemo, useRef, useState } from 'react';
import {
    Play,
    Pause,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Minus,
    Plus,
    List,
    Check,
} from 'lucide-react';
import type { Chapter } from '../../utils/chapterDetection';
import type { TextToken } from '../../utils/textProcessing';

interface ControlsProps {
    isPlaying: boolean;
    wpm: number;
    progress: number;
    currentIndex: number;
    totalWords: number;
    chapters: Chapter[];
    paragraphs: TextToken[][];
    onToggle: () => void;
    onPause: () => void;
    onSkipSentence: (direction: -1 | 1) => void;
    onSeek: (index: number) => void;
    onWpmChange: (wpm: number) => void;
    onActivity?: () => void;
}

/** Index of the paragraph that contains (or most recently started before) `word`. */
function paragraphIndexForWord(word: number, starts: number[]): number {
    let lo = 0;
    let hi = starts.length - 1;
    let ans = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (starts[mid] <= word) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return ans;
}

/**
 * Controls Component
 *
 * Two faces that swap in place:
 *  - Playback: nav-toc button, prev/next sentence, play/pause, WPM.
 *  - Scrubber (active): paragraph-snapping track with chapter ticks, flanked by
 *    double-arrow chapter jumps and a live "peek" of the target paragraph.
 * Releasing a drag auto-applies the jump and collapses back to playback.
 */
export function Controls({
    isPlaying,
    wpm,
    progress: _progress,
    currentIndex,
    totalWords,
    chapters,
    paragraphs,
    onToggle,
    onPause,
    onSkipSentence,
    onSeek,
    onWpmChange,
    onActivity,
}: ControlsProps) {
    const [scrubbing, setScrubbing] = useState(false);
    const trackRef = useRef<HTMLDivElement>(null);
    const mainTrackRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const mainDraggingRef = useRef(false);

    const decreaseWpm = () => { onActivity?.(); onWpmChange(Math.max(100, wpm - 50)); };
    const increaseWpm = () => { onActivity?.(); onWpmChange(Math.min(1000, wpm + 50)); };

    const paraStarts = useMemo(
        () => paragraphs.map((p) => p[0]?.id ?? 0),
        [paragraphs],
    );
    const hasChapters = chapters.length > 0;
    const lastWord = Math.max(1, totalWords - 1);

    const chapterInfo = useMemo(() => {
        if (!chapters || chapters.length === 0) {
            const startWord = 0;
            const endWord = Math.max(0, totalWords - 1);
            const totalInChap = Math.max(1, totalWords);
            const currentInChap = Math.min(totalInChap, Math.max(1, currentIndex + 1));
            const prog = totalWords > 1 ? (currentIndex / (totalWords - 1)) * 100 : 0;
            return { title: undefined, startWord, endWord, totalInChap, currentInChap, progress: Math.min(100, Math.max(0, prog)) };
        }

        if (currentIndex < chapters[0].wordIndex) {
            const startWord = 0;
            const endWord = Math.max(0, chapters[0].wordIndex - 1);
            const totalInChap = Math.max(1, endWord - startWord + 1);
            const currentInChap = Math.min(totalInChap, Math.max(1, currentIndex - startWord + 1));
            const prog = endWord > startWord ? ((currentIndex - startWord) / (endWord - startWord)) * 100 : 0;
            return { title: 'Frontmatter', startWord, endWord, totalInChap, currentInChap, progress: Math.min(100, Math.max(0, prog)) };
        }

        let chapIdx = 0;
        for (let i = 0; i < chapters.length; i++) {
            if (chapters[i].wordIndex <= currentIndex) {
                chapIdx = i;
            } else {
                break;
            }
        }

        const startWord = chapters[chapIdx].wordIndex;
        const endWord = chapIdx < chapters.length - 1 ? chapters[chapIdx + 1].wordIndex - 1 : Math.max(startWord, totalWords - 1);
        const totalInChap = Math.max(1, endWord - startWord + 1);
        const currentInChap = Math.min(totalInChap, Math.max(1, currentIndex - startWord + 1));
        const prog = endWord > startWord ? ((currentIndex - startWord) / (endWord - startWord)) * 100 : 0;

        return { title: chapters[chapIdx].title, startWord, endWord, totalInChap, currentInChap, progress: Math.min(100, Math.max(0, prog)) };
    }, [currentIndex, chapters, totalWords]);

    const seekMainFromClientX = (clientX: number) => {
        const el = mainTrackRef.current;
        if (!el) return;
        onActivity?.();
        const rect = el.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        const targetWord = Math.round(chapterInfo.startWord + frac * (chapterInfo.endWord - chapterInfo.startWord));
        const pIdx = paragraphIndexForWord(targetWord, paraStarts);
        onSeek(paraStarts[pIdx] ?? targetWord);
    };

    // Live peek: which paragraph we're parked on, its opening words, and the
    // chapter it belongs to (if any).
    const peek = useMemo(() => {
        const pIdx = paragraphIndexForWord(currentIndex, paraStarts);
        const snippet = (paragraphs[pIdx] ?? [])
            .slice(0, 9)
            .map((t) => t.word)
            .join(' ');
        let chapterTitle: string | undefined;
        for (const c of chapters) {
            if (c.wordIndex <= currentIndex) chapterTitle = c.title;
            else break;
        }
        return { pIdx, snippet, chapterTitle };
    }, [currentIndex, paraStarts, paragraphs, chapters]);

    const openScrubber = () => {
        onPause();
        setScrubbing(true);
    };
    const closeScrubber = () => {
        draggingRef.current = false;
        setScrubbing(false);
    };

    const seekFromClientX = (clientX: number) => {
        const el = trackRef.current;
        if (!el || totalWords <= 1) return;
        const rect = el.getBoundingClientRect();
        const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        const word = Math.round(frac * lastWord);
        const pIdx = paragraphIndexForWord(word, paraStarts);
        onSeek(paraStarts[pIdx] ?? word);
    };

    const jumpChapter = (direction: -1 | 1) => {
        if (direction === 1) {
            const next = chapters.find((c) => c.wordIndex > currentIndex + 1);
            onSeek(next ? next.wordIndex : lastWord);
        } else {
            let target = 0;
            for (const c of chapters) {
                if (c.wordIndex < currentIndex - 1) target = c.wordIndex;
                else break;
            }
            onSeek(target);
        }
    };

    const secondaryBtn =
        'p-3 rounded-full bg-espresso/[0.06] border border-espresso/[0.1] text-mocha hover:bg-espresso/[0.1] hover:text-espresso transition-all';
    const chapterBtn =
        'p-3 rounded-full bg-espresso/[0.06] border border-espresso/[0.1] text-mocha transition-all enabled:hover:bg-espresso/[0.1] enabled:hover:text-espresso disabled:opacity-30';

    const handleFrac = totalWords > 1 ? (currentIndex / lastWord) * 100 : 0;

    return (
        <div className="w-full max-w-2xl mx-auto space-y-4 sm:space-y-6 pb-2 sm:pb-0 px-2 sm:px-0">
            {scrubbing ? (
                <>
                    {/* Live peek of the destination */}
                    <div className="text-center min-h-[3.5rem] flex flex-col justify-center px-2">
                        {peek.chapterTitle && (
                            <span className="text-xs uppercase tracking-wide text-coral-accent font-medium truncate">
                                {peek.chapterTitle}
                            </span>
                        )}
                        <span className="text-sm text-mocha italic truncate">
                            {peek.snippet ? `“${peek.snippet}…”` : '—'}
                        </span>
                    </div>

                    {/* Chapter ◄  [paragraph track]  ► chapter   ✓done */}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => jumpChapter(-1)}
                            disabled={!hasChapters}
                            className={chapterBtn}
                            aria-label="Previous chapter"
                        >
                            <ChevronsLeft className="w-5 h-5" />
                        </button>

                        <div className="flex-1">
                            <div
                                ref={trackRef}
                                className="relative h-10 flex items-center cursor-pointer touch-none select-none"
                                role="slider"
                                aria-label="Scrub by paragraph"
                                aria-valuenow={peek.pIdx}
                                aria-valuemin={0}
                                aria-valuemax={Math.max(0, paragraphs.length - 1)}
                                tabIndex={0}
                                onPointerDown={(e) => {
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                    draggingRef.current = true;
                                    seekFromClientX(e.clientX);
                                }}
                                onPointerMove={(e) => {
                                    if (draggingRef.current) seekFromClientX(e.clientX);
                                }}
                                onPointerUp={() => {
                                    if (draggingRef.current) closeScrubber();
                                }}
                            >
                                {/* Rail */}
                                <div className="absolute inset-x-0 h-2 rounded-full bg-espresso/[0.1]" />
                                {/* Filled portion */}
                                <div
                                    className="absolute h-2 rounded-full bg-coral-accent/70"
                                    style={{ width: `${handleFrac}%` }}
                                />
                                {/* Chapter ticks */}
                                {chapters.map((c) => (
                                    <div
                                        key={c.wordIndex}
                                        className="absolute w-0.5 h-3 -translate-x-1/2 bg-espresso/30 rounded-full"
                                        style={{ left: `${(c.wordIndex / lastWord) * 100}%` }}
                                        title={c.title}
                                    />
                                ))}
                                {/* Handle */}
                                <div
                                    className="absolute w-5 h-5 -translate-x-1/2 rounded-full bg-coral-accent shadow-md shadow-coral-accent/40 ring-2 ring-cream"
                                    style={{ left: `${handleFrac}%` }}
                                />
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => jumpChapter(1)}
                            disabled={!hasChapters}
                            className={chapterBtn}
                            aria-label="Next chapter"
                        >
                            <ChevronsRight className="w-5 h-5" />
                        </button>

                        <button
                            type="button"
                            onClick={closeScrubber}
                            className="p-3 rounded-full bg-coral-accent text-white hover:brightness-110 transition-all shadow-lg shadow-coral-accent/30"
                            aria-label="Done navigating"
                        >
                            <Check className="w-5 h-5" />
                        </button>
                    </div>
                </>
            ) : (
                <>
                    {/* Progress Bar (Interactive & Chapter-Based) */}
                    <div className="space-y-2 select-none">
                        <div
                            ref={mainTrackRef}
                            className="relative h-6 flex items-center cursor-pointer touch-none group"
                            role="slider"
                            aria-label="Chapter Progress"
                            aria-valuenow={chapterInfo.currentInChap}
                            aria-valuemin={1}
                            aria-valuemax={chapterInfo.totalInChap}
                            tabIndex={0}
                            onPointerDown={(e) => {
                                e.currentTarget.setPointerCapture(e.pointerId);
                                mainDraggingRef.current = true;
                                onPause();
                                seekMainFromClientX(e.clientX);
                            }}
                            onPointerMove={(e) => {
                                if (mainDraggingRef.current) seekMainFromClientX(e.clientX);
                            }}
                            onPointerUp={() => {
                                mainDraggingRef.current = false;
                            }}
                        >
                            {/* Rail */}
                            <div className="absolute inset-x-0 h-2 bg-espresso/[0.1] rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-coral-accent rounded-full transition-all duration-75"
                                    style={{ width: `${chapterInfo.progress}%` }}
                                />
                            </div>
                            {/* Scrubber Knob / Thumb */}
                            <div
                                className="absolute w-4 h-4 -translate-x-1/2 rounded-full bg-coral-accent shadow-md shadow-coral-accent/40 ring-2 ring-cream transition-transform group-hover:scale-125"
                                style={{ left: `${chapterInfo.progress}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-sm text-mocha">
                            <span>{chapterInfo.title ? `${chapterInfo.title}: word` : 'Word'} {chapterInfo.currentInChap} of {chapterInfo.totalInChap}</span>
                            <span>{Math.round(chapterInfo.progress)}%</span>
                        </div>
                    </div>

                    {/* Main Controls */}
                    <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
                        <button
                            type="button"
                            onClick={openScrubber}
                            className={secondaryBtn}
                            aria-label="Navigate chapters and paragraphs"
                        >
                            <List className="w-5 h-5" />
                        </button>

                        <button
                            type="button"
                            onClick={() => onSkipSentence(-1)}
                            className={secondaryBtn}
                            aria-label="Previous sentence"
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </button>

                        <button
                            type="button"
                            onClick={onToggle}
                            className="p-5 rounded-full bg-coral-accent text-white hover:brightness-110 transition-all shadow-lg shadow-coral-accent/30"
                            aria-label={isPlaying ? 'Pause' : 'Play'}
                        >
                            {isPlaying ? (
                                <Pause className="w-8 h-8" />
                            ) : (
                                <Play className="w-8 h-8 ml-1" />
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => onSkipSentence(1)}
                            className={secondaryBtn}
                            aria-label="Next sentence"
                        >
                            <ChevronRight className="w-6 h-6" />
                        </button>

                        {/* WPM Control */}
                        <div className="flex items-center gap-2 ml-0 sm:ml-4 bg-espresso/[0.06] border border-espresso/[0.1] rounded-full px-3 py-2">
                            <button
                                type="button"
                                onClick={decreaseWpm}
                                className="p-1 hover:bg-espresso/[0.1] rounded-full transition-colors text-mocha hover:text-espresso"
                                aria-label="Decrease speed"
                            >
                                <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-16 text-center font-medium text-sm text-espresso tabular-nums">
                                {wpm} WPM
                            </span>
                            <button
                                type="button"
                                onClick={increaseWpm}
                                className="p-1 hover:bg-espresso/[0.1] rounded-full transition-colors text-mocha hover:text-espresso"
                                aria-label="Increase speed"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
