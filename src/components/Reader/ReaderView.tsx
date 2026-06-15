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
}: ReaderViewProps) {

    // Calculate context tokens based on current index
    const { currentParagraph, currentSentence } = useMemo(() => {
        if (!parsedText || !rsvp.currentToken) {
            return { currentParagraph: [], currentSentence: [] };
        }
        const pIndex = rsvp.currentToken.paragraphIndex;
        const sIndex = rsvp.currentToken.sentenceIndex;
        return {
            currentParagraph: parsedText.paragraphs[pIndex] || [],
            currentSentence: parsedText.sentences[sIndex] || [],
        };
    }, [parsedText, rsvp.currentToken]);

    return (
        <div className="w-full h-full max-w-4xl flex flex-col items-center py-4 sm:py-8 px-2 sm:px-4">

            {/* Top Controls: Vis Mode */}
            <div className="shrink-0 w-full flex justify-center relative z-50">
                <VisualizationSelector mode={visMode} onChange={onChangeVisMode} />
            </div>

            {/* Reading Area - Height Constrained for Layout Stability */}
            <div className="w-full flex-1 flex flex-col items-center justify-center relative min-h-0 overflow-hidden">

                {/* RSVP Mode */}
                {visMode === 'rsvp' && (
                    <RSVPDisplay
                        word={rsvp.currentToken?.word || ''}
                        fontSize={fontSize}
                    />
                )}

                {/* Ghost Trail Mode */}
                {visMode === 'trail' && parsedText && (
                    <GhostTrailDisplay
                        tokens={parsedText.tokens}
                        currentIndex={rsvp.currentIndex}
                        fontSize={fontSize}
                    />
                )}

                {/* Paragraph Mode */}
                {visMode === 'paragraph' && (
                    <ParagraphDisplay
                        paragraphTokens={currentParagraph}
                        currentIndex={rsvp.currentIndex}
                        fontSize={fontSize}
                        onWordClick={rsvp.seek}
                    />
                )}

                {/* Sentence Mode */}
                {visMode === 'sentence' && (
                    <SentenceDisplay
                        tokens={currentSentence}
                        currentIndex={rsvp.currentIndex}
                        fontSize={fontSize}
                        onWordClick={rsvp.seek}
                        onLineBreaksChange={onLineBreaksChange}
                    />
                )}

                {/* Hybrid Mode: RSVP + Faded Paragraph */}
                {visMode === 'hybrid' && (
                    <div className="flex flex-col items-center w-full h-full pb-2">
                        <div className="flex-1 flex items-center justify-center min-h-0 w-full">
                            <RSVPDisplay
                                word={rsvp.currentToken?.word || ''}
                                fontSize={fontSize}
                            />
                        </div>
                        <div className="w-full shrink-0 h-[45%] min-h-0 opacity-40 hover:opacity-100 transition-opacity">
                            <ParagraphDisplay
                                paragraphTokens={currentParagraph}
                                currentIndex={rsvp.currentIndex}
                                fontSize={fontSize * 0.5} // Smaller context
                                onWordClick={rsvp.seek}
                                className="h-full"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="shrink-0 w-full mt-auto">
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
                />
            </div>
        </div>
    );
}
