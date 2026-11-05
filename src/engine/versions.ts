// The engine builds the server offers, listed in public/engines/manifest.json.

const MANIFEST_URL = '/engines/manifest.json';

let versions: Promise<string[]> | null = null;

function compareDescending(a: string, b: string): number {
    const pa = a.split('.').map((part) => parseInt(part, 10) || 0);
    const pb = b.split('.').map((part) => parseInt(part, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const difference = (pb[i] ?? 0) - (pa[i] ?? 0);
        if (difference !== 0) return difference;
    }
    return 0;
}

async function fetchVersions(): Promise<string[]> {
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
            if (!response.ok) throw new Error(`the server answered ${response.status}`);
            const body = (await response.json()) as { versions?: unknown };
            const list = Array.isArray(body.versions) ? body.versions : [];
            return list.filter((v): v is string => typeof v === 'string').sort(compareDescending);
        } catch (error) {
            if (attempt >= 4) throw error;
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
    }
}

/** The engine versions the server offers, newest first. */
export function loadEngineVersions(): Promise<string[]> {
    versions ??= fetchVersions().catch((error: unknown) => {
        versions = null;
        throw error;
    });
    return versions;
}
