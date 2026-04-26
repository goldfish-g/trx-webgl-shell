import { forwardRef, useEffect } from 'react';

interface Props {
    onResize?: () => void;
}

export const GameCanvas = forwardRef<HTMLCanvasElement, Props>(
    function GameCanvas({ onResize }, ref) {
        useEffect(() => {
            if (!onResize) return;
            const handle = () => onResize();
            window.addEventListener('resize', handle);
            window.visualViewport?.addEventListener('resize', handle);
            return () => {
                window.removeEventListener('resize', handle);
                window.visualViewport?.removeEventListener('resize', handle);
            };
        }, [onResize]);

        return (
            <canvas
                ref={ref}
                id="canvas"
                className="game-canvas"
                tabIndex={-1}
                onContextMenu={(e) => e.preventDefault()}
            />
        );
    },
);
