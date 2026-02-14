import type { FC } from 'react';
import { Eye, AlignJustify, AlignLeft, Layers } from 'lucide-react';

export type VisualizationMode = 'rsvp' | 'paragraph' | 'sentence' | 'hybrid';

interface VisualizationSelectorProps {
    mode: VisualizationMode;
    onChange: (mode: VisualizationMode) => void;
}

export const VisualizationSelector: FC<VisualizationSelectorProps> = ({ mode, onChange }) => {
    const options: { id: VisualizationMode; icon: FC<any>; label: string }[] = [
        { id: 'rsvp', icon: Eye, label: 'Focus' },
        { id: 'sentence', icon: AlignLeft, label: 'Sentence' },
        { id: 'paragraph', icon: AlignJustify, label: 'Paragraph' },
        { id: 'hybrid', icon: Layers, label: 'Hybrid' },
    ];

    return (
        <div className="flex items-center justify-center space-x-2 bg-gray-900/50 p-1 rounded-full backdrop-blur-sm">
            {options.map((option) => (
                <button
                    key={option.id}
                    onClick={() => onChange(option.id)}
                    className={`
                        p-2 rounded-full transition-all duration-200
                        ${mode === option.id
                            ? 'bg-red-500 text-white shadow-lg scale-105'
                            : 'text-gray-400 hover:text-white hover:bg-white/10'
                        }
                    `}
                    title={option.label}
                >
                    <option.icon size={20} />
                </button>
            ))}
        </div>
    );
};
