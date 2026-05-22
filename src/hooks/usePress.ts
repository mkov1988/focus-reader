import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Touch-first "press" state for mobile.
 *
 * The model: press-down reveals a subtle interaction (the `pressed` flag), and
 * the *release* is the real action (wire that to `onClick`, which the browser
 * only fires on a genuine tap-off — not during a scroll).
 *
 * If the finger moves past `moveThreshold`, we treat it as a scroll/drag and
 * drop the pressed state immediately, so the preview never interferes with
 * scrolling. Pointer events unify touch + mouse, so this also works on desktop.
 */
export function usePress(moveThreshold = 10) {
    const [pressed, setPressed] = useState(false);
    const origin = useRef<{ x: number; y: number } | null>(null);

    const onPointerDown = (e: ReactPointerEvent) => {
        origin.current = { x: e.clientX, y: e.clientY };
        setPressed(true);
    };

    const onPointerMove = (e: ReactPointerEvent) => {
        if (!origin.current) return;
        const movedX = Math.abs(e.clientX - origin.current.x);
        const movedY = Math.abs(e.clientY - origin.current.y);
        if (movedX > moveThreshold || movedY > moveThreshold) {
            origin.current = null;
            setPressed(false);
        }
    };

    const end = () => {
        origin.current = null;
        setPressed(false);
    };

    return {
        pressed,
        pressProps: {
            onPointerDown,
            onPointerMove,
            onPointerUp: end,
            onPointerCancel: end,
            onPointerLeave: end,
        },
    };
}
