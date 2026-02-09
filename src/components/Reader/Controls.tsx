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
    onSkip: (delta: number) => void;
    onSeek: (index: number) => void;
    onWpmChange: (wpm: number) => void;
}

/**
 * Controls Component
 * 
 * Provides playback controls, WPM adjustment, and progress tracking.
 * Designed for keyboard-first interaction (accessibility).
 */
export function Controls({
    isPlaying,
    wpm,
    progress,
    currentIndex,
    totalWords,
    onToggle,
    onReset,
    onSkip,
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

    return (
        <div className="w-full max-w-2xl mx-auto space-y-6">
            {/* Progress Bar */}
            <div className="space-y-2">
                <div
                    className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full cursor-pointer overflow-hidden"
                    onClick={handleProgressClick}
                    role="slider"
                    aria-label="Reading progress"
                    aria-valuenow={currentIndex}
                    aria-valuemin={0}
                    aria-valuemax={totalWords}
                    tabIndex={0}
                >
                    <div
                        className="h-full bg-gradient-to-r from-focal to-red-400 rounded-full transition-all duration-75"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>Word {currentIndex + 1} of {totalWords}</span>
                    <span>{Math.round(progress)}%</span>
                </div>
            </div>

            {/* Main Controls */}
            <div className="flex items-center justify-center gap-4">
                <button
                    onClick={onReset}
                    className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Reset to beginning"
                >
                    <RotateCcw className="w-5 h-5" />
                </button>

                <button
                    onClick={() => onSkip(-10)}
                    className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Skip back 10 words"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>

                <button
                    onClick={onToggle}
                    className="p-5 rounded-full bg-focal text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/25"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                    {isPlaying ? (
                        <Pause className="w-8 h-8" />
                    ) : (
                        <Play className="w-8 h-8 ml-1" />
                    )}
                </button>

                <button
                    onClick={() => onSkip(10)}
                    className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Skip forward 10 words"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>

                {/* WPM Control */}
                <div className="flex items-center gap-2 ml-4 bg-gray-100 dark:bg-gray-800 rounded-full px-3 py-2">
                    <button
                        onClick={decreaseWpm}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                        aria-label="Decrease speed"
                    >
                        <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-16 text-center font-medium text-sm">
                        {wpm} WPM
                    </span>
                    <button
                        onClick={increaseWpm}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                        aria-label="Increase speed"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Keyboard hints */}
            <div className="text-center text-xs text-gray-400 dark:text-gray-500">
                <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">Space</span> Play/Pause
                <span className="mx-3">•</span>
                <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">←/→</span> Skip 10 words
            </div>
        </div>
    );
}
