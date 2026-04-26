/**
 * Resolve on the first user interaction with the page. Required by
 * modern browsers' autoplay policy before any audio output.
 *
 * `onOpen` fires when the gate opens (so the frontend can render a
 * "click to continue" prompt); `onClose` fires when dismissed.
 */
export function makeStartGateAdapter(
    target: HTMLElement,
    hooks?: { onOpen?: () => void; onClose?: () => void },
): () => Promise<void> {
    return () =>
        new Promise<void>((resolve) => {
            hooks?.onOpen?.();
            const handler = () => {
                target.removeEventListener('pointerdown', handler, true);
                target.removeEventListener('keydown', handler, true);
                window.removeEventListener('pointerdown', handler, true);
                window.removeEventListener('keydown', handler, true);
                hooks?.onClose?.();
                resolve();
            };
            target.addEventListener('pointerdown', handler, true);
            target.addEventListener('keydown', handler, true);
            // Fallback: user may click outside the canvas.
            window.addEventListener('pointerdown', handler, true);
            window.addEventListener('keydown', handler, true);
        });
}
