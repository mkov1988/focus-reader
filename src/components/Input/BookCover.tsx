import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Leaf } from 'lucide-react';

export type CoverVariant = 'framed' | 'label' | 'solid';

// Literal class strings so Tailwind keeps them through purge
const SOLID_TINTS = ['bg-mustard', 'bg-coral-accent', 'bg-sage', 'bg-espresso'];

function hash(s: string) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
}

function Stitch({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
    return (
        <div
            className={`pointer-events-none absolute inset-[6px] rounded-l-[2px] rounded-r-lg border border-dashed ${tone === 'light' ? 'border-cream/40' : 'border-espresso/20'}`}
        />
    );
}

function Spine({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
    return (
        <div
            className={`pointer-events-none absolute left-[6px] top-3 bottom-3 w-px ${tone === 'light' ? 'bg-cream/25' : 'bg-espresso/15'}`}
        />
    );
}

interface BookCoverProps {
    title: string;
    author: string;
    coverUrl?: string;
    variant?: CoverVariant;
    tint?: string;
    size?: 'sm' | 'md';
    /** Optional custom content for the page revealed under the cover. */
    pageContent?: ReactNode;
    /** Forward a ref to the rotating cover-face element so an external
     *  animator can drive `transform` directly (used by BookOpenTransition). */
    coverFaceRef?: React.Ref<HTMLDivElement>;
    /** Override the CSS transition on the cover face — `'none'` lets an
     *  external animator take over without fighting the built-in tween. */
    coverFaceTransition?: string;
    className?: string;
}

export function BookCover({ title, author, coverUrl, variant, tint, size = 'md', pageContent, coverFaceRef, coverFaceTransition, className = '' }: BookCoverProps) {
    const seed = hash(title + author);
    const v: CoverVariant = variant ?? (['framed', 'label', 'solid'] as const)[seed % 3];
    const solidTint = tint ?? SOLID_TINTS[seed % SOLID_TINTS.length];
    const sm = size === 'sm';

    // Remote covers (Project Gutenberg) are hotlinked and gutenberg.org
    // frequently drops the connection, leaving a cover that never loads. When
    // one fails — or just hangs past a short deadline — we fall back to the
    // generated cover so the card never shows a blank page underlay. Tracking
    // the failed URL (rather than a bool) auto-resets if the prop changes.
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const showImage = !!coverUrl && failedUrl !== coverUrl;

    useEffect(() => {
        if (!showImage) return;
        // A hanging hotlink would otherwise sit blank until the browser's ~20s
        // connection timeout. Give it a few seconds, then if it still hasn't
        // decoded a real image, fall back to the generated cover.
        const t = window.setTimeout(() => {
            const img = imgRef.current;
            if (!img || !(img.complete && img.naturalWidth > 0)) setFailedUrl(coverUrl!);
        }, 6000);
        return () => window.clearTimeout(t);
    }, [showImage, coverUrl]);

    const pad = sm ? 'px-2.5 py-3.5' : 'px-3.5 py-5';
    const titleSize = sm ? 'text-[11px]' : 'text-[15px]';
    const eyebrowSize = sm ? 'text-[7px]' : 'text-[8px]';
    const authorSize = sm ? 'text-[8px]' : 'text-[10px]';
    const ruleW = sm ? 'w-4' : 'w-6';
    const orn = sm ? 11 : 14;

    // Build the cover face (background + content) per variant.
    let coverBg = 'bg-cream';
    let inner: ReactNode;

    if (showImage) {
        coverBg = '';
        inner = (
            <>
                <img
                    ref={imgRef}
                    src={coverUrl}
                    alt={title}
                    draggable={false}
                    decoding="async"
                    onError={() => setFailedUrl(coverUrl!)}
                    className="w-full h-full object-cover select-none [-webkit-touch-callout:none]"
                />
                <Stitch tone="light" />
                <Spine tone="light" />
            </>
        );
    } else if (v === 'solid') {
        coverBg = solidTint;
        inner = (
            <>
                <div className={`absolute inset-0 flex flex-col items-center justify-center text-center text-cream ${pad}`}>
                    <Leaf size={orn} className="opacity-70 mb-2 shrink-0" />
                    <h3 className={`font-serif font-semibold leading-tight line-clamp-4 ${titleSize}`}>{title}</h3>
                    <span className={`my-2 h-px ${ruleW} bg-cream/40`} />
                    <p className={`font-serif italic opacity-85 line-clamp-2 ${authorSize}`}>{author}</p>
                </div>
                <Stitch tone="light" />
                <Spine tone="light" />
            </>
        );
    } else if (v === 'label') {
        coverBg = 'bg-[#FCFAF4]';
        inner = (
            <>
                <div className={`absolute inset-0 flex flex-col items-center justify-between text-center ${pad}`}>
                    <p className={`font-serif italic text-mocha line-clamp-1 ${authorSize}`}>{author}</p>
                    <h3 className={`font-serif font-semibold text-espresso leading-tight line-clamp-4 ${titleSize}`}>{title}</h3>
                    <p className={`font-semibold tracking-[0.18em] text-coral-accent uppercase ${eyebrowSize}`}>· Focus Reader ·</p>
                </div>
                <Stitch />
                <Spine />
            </>
        );
    } else {
        coverBg = 'bg-cream';
        inner = (
            <>
                <div className="pointer-events-none absolute inset-[7px] border border-espresso/20 rounded-l-[2px] rounded-r-lg" />
                <div className={`absolute inset-0 flex flex-col items-center justify-center text-center ${pad}`}>
                    <p className={`font-semibold tracking-[0.25em] text-mocha uppercase mb-2 ${eyebrowSize}`}>Vol. I</p>
                    <h3 className={`font-serif font-semibold text-espresso leading-tight line-clamp-4 ${titleSize}`}>{title}</h3>
                    <span className={`my-2 h-px ${ruleW} bg-espresso/30`} />
                    <p className={`font-serif italic text-mocha line-clamp-2 ${authorSize}`}>{author}</p>
                </div>
                <Spine />
            </>
        );
    }

    const transitionMs = 240;

    return (
        <div className={`relative w-full aspect-[2/3] ${className}`} style={{ perspective: '900px' }}>
            {/* Page revealed when the cover peels back */}
            <div className="absolute inset-0 rounded-l-[3px] rounded-r-xl bg-[#FBF7EE] overflow-hidden ring-1 ring-espresso/10">
                {pageContent ?? (
                    <div
                        className="absolute inset-y-[14%] left-[40%] right-[10%] opacity-50"
                        style={{ backgroundImage: 'repeating-linear-gradient(to bottom, rgba(107,85,68,0.30) 0 1px, transparent 1px 6px)' }}
                    />
                )}
                <span className="absolute right-0 inset-y-0 w-[3px] bg-espresso/10" />
                {/* gutter shadow near the spine */}
                <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-espresso/15 to-transparent" />
            </div>

            {/* The cover face (hinged at the spine) */}
            <div
                ref={coverFaceRef}
                className={`absolute inset-0 rounded-l-[3px] rounded-r-xl overflow-hidden ring-1 ring-espresso/10 ${coverBg} shadow-[0_6px_14px_rgba(58,42,30,0.18)]`}
                style={{
                    transformOrigin: 'left center',
                    transform: 'rotateY(0deg)',
                    transition: coverFaceTransition ?? `transform ${transitionMs}ms cubic-bezier(.2,.7,.25,1), box-shadow ${transitionMs}ms ease`,
                    willChange: 'transform',
                    backfaceVisibility: 'hidden',
                }}
            >
                {inner}
            </div>
        </div>
    );
}
