import { ArrowLeft } from 'lucide-react';

interface InnerPageHeaderProps {
    title: string;
    /** Small uppercase kicker above the title (search results show
     *  "Reading room results"; most pages omit it). */
    eyebrow?: string;
    /** Accessible label for the back control. */
    backLabel: string;
    onBack: () => void;
    /** Reader-only: collapse the whole bar away (height → 0, fade out) while
     *  RSVP is playing, so the word stream owns the screen. */
    collapsed?: boolean;
}

/**
 * The one header every non-home screen wears — the reader and the storefront's
 * inner pages (Library / Shelves / Notebook / search results).
 * A reader-style `[← back][title]` bar in the sticky top-bar slot. The Today
 * home page deliberately does NOT use this: it keeps `[search][menu]` and has
 * no back control or title. (See feedback-navigation-model.)
 *
 * Colours come from the theme-aware Tailwind tokens (warm-beige = --bg,
 * espresso = --text, cream = --surface, …), the same vars the reader chrome
 * used before, so the bar recolours with theme/mode in every context.
 *
 * Collapse uses the grid `1fr`→`0fr` row trick: the bar animates to its exact
 * content height with no magic numbers, then to zero — reclaiming the space for
 * `reading-main` while RSVP plays.
 */
export function InnerPageHeader({ title, eyebrow, backLabel, onBack, collapsed = false }: InnerPageHeaderProps) {
    return (
        <header
            className={`sticky top-0 z-30 grid bg-warm-beige transition-[grid-template-rows,opacity] duration-300 ease-out ${
                collapsed ? 'grid-rows-[0fr] opacity-0 pointer-events-none' : 'grid-rows-[1fr] opacity-100'
            }`}
        >
            <div className="min-h-0 overflow-hidden border-b border-espresso/[0.08]">
                <div
                    className="max-w-md mx-auto px-5 py-3.5 flex items-center gap-3 min-h-[68px]"
                    style={{ paddingTop: 'max(0.875rem, env(safe-area-inset-top))' }}
                >
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label={backLabel}
                        className="w-10 h-10 rounded-full bg-cream ring-1 ring-espresso/10 flex items-center justify-center text-mocha hover:text-coral-accent select-none active:scale-90 transition-[transform,color] duration-150 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-accent"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="min-w-0 flex-1">
                        {eyebrow && (
                            <p className="text-[10px] font-semibold tracking-[0.18em] text-mocha/70 uppercase leading-none mb-0.5">{eyebrow}</p>
                        )}
                        <h1 className="font-serif text-[18px] font-semibold text-espresso leading-tight truncate">{title}</h1>
                    </div>
                </div>
            </div>
        </header>
    );
}
