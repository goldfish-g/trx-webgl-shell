export type EngineNumber = 1 | 2 | 3;

export type GamedataKind = 'shipped' | 'user';

/**
 * Describes what kind of files the user is importing, which determines
 * the VFS layout strategy and the derived `mod` id.
 */
export type GamedataMode = 'original' | 'expansion' | 'custom-level';

export type GamedataStatus =
    | 'needs-download'
    | 'downloading'
    | 'extracting'
    | 'ready'
    | 'error'
    | 'gamedata-missing';

export interface GamedataRecord {
    id: string;
    kind: GamedataKind;
    mod: string;
    engine: EngineNumber;
    name: string;
    source: { url?: string; filename?: string };
    status: GamedataStatus;
    statusDetail?: string;
    /**
     * Extracted files keyed by VFS path relative to `/` (e.g.
     * `games/tr1/levels/GYM.PHD`). Stored as Blobs so `idb` round-trips
     * them without converting to ArrayBuffer.
     */
    files: Record<string, Blob>;
    sizeBytes: number;
    importedAt: string;
    lastPlayedAt: string | null;
}

export interface ProfileRecord {
    id: string;
    name: string;
    gamedataId: string;
    mod: string;
    engine: EngineNumber;
    /** Pinned at profile creation — picks which /engines/<ver>/ to load. */
    engineVersion: string;
    description: string;
    isDefault: boolean;
    createdAt: string;
    lastPlayedAt: string | null;
}

export interface ShippedManifestEntry {
    id: string;
    mod: string;
    engine: EngineNumber;
    name: string;
    description?: string;
    url: string;
    sizeBytes: number;
}

export interface GamedataManifest {
    entries: ShippedManifestEntry[];
}
