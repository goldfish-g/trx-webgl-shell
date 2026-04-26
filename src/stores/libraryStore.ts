import { create } from 'zustand';
import { getDb } from '../db';
import {
    deleteGamedata,
    downloadShipped,
    listGamedata,
    seedShippedGamedata,
    stageArchiveUpload,
    stageDirectoryUpload,
} from '../gamedata/library';
import { loadShippedManifest } from '../gamedata/manifest';
import type { DownloadHandle, ProgressEvent } from '../gamedata/library';
import { latestEngineVersion } from '../engine-loader/versions';
import {
    countProfilesReferencingGamedata,
    deleteProfile as dbDeleteProfile,
    listProfiles,
    putProfile,
    seedDefaultProfiles,
    tombstoneProfile,
} from '../profiles/store';
import type {
    EngineNumber,
    GamedataMode,
    GamedataRecord,
    ProfileRecord,
} from '../types';

export interface ProgressState {
    phase: 'downloading' | 'extracting';
    fraction: number;
    bytes?: number;
    totalBytes?: number;
}

interface LibraryState {
    loaded: boolean;
    profiles: ProfileRecord[];
    gamedata: Map<string, GamedataRecord>;
    progress: Map<string, ProgressState>;
    activeDownloads: Map<string, DownloadHandle>;
    /**
     * Transient progress for an in-flight CreateProfileDialog import
     * (file read → extract → layout). Null when no dialog-driven
     * import is running.
     */
    currentImportProgress: ProgressState | null;

    init(): Promise<void>;
    refresh(): Promise<void>;

    startDownload(gamedataId: string): Promise<void>;
    cancelDownload(gamedataId: string): void;

    createProfile(input: {
        name: string;
        description: string;
        gamedataId: string;
        engineVersion: string;
    }): Promise<ProfileRecord>;

    importAndCreateProfile(input: {
        mod: string;
        engine: EngineNumber;
        mode: GamedataMode;
        profileName: string;
        description: string;
        engineVersion: string;
        archive?: { bytes: Uint8Array; filename: string };
        directory?: { files: File[] };
    }): Promise<ProfileRecord>;

    deleteProfile(profileId: string): Promise<void>;
}

function deletePersistenceDb(mod: string): Promise<void> {
    const name = `/persist/${mod}`;
    return new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve(); // ignore errors (db may not exist)
        req.onblocked = () => resolve();
    });
}

