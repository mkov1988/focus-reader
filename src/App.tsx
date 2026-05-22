import { useCallback, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ReaderView } from './components/Reader/ReaderView';
import { type VisualizationMode } from './components/Reader/VisualizationSelector';
import { StoreFront } from './components/Input/StoreFront';
import { TextInput } from './components/Input/TextInput';
import { useStore } from './store/useStore';
import { useRSVP } from './hooks/useRSVP';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { parseText, type ParsedText } from './utils/textProcessing';
import './index.css';

// Configuration Constants
const DEFAULT_WPM = 300;
const DEFAULT_FONT_SIZE = 56;
const SENTENCE_START_MULTIPLIER = 1.8;
const SENTENCE_START_OFFSET = 500;
const LINE_START_MULTIPLIER = 1.5;

function App() {
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);

  const [parsedText, setParsedText] = useState<ParsedText | null>(null);
  const [bookTitle, setBookTitle] = useState<string>('Focus Reader');
  const [visMode, setVisMode] = useState<VisualizationMode>('rsvp');
  const [wpm, setWpm] = useState(DEFAULT_WPM);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);

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
    rsvp.reset();
    setViewMode('READING');
  };

  // Open a book streamed from the library (Gutenberg) directly into the reader.
  const handleOpenText = (text: string, title: string) => {
    const parsed = parseText(text);
    setParsedText(parsed);
    setBookTitle(title);
    rsvp.reset();
    setViewMode('READING');
  };

  const handlePlay = () => {
    setViewMode('TEXT_INPUT');
  };

  const handleBack = () => {
    rsvp.pause();
    setViewMode('INPUT');
  };

  return (
    <div className="app-root">
      {/* ═══ STORE FRONT VIEW ═══ */}
      {viewMode === 'INPUT' && (
        <StoreFront onOpenText={handleOpenText} onManualInput={handlePlay} />
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
    </div>
  );
}

export default App;
