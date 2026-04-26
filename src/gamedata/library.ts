import { getDb } from '../db';
import type {
    EngineNumber,
    GamedataMode,
    GamedataRecord,
    GamedataStatus,
    ShippedManifestEntry,
} from '../types';
import { extractArchive } from './extract';
import { buildVfsLayout } from './layout';

export async function listGamedata(): Promise<GamedataRecord[]> {
    const db = await getDb();
    const all = await db.getAll('gamedata');
    return all.sort((a, b) => a.importedAt.localeCompare(b.importedAt));
}

export async function getGamedata(id: string): Promise<GamedataRecord | undefined> {
    const db = await getDb();
    return db.get('gamedata', id);
}

export async function putGamedata(record: GamedataRecord): Promise<void> {
    const db = await getDb();
    await db.put('gamedata', record);
}

export async function deleteGamedata(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('gamedata', id);
}

export async function setGamedataStatus(
    id: string,
    status: GamedataStatus,
    detail?: string,
): Promise<GamedataRecord | undefined> {
    const existing = await getGamedata(id);
    if (!existing) return undefined;
    const updated: GamedataRecord = { ...existing, status, statusDetail: detail };
    await putGamedata(updated);
    return updated;
}

export interface SeedResult {
    created: string[];
}

/**
 * Seed gamedata records from the shipped manifest. Idempotent: skips
 * entries that already exist.
 */
export async function seedShippedGamedata(
    manifest: ShippedManifestEntry[],
): Promise<SeedResult> {
    const db = await getDb();
    const tx = db.transaction('gamedata', 'readwrite');
    const store = tx.objectStore('gamedata');
    const existingIds = new Set(await store.getAllKeys());
    const created: string[] = [];

    for (const entry of manifest) {
        if (existingIds.has(entry.id)) continue;
        const record: GamedataRecord = {
            id: entry.id,
            kind: 'shipped',
            mod: entry.mod,
            engine: entry.engine,
            name: entry.name,
            source: { url: entry.url },
            status: 'needs-download',
            files: {},
            sizeBytes: entry.sizeBytes,
            importedAt: new Date().toISOString(),
            lastPlayedAt: null,
        };
        await store.put(record);
        created.push(entry.id);
    }
    await tx.done;
    return { created };
}

export interface DownloadHandle {
    abort: () => void;
    promise: Promise<void>;
}

export interface ProgressEvent {
    fraction: number;
    bytes?: number;
    totalBytes?: number;
    phase: 'downloading' | 'extracting';
}

export type ProgressCallback = (ev: ProgressEvent) => void;

export function downloadShipped(
    record: GamedataRecord,
    onProgress: ProgressCallback,
): DownloadHandle {
    const controller = new AbortController();
    const promise = (async () => {
        if (!record.source.url) throw new Error('shipped record missing url');
        await setGamedataStatus(record.id, 'downloading');

        const resp = await fetch(record.source.url, { signal: controller.signal });
        if (!resp.ok) throw new Error(`fetch ${record.source.url}: ${resp.status}`);

        const totalBytes =
            Number(resp.headers.get('content-length')) || record.sizeBytes || 0;
        const reader = resp.body?.getReader();
        if (!reader) throw new Error('fetch body not readable');

        const chunks: Uint8Array[] = [];
        let received = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.byteLength;
            onProgress({
                fraction: totalBytes ? received / totalBytes : 0,
                bytes: received,
                totalBytes,
                phase: 'downloading',
            });
        }

        const bytes = new Uint8Array(received);
        let offset = 0;
        for (const c of chunks) {
            bytes.set(c, offset);
            offset += c.byteLength;
        }
        await commitDownloadedExtract(
            record.id,
            record.mod,
            record.engine,
            'original',
            bytes,
            onProgress,
        );
    })();
    return { abort: () => controller.abort(), promise };
}

async function commitDownloadedExtract(
    id: string,
    mod: string,
    engine: EngineNumber,
    mode: GamedataMode,
    bytes: Uint8Array,
    onProgress: ProgressCallback,
): Promise<void> {
    await setGamedataStatus(id, 'extracting');
    onProgress({ fraction: 0, phase: 'extracting' });
    const entries = await extractArchive(bytes, (f) =>
        onProgress({ fraction: f, phase: 'extracting' }),
    );
    const layout = buildVfsLayout(entries, mod, engine, mode);
    const existing = await getGamedata(id);
    if (!existing) return;
    await putGamedata({
        ...existing,
        status: 'ready',
        statusDetail: undefined,
        files: layout.files,
        sizeBytes: layout.totalBytes,
        importedAt: new Date().toISOString(),
    });
    onProgress({ fraction: 1, phase: 'extracting' });
}

export interface StagedUpload {
    files: Record<string, Blob>;
    sizeBytes: number;
}

/**
 * Extract an archive in-memory and map it to the engine's VFS layout.
 * Does NOT touch IndexedDB — callers write the resulting files to a
 * gamedata record as part of their own commit step.
 */
export async function stageArchiveUpload(
    archive: Uint8Array,
    mod: string,
    engine: EngineNumber,
    mode: GamedataMode,
    onProgress: ProgressCallback,
): Promise<StagedUpload> {
    onProgress({ fraction: 0, phase: 'extracting' });
    const entries = await extractArchive(archive, (f) =>
        onProgress({ fraction: f, phase: 'extracting' }),
    );
    const layout = buildVfsLayout(entries, mod, engine, mode);
    onProgress({ fraction: 1, phase: 'extracting' });
    return { files: layout.files, sizeBytes: layout.totalBytes };
}

/**
 * Read a picked folder's contents into memory and map them to the
 * engine's VFS layout. Does NOT touch IndexedDB. Progress ticks per
 * file read.
 */
export async function stageDirectoryUpload(
    files: File[],
    mod: string,
    engine: EngineNumber,
    mode: GamedataMode,
    onProgress: ProgressCallback,
): Promise<StagedUpload> {
    onProgress({ fraction: 0, phase: 'extracting' });
    const entries: { path: string; data: Uint8Array }[] = [];
    for (let i = 0; i < files.length; i++) {
        const f = files[i]!;
        entries.push({
            path: (f.webkitRelativePath || f.name).toLowerCase(),
            data: new Uint8Array(await f.arrayBuffer()),
        });
        onProgress({ fraction: (i + 1) / files.length, phase: 'extracting' });
    }
    const layout = buildVfsLayout(entries, mod, engine, mode);
    return { files: layout.files, sizeBytes: layout.totalBytes };
}
