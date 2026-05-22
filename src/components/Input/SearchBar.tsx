import { useState } from 'react';
import { Search } from 'lucide-react';

interface SearchBarProps {
    onSearch: (query: string) => void;
}

export function SearchBar({ onSearch }: SearchBarProps) {
    const [query, setQuery] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            onSearch(query.trim());
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex gap-3 w-full">
            <div className="flex-1 bg-cream rounded-full px-5 py-3 flex items-center gap-3 ring-1 ring-espresso/10 shadow-[inset_0_1px_3px_rgba(58,42,30,0.08)] focus-within:ring-coral-accent/40 transition-shadow">
                <Search size={18} className="text-mocha/70 shrink-0" />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="What are you in the mood to read?"
                    className="bg-transparent border-none outline-none w-full text-espresso placeholder-mocha/60 font-medium"
                />
            </div>
            <button
                type="submit"
                className="bg-coral-accent text-cream w-12 h-12 rounded-full flex items-center justify-center shadow-[0_3px_8px_rgba(194,103,75,0.35)] hover:scale-95 transition-transform active:scale-90 flex-shrink-0"
            >
                <Search size={20} />
            </button>
        </form>
    );
}
