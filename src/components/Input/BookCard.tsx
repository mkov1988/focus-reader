import { BookCover, type CoverVariant } from './BookCover';
import { usePress } from '../../hooks/usePress';

interface BookCardProps {
    title: string;
    author: string;
    coverUrl?: string;
    variant?: CoverVariant;
    tint?: string;
    onClick: () => void;
}

export function BookCard({ title, author, coverUrl, variant, tint, onClick }: BookCardProps) {
    const { pressed, pressProps } = usePress();

    return (
        <div
            onClick={onClick}
            {...pressProps}
            className={`relative flex flex-col w-36 cursor-pointer group select-none transition-transform duration-200 ease-out ${pressed ? 'z-20' : ''}`}
        >
            <BookCover
                title={title}
                author={author}
                coverUrl={coverUrl}
                variant={variant}
                tint={tint}
                size="md"
                pressed={pressed}
                className="mb-2.5"
            />
            <h3 className={`font-serif text-[14px] font-medium leading-snug line-clamp-1 transition-colors ${pressed ? 'text-coral-accent' : 'text-espresso'}`}>{title}</h3>
            <p className="text-[11px] text-mocha mt-0.5 italic line-clamp-1">{author}</p>
        </div>
    );
}
