import { useMemo } from 'react';
import { RSVPDisplay } from './RSVPDisplay';
import { GhostTrailDisplay } from './GhostTrailDisplay';
import { ParagraphDisplay } from './ParagraphDisplay';
import { SentenceDisplay } from './SentenceDisplay';
import { VisualizationSelector, type VisualizationMode } from './VisualizationSelector';
import { Controls } from './Controls';
import type { UseRSVPReturn } from '../../hooks/useRSVP';
import type { ParsedText } from '../../utils/textProcessing';

interface ReaderViewProps {
    parsedText: ParsedText | null;
    rsvp: UseRSVPReturn;
    visMode: VisualizationMode;
    onChangeVisMode: (mode: VisualizationMode) => void;
    fontSize: number;
    wpm: number;
    onWpmChange: (wpm: number) => void;
    onLineBreaksChange: (indices: Set<number>) => void;
    chromeVisible?: boolean;
    onActivity?: () => void;
    /** Tap on the reading surface — peeks the reader chrome. */
    onTap?: () => void;
}

export function ReaderView({
    parsedText,
    rsvp,
    visMode,
    onChangeVisMode,
    fontSize,
    wpm,
    onWpmChange,
    onLineBreaksChange,
    chromeVisible = true,
    onActivity,
    onTap,
}: ReaderViewProps) {

    // Current paragraph for the paragraph views.
    const { currentParagraph } = useMemo(() => {
        if (!parsedText || !rsvp.currentToken) {
            return { currentParagraph: [] };
        }
        const pIndex = rsvp.currentToken.paragraphIndex;
        return {
            currentParagraph: parsedText.paragraphs[pIndex] || [],
        };
    }, [parsedText, rsvp.currentToken]);

    // Scrolling / scrubbing the text by hand pauses playback so the auto-recenter
    // stops fighting the user for position. Also counts as activity so the reader
    // chrome behaves as if the user is engaged.
    const handleManualScroll = () => {
        onActivity?.();
        if (rsvp.isPlaying) rsvp.pause();
    };

    // Over-scrolling a paragraph edge moves to an adjacent paragraph. `count` is
    // how many to jump — 1 for a normal push, more for a strong flick.
    const handleAdvanceParagraph = (dir: -1 | 1, count: number) => {
        if (!parsedText || !rsvp.currentToken) return;
        const paras = parsedText.paragraphs;
        const from = rsvp.currentToken.paragraphIndex;
        const targetIndex = Math.max(0, Math.min(paras.length - 1, from + dir * count));
        const target = paras[targetIndex];
        if (target && target.length > 0 && targetIndex !== from) {
            handleManualScroll();
            rsvp.seek(target[0].id);
        }
    };

    const tokens = parsedText?.tokens ?? [];

    return (
        <div className="w-full h-full max-w-4xl flex flex-col items-center py-4 sm:py-8 px-2 sm:px-4">

            {/* Top Controls: Vis Mode */}
            <div className={`shrink-0 w-full flex justify-center relative z-50 transition-opacity duration-300 ease-out ${
                chromeVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}>
                <VisualizationSelector mode={visMode} onChange={(mode) => { onActivity?.(); onChangeVisMode(mode); }} />
            </div>

            {/* Reading Area - Height Constrained for Layout Stability */}
            <div className="w-full flex-1 flex flex-col items-center justify-center relative min-h-0 overflow-hidden">

                {/* RSVP Mode */}
                {visMode === 'rsvp' && (
                    <RSVPDisplay
                        tokens={tokens}
                        currentIndex={rsvp.currentIndex}
                        fontSize={fontSize}
                        isPlaying={rsvp.isPlaying}
                        onSeek={rsvp.seek}
                        onScrubStart={handleManualScroll}
                        onTap={onTap}
                    />
                )}

                {/* Ghost Trail Mode */}
                {visMode === 'trail' && parsedText && (
                    <GhostTrailDisplay
                        tokens={parsedText.tokens}
                        currentIndex={rsvp.currentIndex}
                        fontSize={fontSize}
                        onSeek={rsvp.seek}
                        onScrubStart={handleManualScroll}
                        onTap={onTap}
                    />
                )}

                {/* Paragraph Mode */}
                {visMode === 'paragraph' && (
                    <ParagraphDisplay
                        paragraphTokens={currentParagraph}
                        currentIndex={rsvp.currentIndex}
                        fontSize={fontSize}
                        onWordClick={rsvp.seek}
                        onManualScroll={handleManualScroll}
                        onAdvanceParagraph={handleAdvanceParagraph}
                    />
                )}

                {/* Sentence Mode */}
                {visMode === 'sentence' && (
                    <SentenceDisplay
                        tokens={tokens}
                        currentIndex={rsvp.currentIndex}
                        fontSize={fontSize}
                        onWordClick={rsvp.seek}
                        onLineBreaksChange={onLineBreaksChange}
                        onSeek={rsvp.seek}
                        onScrubStart={handleManualScroll}
                    />
                )}

                {/* Hybrid Mode: RSVP + Faded Paragraph */}
                {visMode === 'hybrid' && (
                    <div className="flex flex-col items-center w-full h-full pb-2">
                        <div className="flex-1 flex items-center justify-center min-h-0 w-full">
                            <RSVPDisplay
                                tokens={tokens}
                                currentIndex={rsvp.currentIndex}
                                fontSize={fontSize}
                                isPlaying={rsvp.isPlaying}
                                onSeek={rsvp.seek}
                                onScrubStart={handleManualScroll}
                                onTap={onTap}
                            />
                        </div>
                        <div className="w-full shrink-0 h-[45%] min-h-0 opacity-40 hover:opacity-100 transition-opacity">
                            <ParagraphDisplay
                                paragraphTokens={currentParagraph}
                                currentIndex={rsvp.currentIndex}
                                fontSize={fontSize * 0.5} // Smaller context
                                onWordClick={rsvp.seek}
                                onManualScroll={handleManualScroll}
                                onAdvanceParagraph={handleAdvanceParagraph}
                                className="h-full"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className={`shrink-0 w-full mt-auto transition-opacity duration-300 ease-out ${
                chromeVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}>
                <Controls
                    isPlaying={rsvp.isPlaying}
                    wpm={wpm}
                    progress={rsvp.progress}
                    currentIndex={rsvp.currentIndex}
                    totalWords={parsedText?.tokens.length || 0}
                    chapters={parsedText?.chapters ?? []}
                    paragraphs={parsedText?.paragraphs ?? []}
                    onToggle={rsvp.toggle}
                    onPause={rsvp.pause}
                    onSkipSentence={rsvp.skipToSentence}
                    onSeek={rsvp.seek}
                    onWpmChange={onWpmChange}
                    onActivity={onActivity}
                />
            </div>
        </div>
    );
}
