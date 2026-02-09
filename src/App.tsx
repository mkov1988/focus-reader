import { useCallback, useEffect, useState } from 'react';
import { Moon, Sun, ArrowLeft } from 'lucide-react';
import { RSVPDisplay } from './components/Reader/RSVPDisplay';
import { Controls } from './components/Reader/Controls';
import { TextInput } from './components/Input/TextInput';
import { useRSVP } from './hooks/useRSVP';
import { tokenizeText } from './utils/textProcessing';
import './index.css';

type AppView = 'input' | 'reader';

function App() {
  const [view, setView] = useState<AppView>('input');
  const [words, setWords] = useState<string[]>([]);
  const [wpm, setWpm] = useState(300);
  const [fontSize, setFontSize] = useState(56);
  const [isDark, setIsDark] = useState(true);

  const handleComplete = useCallback(() => {
    // Optional: show completion message or reset
  }, []);

  const rsvp = useRSVP({
    words,
    wpm,
    onComplete: handleComplete,
  });

  // Apply dark mode to body
  useEffect(() => {
    document.body.classList.toggle('dark', isDark);
  }, [isDark]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (view !== 'reader') return;

      // Ignore if typing in an input
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          rsvp.toggle();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          rsvp.skip(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          rsvp.skip(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setWpm(prev => Math.min(1000, prev + 50));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setWpm(prev => Math.max(100, prev - 50));
          break;
        case 'Escape':
          rsvp.pause();
          setView('input');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, rsvp]);

  const handleTextSubmit = (text: string) => {
    const tokenized = tokenizeText(text);
    setWords(tokenized);
    rsvp.reset();
    setView('reader');
  };

  const handleBack = () => {
    rsvp.pause();
    setView('input');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-4">
          {view === 'reader' && (
            <button
              onClick={handleBack}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Back to input"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <span className="font-semibold text-lg">
            <span className="text-focal">Focus</span> Reader
          </span>
        </div>

        <div className="flex items-center gap-4">
          {view === 'reader' && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Size</label>
              <input
                type="range"
                min="32"
                max="96"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-24 accent-focal"
              />
            </div>
          )}

          <button
            onClick={() => setIsDark(!isDark)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Toggle dark mode"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-8">
        {view === 'input' ? (
          <TextInput onTextSubmit={handleTextSubmit} />
        ) : (
          <div className="w-full max-w-4xl space-y-12">
            {/* RSVP Display */}
            <RSVPDisplay
              word={rsvp.currentWord}
              fontSize={fontSize}
              className="mb-8"
            />

            {/* Controls */}
            <Controls
              isPlaying={rsvp.isPlaying}
              wpm={wpm}
              progress={rsvp.progress}
              currentIndex={rsvp.currentIndex}
              totalWords={words.length}
              onToggle={rsvp.toggle}
              onReset={rsvp.reset}
              onSkip={rsvp.skip}
              onSeek={rsvp.seek}
              onWpmChange={setWpm}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
