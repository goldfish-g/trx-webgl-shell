import type { EngineFs, TrxAdapters } from '../engine-loader/trx-types';

interface PersistenceBuilder {
    mountPersistence: TrxAdapters['mountPersistence'];
    syncPersistenceIn: TrxAdapters['syncPersistenceIn'];
    syncPersistenceOut: TrxAdapters['syncPersistenceOut'];
    flushPersistence: TrxAdapters['flushPersistence'];
}

const DEBOUNCE_MS = 100;

export function makePersistenceAdapter(
    getFs: () => EngineFs,
): PersistenceBuilder {
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleFlush(): void {
        if (flushTimer !== null) return;
        flushTimer = setTimeout(() => {
            flushTimer = null;
            const fs = getFs();
            fs.syncfs(false, (err) => {
                if (err) console.error('[adapter] syncfs flush failed:', err);
            });
        }, DEBOUNCE_MS);
    }

    return {
        mountPersistence: (mountPath) =>
            new Promise<void>((resolve) => {
                const fs = getFs();
                const parts = mountPath.split('/').filter((p) => p.length > 0);
                let cur = '';
                for (const p of parts) {
                    cur += '/' + p;
                    try {
                        fs.mkdir(cur);
                    } catch (_) {}
                }
                try {
                    fs.mount(fs.filesystems.IDBFS, {}, mountPath);
                } catch (err) {
                    console.warn('[adapter] mount IDBFS failed:', err);
                }
                try {
                    fs.mkdir(mountPath + '/saves');
                } catch (_) {}
                try {
                    fs.mkdir(mountPath + '/cfg');
                } catch (_) {}
                resolve();
            }),

        syncPersistenceIn: () =>
            new Promise<void>((resolve, reject) => {
                const fs = getFs();
                fs.syncfs(true, (err) =>
                    err ? reject(err) : resolve(),
                );
            }),

        syncPersistenceOut: (src, dst) => {
            try {
                const fs = getFs();
                const lastSlash = dst.lastIndexOf('/');
                if (lastSlash > 0) {
                    try {
                        fs.mkdirTree(dst.slice(0, lastSlash));
                    } catch (_) {}
                }
                fs.writeFile(dst, fs.readFile(src));
            } catch (err) {
                console.error('[adapter] persist write failed:', err);
            }
            scheduleFlush();
        },

        flushPersistence: () => scheduleFlush(),
    };
}
