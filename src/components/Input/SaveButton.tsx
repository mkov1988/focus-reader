import { Bookmark } from 'lucide-react';
import { useStore } from '../../store/useStore';
import type { BookMetadata } from '../../services/types';
import { haptics } from '../../utils/haptics';
import { LeatherBookmark, BOOKMARK_EDGE, BOOKMARK_VIEW } from './LeatherBookmark';

interface SaveButtonProps {
    book: BookMetadata;
    /** 'ribbon' is the flat stitched-leather bookmark on a book cover: its top
     *  pokes up out of the book, and saving reveals the forked tail draping down.
     *  'plain' is a small circular bookmark button for list rows, where a ribbon
     *  would be too small to tap. */
    tone?: 'ribbon' | 'plain';
    className?: string;
}

export function SaveButton({ book, tone = 'ribbon', className = '' }: SaveButtonProps) {
    const saved = useStore((s) => Boolean(s.savedById[book.id]));
    const toggleSaved = useStore((s) => s.toggleSaved);
    const showToast = useStore((s) => s.showToast);
    const mode = useStore((s) => s.mode);

    const onClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        haptics.tick();
        // `saved` is the state *before* this toggle, so it tells us which way we
        // are about to flip.
        showToast(saved ? 'Removed from shelf' : 'Saved for later');
        toggleSaved({
            bookId: book.id,
            title: book.title,
            author: book.author,
            coverUrl: book.coverUrl,
            textUrl: book.textUrl,
        });
    };

    // Shared props. The pointer-down stop keeps a tap from starting the
    // press-to-open gesture or scrolling the shelf — only the save toggles.
    const common = {
        type: 'button' as const,
        'aria-label': saved ? `Remove ${book.title} from saved` : `Save ${book.title} for later`,
        'aria-pressed': saved,
        onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
        onClick,
        style: { touchAction: 'manipulation' as const },
    };

    if (tone === 'plain') {
        return (
            <button
                {...common}
                className={`flex items-center justify-center w-9 h-9 rounded-full ring-1 select-none transition-[transform,background-color,color] duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-accent ${saved ? 'bg-coral-accent text-[rgb(var(--coral-accent-text))] ring-coral-accent/50' : 'bg-cream text-mocha ring-espresso/10'} ${className}`}
            >
                <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} strokeWidth={2} />
            </button>
        );
    }

    // Ribbon: the procedural leather bookmark. Its top pokes up out of the book
    // when unsaved; saving reveals the drape downward over the cover (no flip),
    // the rounded loop wrapping the top edge. Brown on light themes, cream on
    // dark. A clip window animates the reveal; the leather art is one SVG.
    const W = 36;
    const scale = W / BOOKMARK_VIEW.w;
    const edge = BOOKMARK_EDGE * scale;          // tip height poking above the cover edge
    const full = (BOOKMARK_VIEW.h * W) / BOOKMARK_VIEW.w; // whole bookmark height
    return (
        <button
            {...common}
            className={`absolute left-[16%] z-10 select-none rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-accent ${className}`}
            style={{ top: -edge, width: W, height: saved ? full : edge + 14, touchAction: 'manipulation' }}
        >
            {/* soft shadow the drape casts on the cover (fades in when saved) */}
            <span
                aria-hidden="true"
                className="absolute pointer-events-none"
                style={{
                    left: 2, top: edge + 2, width: W - 4, height: full - edge,
                    background: 'radial-gradient(52% 56% at 50% 55%, rgba(0,0,0,0.34), rgba(0,0,0,0) 72%)',
                    filter: 'blur(3px)',
                    opacity: saved ? 1 : 0,
                    transition: 'opacity .4s ease',
                }}
            />
            {/* clip window: just the poking-out tip when unsaved, full drape when saved */}
            <span
                className="absolute left-0 top-0 overflow-hidden"
                style={{ width: W, height: saved ? full : edge, transition: 'height 460ms cubic-bezier(.33,1.06,.4,1)' }}
            >
                <LeatherBookmark mode={mode === 'dark' ? 'dark' : 'light'} width={W} />
            </span>
        </button>
    );
}
