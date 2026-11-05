// The game data the server offers, listed in public/gamedata/manifest.json.

import type { EngineNumber } from '../games/catalog';
import type { ServerGameData } from './types';

const CATALOG_URL = '/gamedata/manifest.json';

let catalog: Promise<ServerGameData[]> | null = null;

function isEntry(value: unknown): value is ServerGameData {
    const entry = value as Partial<ServerGameData>;
    return (
        typeof entry.id === 'string' &&
        typeof entry.mod === 'string' &&
        typeof entry.name === 'string' &&
        typeof entry.url === 'string' &&
        [1, 2, 3, 4].includes(entry.engine as EngineNumber)
    );
}

async function fetchCatalog(): Promise<ServerGameData[]> {
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await fetch(CATALOG_URL, { cache: 'no-store' });
            if (response.status === 404) return [];
            if (!response.ok) throw new Error(`the server answered ${response.status}`);
            const body: unknown = await response.json();
            const entries = Array.isArray(body) ? body : (body as { entries?: unknown }).entries;
            return Array.isArray(entries)
                ? entries.filter(isEntry).map((entry) => ({ ...entry, sizeBytes: Number(entry.sizeBytes) || 0 }))
                : [];
        } catch (error) {
            if (attempt >= 4) throw error;
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
    }
}

/** The server's catalog, fetched once per page. */
export function loadServerCatalog(): Promise<ServerGameData[]> {
    catalog ??= fetchCatalog().catch((error: unknown) => {
        catalog = null;
        throw error;
    });
    return catalog;
}
