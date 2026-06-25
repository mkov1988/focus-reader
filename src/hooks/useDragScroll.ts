import { useCallback, useRef } from 'react';

/**
 * Mouse / trackpad horizontal drag-to-scroll for a horizontal carousel, returned
 * as a callback ref to attach to the scroller element.
 *
 * Touch and pen pan the carousel natively, so this engages only for a mouse:
 *   1. Vertical wheel becomes horizontal scroll (unless at an edge, so the page
 *      can still scroll past); native horizontal wheel / trackpad passes through.
 *   2. A sideways mouse drag pans the lane. Cards mark themselves
 *      `scrollsHorizontally`, so the same drag never also lifts a book; a vertical
 *      pull, hold, or tap still lifts/opens. We engage only past a 10px slop so a
 *      near-still click stays a tap, and capture the pointer so moves keep coming
 *      if the cursor leaves the lane (a card stealing capture resets us).
 *
 * Each call owns its own cleanup, so every lane can have its own instance (the
 * old single-ref version on StoreFront could only drive one shelf).
 */
export function useDragScroll() {
    const cleanup = useRef<(() => void) | null>(null);
    return useCallback((node: HTMLDivElement | null) => {
        cleanup.current?.();
        cleanup.current = null;
        if (!node) return;

        const onWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            const atStart = node.scrollLeft <= 0;
            const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 1;
            if ((e.deltaY > 0 && atEnd) || (e.deltaY < 0 && atStart)) return;
            node.scrollLeft += e.deltaY;
            e.preventDefault();
        };

        const PAN_SLOP = 10; // matches the card's mouse pickup threshold
        let panId: number | null = null;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let panning = false;

        const onPointerDown = (e: PointerEvent) => {
            if (e.pointerType !== 'mouse') return; // touch/pen pan natively
            if ((e.target as HTMLElement).closest('button')) return; // let on-cover controls click
            panId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = node.scrollLeft;
            panning = false;
            try { node.setPointerCapture(panId); } catch { /* not capturable */ }
        };
        const onPointerMove = (e: PointerEvent) => {
            if (panId === null || e.pointerId !== panId) return;
            const dx = e.clientX - startX;
            if (!panning) {
                if (Math.abs(dx) <= PAN_SLOP || Math.abs(dx) <= Math.abs(e.clientY - startY)) return;
                panning = true;
                startX = e.clientX;
                startLeft = node.scrollLeft;
                node.style.cursor = 'grabbing';
            }
            node.scrollLeft = startLeft - (e.clientX - startX);
            e.preventDefault();
        };
        const endPan = (e: PointerEvent) => {
            if (panId === null || e.pointerId !== panId) return;
            const id = panId;
            panId = null;
            panning = false;
            node.style.cursor = '';
            try { node.releasePointerCapture(id); } catch { /* already released */ }
        };

        node.addEventListener('wheel', onWheel, { passive: false });
        node.addEventListener('pointerdown', onPointerDown);
        node.addEventListener('pointermove', onPointerMove);
        node.addEventListener('pointerup', endPan);
        node.addEventListener('pointercancel', endPan);
        node.addEventListener('lostpointercapture', endPan);
        cleanup.current = () => {
            node.removeEventListener('wheel', onWheel);
            node.removeEventListener('pointerdown', onPointerDown);
            node.removeEventListener('pointermove', onPointerMove);
            node.removeEventListener('pointerup', endPan);
            node.removeEventListener('pointercancel', endPan);
            node.removeEventListener('lostpointercapture', endPan);
        };
    }, []);
}