function uuid(): string {
    // crypto.randomUUID isn't available in all contexts without TLS,
    // but in Vite dev + localhost it is. Fallback is good enough.
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
    loaded: false,
    profiles: [],
    gamedata: new Map(),
    progress: new Map(),
    activeDownloads: new Map(),
    currentImportProgress: null,

    async init() {
        const manifest = await loadShippedManifest();
        await seedShippedGamedata(manifest);
        const version = await latestEngineVersion();
        if (version !== null) {
            await seedDefaultProfiles(manifest, version);
        }
        await get().refresh();
        set({ loaded: true });
    },

    async refresh() {
        const [gamedata, profiles] = await Promise.all([
            listGamedata(),
            listProfiles(),
        ]);
        const map = new Map<string, GamedataRecord>();
        for (const g of gamedata) map.set(g.id, g);
        set({ gamedata: map, profiles });
    },

    async startDownload(gamedataId) {
        const record = get().gamedata.get(gamedataId);
        if (!record || record.kind !== 'shipped' || !record.source.url) return;
        if (get().activeDownloads.has(gamedataId)) return;

        const onProgress = (ev: ProgressEvent) => {
            const next = new Map(get().progress);
            next.set(gamedataId, {
                phase: ev.phase,
                fraction: ev.fraction,
                bytes: ev.bytes,
                totalBytes: ev.totalBytes,
            });
            set({ progress: next });
        };

        const handle = downloadShipped(record, onProgress);
        const active = new Map(get().activeDownloads);
        active.set(gamedataId, handle);
        set({ activeDownloads: active });

        try {
            await handle.promise;
        } catch (err) {
            console.error('[library] download failed:', err);
            // Only mark the record as errored if we weren't the cause
            // (abort). AbortError has name === 'AbortError'.
            if ((err as Error)?.name !== 'AbortError') {
                // rely on DB status write by library.ts if it got far enough
            }
        } finally {
            const activeAfter = new Map(get().activeDownloads);
            activeAfter.delete(gamedataId);
            const progressAfter = new Map(get().progress);
            progressAfter.delete(gamedataId);
            set({ activeDownloads: activeAfter, progress: progressAfter });
            await get().refresh();
        }
    },

    cancelDownload(gamedataId) {
        const handle = get().activeDownloads.get(gamedataId);
        handle?.abort();
    },

    async createProfile(input) {
        const gd = get().gamedata.get(input.gamedataId);
        if (!gd) throw new Error('createProfile: gamedata not found');
        const profile: ProfileRecord = {
            id: uuid(),
            name: input.name,
            gamedataId: gd.id,
            mod: gd.mod,
            engine: gd.engine,
            engineVersion: input.engineVersion,
            description: input.description,
            isDefault: false,
            createdAt: new Date().toISOString(),
            lastPlayedAt: null,
        };
        await putProfile(profile);
        await get().refresh();
        return profile;
    },

    async importAndCreateProfile(input) {
        const onProgress = (ev: ProgressEvent) => {
            set({
                currentImportProgress: {
                    phase: ev.phase,
                    fraction: ev.fraction,
                    bytes: ev.bytes,
                    totalBytes: ev.totalBytes,
                },
            });
        };
        set({
            currentImportProgress: { phase: 'extracting', fraction: 0 },
        });
        try {
            // 1. Extract + map in memory only — no IDB writes yet.
            let staged;
            let sourceFilename: string;
            if (input.archive) {
                staged = await stageArchiveUpload(
                    input.archive.bytes,
                    input.mod,
                    input.engine,
                    input.mode,
                    onProgress,
                );
                sourceFilename = input.archive.filename;
            } else if (input.directory) {
                staged = await stageDirectoryUpload(
                    input.directory.files,
                    input.mod,
                    input.engine,
                    input.mode,
                    onProgress,
                );
                sourceFilename = 'directory';
            } else {
                throw new Error('importAndCreateProfile: no source provided');
            }

            // 2. Commit gamedata + profile atomically. Either both land
            // or neither — so a failure mid-commit can't leave orphans.
            const now = new Date().toISOString();
            const gamedata: GamedataRecord = {
                id: uuid(),
                kind: 'user',
                mod: input.mod,
                engine: input.engine,
                name: input.profileName,
                source: { filename: sourceFilename },
                status: 'ready',
                files: staged.files,
                sizeBytes: staged.sizeBytes,
                importedAt: now,
                lastPlayedAt: null,
            };
            const profile: ProfileRecord = {
                id: uuid(),
                name: input.profileName,
                gamedataId: gamedata.id,
                mod: input.mod,
                engine: input.engine,
                engineVersion: input.engineVersion,
                description: input.description,
                isDefault: false,
                createdAt: now,
                lastPlayedAt: null,
            };

            const db = await getDb();
            const tx = db.transaction(['gamedata', 'profiles'], 'readwrite');
            await tx.objectStore('gamedata').put(gamedata);
            await tx.objectStore('profiles').put(profile);
            await tx.done;

            await get().refresh();
            return profile;
        } finally {
            set({ currentImportProgress: null });
        }
    },

    async deleteProfile(profileId) {
        const profile = get().profiles.find((p) => p.id === profileId);
        if (!profile) return;
        await dbDeleteProfile(profileId);
        if (profile.isDefault) tombstoneProfile(profileId);

        const remaining = await countProfilesReferencingGamedata(profile.gamedataId);
        if (remaining === 0) {
            const gd = get().gamedata.get(profile.gamedataId);
            if (gd && gd.kind === 'user') {
                await deleteGamedata(profile.gamedataId);
            }
        }

        // IDBFS-backed saves and config for this mod live in a separate
        // IndexedDB database named literally `/persist/<mod>` (that's
        // Emscripten's convention: mount path == DB name). Saves are
        // keyed by `mod`, not by profile/gamedata — so only wipe them
        // if no other profile still uses the same mod.
        const otherProfiles = get().profiles.filter(
            (p) => p.id !== profileId && p.mod === profile.mod,
        );
        if (otherProfiles.length === 0) {
            await deletePersistenceDb(profile.mod);
        }

        await get().refresh();
    },
}));
