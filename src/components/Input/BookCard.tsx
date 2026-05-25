import { useRef } from 'react';
import { BookCover, type CoverVariant } from './BookCover';

interface BookCardProps {
    title: string;
    author: string;
    coverUrl?: string;
    variant?: CoverVariant;
    tint?: string;
    /** Tailwind width class for the card (and thus cover) — default w-36.
     *  Staff picks use a larger value (w-44) for bigger, tappable covers. */
    widthClass?: string;
    /** True while this card's book is being lifted by the open-transition.
     *  We hide the card so the floating cover doesn't visually double. */
    hidden?: boolean;
    /** Fires on touch-down (NOT release). The open-transition then takes over
     *  the gesture at the window level — pointer-up decides commit vs cancel.
     *  Receives the cover's rect so the transition knows where to lift from. */
    onPress: (originRect: DOMRect) => void;
}

export function BookCard({ title, author, coverUrl, variant, tint, widthClass = 'w-36', hidden, onPress }: BookCardProps) {
    const coverRef = useRef<HTMLDivElement>(null);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        // Don't capture pointer — we want move/up to bubble to the window so
        // the transition can track the gesture against the original rect.
        const rect = coverRef.current?.getBoundingClientRect();
        if (rect) onPress(rect);
        e.preventDefault(); // suppress synthetic mouse / context menu on long-press
    };

    return (
        <div
            onPointerDown={handlePointerDown}
            className={`relative flex flex-col ${widthClass} select-none group`}
            style={{
                touchAction: 'manipulation',
                // While the transition owns this book, keep the slot in the
                // layout but hide the visual so the floating cover stands alone.
                visibility: hidden ? 'hidden' : 'visible',
            }}
        >
            <div ref={coverRef} className="mb-2.5">
                <BookCover
                    title={title}
                    author={author}
                    coverUrl={coverUrl}
                    variant={variant}
                    tint={tint}
                    size="md"
                />
            </div>
            <h3 className="font-serif text-[14px] font-medium leading-snug line-clamp-1 text-espresso">{title}</h3>
            <p className="text-[11px] text-mocha mt-0.5 italic line-clamp-1">{author}</p>
        </div>
    );
}
