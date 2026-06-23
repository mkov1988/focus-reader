import { useEffect, useState } from 'react';

/**
 * Procedural leather bookmark. The grain is an SVG turbulence + lighting filter,
 * but running that filter live on 50+ covers in a scrolling list is expensive, so
 * we rasterize the whole bookmark to a PNG data-URL ONCE per theme (light = brown,
 * dark = cream) and reuse that cached image everywhere. The filter cost is paid a
 * single time; each card just draws an <img>.
 */

/** viewBox of the strap art (64 × 148). */
export const BOOKMARK_VIEW = { w: 64, h: 148 } as const;
/** Where the book's top edge falls in the art (the fold line), in viewBox units.
 *  Above it = the poking-out tip; below it = the drape. */
export const BOOKMARK_EDGE = 40;

const STRAP_PATH = 'M6 24 Q6 8 32 8 Q58 8 58 24 V148 L32 134 L6 148 Z';
const STITCH_PATH = 'M11 26 Q11 12 32 12 Q53 12 53 26 V130 L32 118 L11 130 Z';

const VARIANTS = {
    light: { fill: '#6e4a2b', edge: '#34200f', stitch: '#ecd7a8', grain: 'baseFrequency="0.5 0.55" numOctaves="4"', surface: '1.7', elev: '58' },
    dark: { fill: '#e7ddc9', edge: '#9a8a6c', stitch: '#5d3f23', grain: 'baseFrequency="0.42 0.46" numOctaves="4"', surface: '1.05', elev: '60' },
} as const;

type Mode = keyof typeof VARIANTS;

// Bake at 3x the on-cover size so it stays crisp on retina screens.
const BAKE_W = 120;
const BAKE_H = Math.round((BAKE_W * BOOKMARK_VIEW.h) / BOOKMARK_VIEW.w);

/** A fully self-contained SVG string (inline defs) — needed because an <img>
 *  can't reference defs elsewhere in the document. */
function leatherSvgMarkup(mode: Mode): string {
    const v = VARIANTS[mode];
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${BAKE_W}" height="${BAKE_H}" viewBox="0 0 64 148">` +
        `<defs>` +
        `<filter id="g" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" ${v.grain} seed="11" result="n"/>` +
        `<feDiffuseLighting in="n" surfaceScale="${v.surface}" diffuseConstant="1.05" lighting-color="#ffffff" result="lit"><feDistantLight azimuth="235" elevation="${v.elev}"/></feDiffuseLighting>` +
        `<feComposite in="lit" in2="SourceAlpha" operator="in" result="litc"/>` +
        `<feBlend in="SourceGraphic" in2="litc" mode="multiply" result="o"/>` +
        `<feComposite in="o" in2="SourceAlpha" operator="in"/>` +
        `</filter>` +
        `<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="148" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff" stop-opacity="0.07"/><stop offset="0.30" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.16"/></linearGradient>` +
        `<radialGradient id="loophi" cx="32" cy="33" r="27" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="0.7" stop-color="#ffffff" stop-opacity="0.03"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>` +
        `<linearGradient id="foldshade" x1="0" y1="40" x2="0" y2="72" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1c0e03" stop-opacity="0.42"/><stop offset="1" stop-color="#1c0e03" stop-opacity="0"/></linearGradient>` +
        `<clipPath id="clip"><path d="${STRAP_PATH}"/></clipPath>` +
        `</defs>` +
        `<g clip-path="url(#clip)">` +
        `<rect width="64" height="148" fill="${v.fill}" filter="url(#g)"/>` +
        `<rect width="64" height="148" fill="url(#sheen)"/>` +
        `<rect x="0" y="40" width="64" height="32" fill="url(#foldshade)"/>` +
        `<rect x="0" y="6" width="64" height="54" fill="url(#loophi)"/>` +
        `</g>` +
        `<path d="${STRAP_PATH}" fill="none" stroke="${v.edge}" stroke-opacity="0.55" stroke-width="1.6"/>` +
        `<path d="${STITCH_PATH}" fill="none" stroke="${v.stitch}" stroke-width="1.7" stroke-dasharray="3 3.4" stroke-linecap="round" stroke-linejoin="round"/>` +
        `</svg>`
    );
}

const imgCache: Partial<Record<Mode, string>> = {};
const inflight: Partial<Record<Mode, Promise<string>>> = {};

function bake(mode: Mode): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            try {
                const c = document.createElement('canvas');
                c.width = BAKE_W;
                c.height = BAKE_H;
                const ctx = c.getContext('2d');
                if (!ctx) return reject(new Error('no 2d context'));
                ctx.drawImage(img, 0, 0, BAKE_W, BAKE_H);
                resolve(c.toDataURL('image/png'));
            } catch (e) {
                reject(e);
            }
        };
        img.onerror = () => reject(new Error('svg rasterize failed'));
        img.src = 'data:image/svg+xml,' + encodeURIComponent(leatherSvgMarkup(mode));
    });
}

function getLeatherImage(mode: Mode): Promise<string> {
    if (imgCache[mode]) return Promise.resolve(imgCache[mode]!);
    if (!inflight[mode]) inflight[mode] = bake(mode).then((u) => (imgCache[mode] = u));
    return inflight[mode]!;
}

export function LeatherBookmark({ mode, width }: { mode: Mode; width: number }) {
    // The image is read straight from the module cache during render; the effect
    // only kicks off the one-time bake for an uncached theme and bumps a tick
    // (from an async callback, never synchronously) once it's ready.
    const [, setTick] = useState(0);
    useEffect(() => {
        if (imgCache[mode]) return;
        let alive = true;
        getLeatherImage(mode).then(() => { if (alive) setTick((t) => t + 1); }).catch(() => {});
        return () => { alive = false; };
    }, [mode]);

    const url = imgCache[mode] ?? null;
    const height = (width * BOOKMARK_VIEW.h) / BOOKMARK_VIEW.w;
    if (!url) return <div style={{ width, height }} aria-hidden="true" />;
    return <img src={url} width={width} height={height} alt="" draggable={false} className="block select-none" />;
}
