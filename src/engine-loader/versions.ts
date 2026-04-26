interface EnginesManifest {
    versions: string[];
}

let cache: Promise<string[]> | null = null;

export function availableEngineVersions(): Promise<string[]> {
    if (cache === null) {
        cache = fetch('/engines/manifest.json')
            .then((r) => (r.ok ? (r.json() as Promise<EnginesManifest>) : { versions: [] }))
            .then((m) => m.versions.slice().sort(compareVersionsDescending))
            .catch(() => []);
    }
    return cache;
}

export async function latestEngineVersion(): Promise<string | null> {
    const versions = await availableEngineVersions();
    return versions[0] ?? null;
}

function compareVersionsDescending(a: string, b: string): number {
    const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
    const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const diff = (pb[i] || 0) - (pa[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}
