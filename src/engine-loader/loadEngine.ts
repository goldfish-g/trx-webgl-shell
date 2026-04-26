import type { CreateTrx } from './trx-types';

interface LoadedEngine {
    createTRX: CreateTrx;
    baseUrl: string;
}

const cache = new Map<string, Promise<LoadedEngine>>();

export function loadEngine(version: string): Promise<LoadedEngine> {
    const existing = cache.get(version);
    if (existing) return existing;

    const baseUrl = `/engines/${version}`;
    const promise = import(/* @vite-ignore */ `${baseUrl}/trx-adapter.js`).then(
        (mod) => {
            if (typeof mod.createTRX !== 'function') {
                throw new Error(
                    `engine ${version}: trx-adapter.js did not export createTRX`,
                );
            }
            return { createTRX: mod.createTRX as CreateTrx, baseUrl };
        },
    );
    cache.set(version, promise);
    return promise;
}

export function engineAssetUrl(version: string, filename: string): string {
    return `/engines/${version}/${filename}`;
}
