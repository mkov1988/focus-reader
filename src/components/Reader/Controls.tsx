import {
    Play,
    Pause,
    RotateCcw,
    ChevronLeft,
    ChevronRight,
    Minus,
    Plus
} from 'lucide-react';

interface ControlsProps {
    isPlaying: boolean;
    wpm: number;
    progress: number;
    currentIndex: number;
    totalWords: number;
    onToggle: () => void;
    onReset: () => void;
    onSkipSentence: (direction: -1 | 1) => void;
    onSeek: (index: number) => void;
    onWpmChange: (wpm: number) => void;
}

/**
 * Controls Component
 * 
 * Dark-themed playback controls with red accent color.
 */
export function Controls({
    isPlaying,
    wpm,
    progress,
    currentIndex,
    totalWords,
    onToggle,
    onReset,
    onSkipSentence,
    onSeek,
    onWpmChange,
}: ControlsProps) {
    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = x / rect.width;
        const targetIndex = Math.floor(percentage * totalWords);
        onSeek(targetIndex);
    };

    const decreaseWpm = () => onWpmChange(Math.max(100, wpm - 50));
    const increaseWpm = () => onWpmChange(Math.min(1000, wpm + 50));

    // Shared styles for secondary buttons (theme-aware via ink/paper tokens)
    const secondaryBtn = 'p-3 rounded-full bg-espresso/[0.06] border border-espresso/[0.1] text-mocha hover:bg-espresso/[0.1] hover:text-espresso transition-all';

    return (
        <div className="w-full max-w-2xl mx-auto space-y-6">
            {/* Progress Bar */}
            <div className="space-y-2">
                <div
                    className="h-2 bg-espresso/[0.1] rounded-full cursor-pointer overflow-hidden"
                    onClick={handleProgressClick}
                    role="slider"
                    aria-label="Reading progress"
                    aria-valuenow={currentIndex}
                    aria-valuemin={0}
                    aria-valuemax={totalWords}
                    tabIndex={0}
                >
                    <div
                        className="h-full bg-coral-accent rounded-full transition-all duration-75"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <div className="flex justify-between text-sm text-mocha">
                    <span>Word {currentIndex + 1} of {totalWords}</span>
                    <span>{Math.round(progress)}%</span>
                </div>
            </div>

            {/* Main Controls */}
            <div className="flex items-center justify-center gap-4">
                <button
                    type="button"
                    onClick={onReset}
                    className={secondaryBtn}
                    aria-label="Reset to beginning"
                >
                    <RotateCcw className="w-5 h-5" />
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
                <div className="flex items-center gap-2 ml-4 bg-espresso/[0.06] border border-espresso/[0.1] rounded-full px-3 py-2">
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

            {/* Keyboard hints */}
            <div className="text-center text-xs text-mocha/80">
                <span className="px-2 py-1 bg-espresso/[0.06] border border-espresso/[0.1] rounded text-mocha">Space</span>
                <span className="mx-1 text-mocha/70">Play/Pause</span>
                <span className="mx-3 text-mocha/40">•</span>
                <span className="px-2 py-1 bg-espresso/[0.06] border border-espresso/[0.1] rounded text-mocha">←/→</span>
                <span className="mx-1 text-mocha/70">Prev / Next sentence</span>
            </div>
        </div>
    );
}
