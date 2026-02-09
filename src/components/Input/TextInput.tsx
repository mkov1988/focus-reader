import { useState } from 'react';
import { Upload, FileText, BookOpen } from 'lucide-react';

interface TextInputProps {
    onTextSubmit: (text: string) => void;
}

/**
 * TextInput Component
 * 
 * Handles text ingestion from:
 * - Direct paste
 * - File upload (PDF, EPUB, TXT)
 * 
 * Provides a welcoming empty state that encourages interaction.
 */
export function TextInput({ onTextSubmit }: TextInputProps) {
    const [text, setText] = useState('');
    const [isDragging, setIsDragging] = useState(false);

    const handleSubmit = () => {
        if (text.trim()) {
            onTextSubmit(text.trim());
        }
    };

    const handleFileSelect = async (file: File) => {
        const extension = file.name.split('.').pop()?.toLowerCase();

        if (extension === 'txt') {
            const content = await file.text();
            setText(content);
        } else if (extension === 'pdf') {
            // PDF parsing will be handled separately
            setText(`[PDF support coming soon: ${file.name}]`);
        } else if (extension === 'epub') {
            // EPUB parsing will be handled separately
            setText(`[EPUB support coming soon: ${file.name}]`);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    return (
        <div className="w-full max-w-3xl mx-auto space-y-6 animate-fade-in">
            {/* Header */}
            <div className="text-center space-y-2">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-focal to-orange-500 bg-clip-text text-transparent">
                    Focus Reader
                </h1>
                <p className="text-gray-500 dark:text-gray-400">
                    Speed read anything. Paste text, upload a file, or drag and drop.
                </p>
            </div>

            {/* Drop Zone / Text Area */}
            <div
                className={`
          relative border-2 border-dashed rounded-2xl transition-all duration-200
          ${isDragging
                        ? 'border-focal bg-red-50 dark:bg-red-900/10'
                        : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                    }
        `}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste your text here, or drop a file..."
                    className="w-full h-64 p-6 bg-transparent resize-none focus:outline-none text-lg"
                />

                {/* Drag overlay */}
                {isDragging && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-50/90 dark:bg-red-900/30 rounded-2xl">
                        <div className="text-center">
                            <Upload className="w-12 h-12 mx-auto text-focal mb-2" />
                            <p className="text-focal font-medium">Drop to upload</p>
                        </div>
                    </div>
                )}
            </div>

            {/* File type hints */}
            <div className="flex justify-center gap-6 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span>.txt</span>
                </div>
                <div className="flex items-center gap-2 opacity-50">
                    <FileText className="w-4 h-4" />
                    <span>.pdf (soon)</span>
                </div>
                <div className="flex items-center gap-2 opacity-50">
                    <BookOpen className="w-4 h-4" />
                    <span>.epub (soon)</span>
                </div>
            </div>

            {/* Actions */}
            <div className="flex justify-center gap-4">
                <label className="px-6 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors font-medium">
                    <input
                        type="file"
                        accept=".txt,.pdf,.epub"
                        onChange={handleFileInput}
                        className="hidden"
                    />
                    Choose File
                </label>

                <button
                    onClick={handleSubmit}
                    disabled={!text.trim()}
                    className={`
            px-8 py-3 rounded-xl font-medium transition-all duration-200
            ${text.trim()
                            ? 'bg-focal text-white hover:bg-red-600 shadow-lg shadow-red-500/25'
                            : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                        }
          `}
                >
                    Start Reading
                </button>
            </div>
        </div>
    );
}
