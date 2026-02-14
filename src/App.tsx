import { useCallback, useEffect, useState } from 'react';
import { Moon, Sun, ArrowLeft } from 'lucide-react';
import { ReaderView } from './components/Reader/ReaderView';
import { type VisualizationMode } from './components/Reader/VisualizationSelector';
import { TextInput } from './components/Input/TextInput';
import { useRSVP } from './hooks/useRSVP';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { parseText, type ParsedText } from './utils/textProcessing';
import './index.css';

type AppView = 'input' | 'reader';

// Configuration Constants
const DEFAULT_WPM = 300;
const DEFAULT_FONT_SIZE = 56;
const SENTENCE_START_MULTIPLIER = 1.8;
const SENTENCE_START_OFFSET = 500;
const LINE_START_MULTIPLIER = 1.5;

function App() {
  const [view, setView] = useState<AppView>('input');
  const [parsedText, setParsedText] = useState<ParsedText | null>(null);
  const [visMode, setVisMode] = useState<VisualizationMode>('rsvp');
  const [wpm, setWpm] = useState(DEFAULT_WPM);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [isDark, setIsDark] = useState(true);

  const handleComplete = useCallback(() => {
    // Optional: show completion message or reset
  }, []);

  // Track visual line breaks for Sentence Mode
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

  // Handle Vis Mode change and reset line indices if needed
  const handleVisModeChange = (mode: VisualizationMode) => {
    setVisMode(mode);
    if (mode !== 'sentence') {
      setLineStartIndices(new Set());
    }
  };

  // Keyboard shortcuts
  useKeyboardShortcuts({
    isActive: view === 'reader',
    rsvp,
    setWpm,
    onEscape: () => {
      rsvp.pause();
      setView('input');
    }
  });

  // Apply dark mode to body
  useEffect(() => {
    document.body.classList.toggle('dark', isDark);
  }, [isDark]);

  const handleTextSubmit = (text: string) => {
    const parsed = parseText(text);
    setParsedText(parsed);
    rsvp.reset();
    setView('reader');
  };

  const handleBack = () => {
    rsvp.pause();
    setView('input');
  };

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300 dark:bg-gray-900 bg-white dark:text-gray-100 text-gray-900">
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
      <main className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        {view === 'input' ? (
          <TextInput onTextSubmit={handleTextSubmit} />
        ) : (
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
        )}
      </main>
    </div>
  );
}

export default App;
