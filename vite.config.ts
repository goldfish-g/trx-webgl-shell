import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// COOP/COEP headers are required for SharedArrayBuffer, which the TRX
// engine uses for pthreads.
const crossOriginIsolationHeaders = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
    plugins: [react()],
    server: { headers: crossOriginIsolationHeaders },
    preview: { headers: crossOriginIsolationHeaders },
    // Keep engine files outside bundler-land so they stay fetchable at
    // /engines/<version>/… at runtime. Vite serves `public/` verbatim.
    build: { target: 'es2022' },
});
