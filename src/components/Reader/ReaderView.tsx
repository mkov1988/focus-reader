import { useMemo } from 'react';
import { RSVPDisplay } from './RSVPDisplay';
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
        <div className="w-full max-w-4xl space-y-8 flex flex-col items-center">

            {/* Top Controls: Vis Mode */}
            <VisualizationSelector mode={visMode} onChange={onChangeVisMode} />

            {/* Reading Area - Height Constrained for Layout Stability */}
            <div className="w-full flex-1 min-h-[50vh] flex flex-col items-center justify-center relative">

                {/* RSVP Mode */}
                {visMode === 'rsvp' && (
                    <RSVPDisplay
                        word={rsvp.currentToken?.word || ''}
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
                    <div className="flex flex-col items-center gap-8 w-full">
                        <RSVPDisplay
                            word={rsvp.currentToken?.word || ''}
                            fontSize={fontSize}
                        />
                        <div className="opacity-40 hover:opacity-100 transition-opacity">
                            <ParagraphDisplay
                                paragraphTokens={currentParagraph}
                                currentIndex={rsvp.currentIndex}
                                fontSize={fontSize * 0.5} // Smaller context
                                onWordClick={rsvp.seek}
                                className="h-[25vh]" // Shorter height for context
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            <Controls
                isPlaying={rsvp.isPlaying}
                wpm={wpm}
                progress={rsvp.progress}
                currentIndex={rsvp.currentIndex}
                totalWords={parsedText?.tokens.length || 0}
                onToggle={rsvp.toggle}
                onReset={rsvp.reset}
                onSkip={rsvp.skip}
                onSeek={rsvp.seek}
                onWpmChange={onWpmChange}
            />
        </div>
    );
}
