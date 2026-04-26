import type { ShippedManifestEntry } from '../types';

const MANIFEST_URL = '/gamedata-shipped/manifest.json';

let cache: Promise<ShippedManifestEntry[]> | null = null;

export function loadShippedManifest(): Promise<ShippedManifestEntry[]> {
    if (cache === null) {
        cache = fetch(MANIFEST_URL)
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => []);
    }
    return cache;
}
