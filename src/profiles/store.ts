import { getDb } from '../db';
import type { ProfileRecord, ShippedManifestEntry } from '../types';

export async function listProfiles(): Promise<ProfileRecord[]> {
    const db = await getDb();
    const all = await db.getAll('profiles');
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getProfile(id: string): Promise<ProfileRecord | undefined> {
    const db = await getDb();
    return db.get('profiles', id);
}

export async function putProfile(profile: ProfileRecord): Promise<void> {
    const db = await getDb();
    await db.put('profiles', profile);
}

export async function deleteProfile(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('profiles', id);
}

export async function markProfilePlayed(id: string): Promise<void> {
    const db = await getDb();
    const existing = await db.get('profiles', id);
    if (!existing) return;
    await db.put('profiles', { ...existing, lastPlayedAt: new Date().toISOString() });
}

export async function countProfilesReferencingGamedata(
    gamedataId: string,
): Promise<number> {
    const all = await listProfiles();
    return all.filter((p) => p.gamedataId === gamedataId).length;
}

const TOMBSTONE_KEY = 'trx-shell:deleted-default-profiles';

function readTombstones(): Set<string> {
    try {
        const raw = localStorage.getItem(TOMBSTONE_KEY);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw);
        return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
        return new Set();
    }
}

function writeTombstones(set: Set<string>): void {
    try {
        localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(Array.from(set)));
    } catch {
        // localStorage may be unavailable (private mode); tolerate silently.
    }
}

export function tombstoneProfile(id: string): void {
    if (!id.startsWith('default:')) return;
    const set = readTombstones();
    set.add(id);
    writeTombstones(set);
}

/**
 * Create one default profile per shipped-manifest entry, pinned to the
 * supplied engine version. Idempotent: skips any default profile that
 * already exists, or was explicitly deleted by the user (tombstoned).
 * Returns the IDs of freshly-created profiles.
 */
export async function seedDefaultProfiles(
    manifest: ShippedManifestEntry[],
    engineVersion: string,
): Promise<string[]> {
    const db = await getDb();
    const tx = db.transaction('profiles', 'readwrite');
    const store = tx.objectStore('profiles');
    const existingIds = new Set(await store.getAllKeys());
    const tombstones = readTombstones();
    const created: string[] = [];
    const now = new Date().toISOString();

    for (const entry of manifest) {
        const id = `default:${entry.id}`;
        if (existingIds.has(id) || tombstones.has(id)) continue;
        const profile: ProfileRecord = {
            id,
            name: entry.name,
            gamedataId: entry.id,
            mod: entry.mod,
            engine: entry.engine,
            engineVersion,
            description: entry.description ?? '',
            isDefault: true,
            createdAt: now,
            lastPlayedAt: null,
        };
        await store.put(profile);
        created.push(id);
    }
    await tx.done;
    return created;
}
