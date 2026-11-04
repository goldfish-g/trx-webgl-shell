// Map raw user files to the VFS layout the TRX engine expects.
// Engines look for files under `games/<mod>/…`:
//   levels/   — *.phd (TR1), *.tr2 (TR2/TR3), *.psx
//   music/    — Track*.flac / *.mp3 / *.wav
//   fmv/      — *.mp4
//   audio/    — cdaudio.wad (TR3)
//   cuts/     — *.tr2 (TR3 cutscene levels)
//   main.sfx  — at mod root

import type { EngineNumber, GamedataMode } from '../types';
import type { ExtractedFile } from './extract';

const LEVEL_EXTS: Record<EngineNumber, string[]> = {
    1: ['.phd', '.psx', '.tub'],
    2: ['.tr2', '.psx'],
    3: ['.tr2', '.psx'],
    4: ['.tr4'],
};

function basename(p: string): string {
    const idx = p.lastIndexOf('/');
    return idx >= 0 ? p.slice(idx + 1) : p;
}

function endsWithAny(name: string, exts: string[]): boolean {
    return exts.some((e) => name.endsWith(e));
}

export function mapFileToVfsPath(
    file: ExtractedFile,
    mod: string,
    engine: EngineNumber,
): string | null {
    const name = basename(file.path);
    if (!name) return null;

    const levelExts = LEVEL_EXTS[engine] ?? [];
    const base = `games/${mod}`;

    // Archives already laid out as the engine expects keep their paths.
    if (file.path.startsWith(`${base}/`)) {
        return file.path;
    }

    if (endsWithAny(name, levelExts)) {
        return `${base}/levels/${name}`;
    }
    if (name.endsWith('.sfx')) {
        return `${base}/${name}`;
    }
    if (endsWithAny(name, ['.flac', '.mp3', '.wav', '.ogg'])) {
        return `${base}/music/${name}`;
    }
    // FMV video. .mp4 is the default browser-playable format. The
    // remasters ship video as .OGV (silent) plus audio inside the
    // original .FMV wrapper, so we stage both; the engine pairs them
    // up at playback time.
    if (endsWithAny(name, ['.mp4', '.ogv', '.webm', '.fmv'])) {
        return `${base}/fmv/${name}`;
    }
    if (name === 'cdaudio.wad') {
        return `${base}/audio/${name}`;
    }
    // Drop everything else (readmes, random metadata).
    return null;
}

export interface MappedLayout {
    files: Record<string, Blob>;
    totalBytes: number;
    hasFmv: boolean;
    hasMusic: boolean;
    hasLevels: boolean;
}

export class LayoutError extends Error {}

export function buildVfsLayout(
    entries: ExtractedFile[],
    mod: string,
    engine: EngineNumber,
    mode: GamedataMode,
): MappedLayout {
    if (mode === 'custom-level') {
        return buildTreePreservingLayout(entries, mod);
    }
    return buildExtensionBasedLayout(entries, mod, engine);
}

/**
 * Original-game / expansion layout: sort files by extension into the
 * engine-expected slots (levels/, music/, fmv/, audio/, root main.sfx).
 * The engine's shipped gameflow / catalogs / injections fill in the
 * rest.
 */
function buildExtensionBasedLayout(
    entries: ExtractedFile[],
    mod: string,
    engine: EngineNumber,
): MappedLayout {
    const files: Record<string, Blob> = {};
    let totalBytes = 0;
    let hasFmv = false;
    let hasMusic = false;
    let hasLevels = false;

    for (const entry of entries) {
        const vfsPath = mapFileToVfsPath(entry, mod, engine);
        if (vfsPath === null) continue;
        files[vfsPath] = new Blob([entry.data as BlobPart]);
        totalBytes += entry.data.byteLength;
        if (vfsPath.includes('/fmv/')) hasFmv = true;
        if (vfsPath.includes('/music/')) hasMusic = true;
        if (vfsPath.includes('/levels/')) hasLevels = true;
    }

    return { files, totalBytes, hasFmv, hasMusic, hasLevels };
}

/**
 * Custom-level layout: preserve the uploaded directory structure under
 * `games/<mod>/`. The archive/folder is expected to contain a
 * `gameflow.json5` alongside its assets; everything under that file's
 * directory is copied verbatim.
 */
function buildTreePreservingLayout(
    entries: ExtractedFile[],
    mod: string,
): MappedLayout {
    const root = findModRoot(entries);
    if (root === null) {
        throw new LayoutError(
            'Custom-level import requires a gameflow.json5 in the archive or folder.',
        );
    }

    const prefix = root === '' ? '' : root + '/';
    const files: Record<string, Blob> = {};
    let totalBytes = 0;
    let hasFmv = false;
    let hasMusic = false;
    let hasLevels = false;

    for (const entry of entries) {
        if (prefix !== '' && !entry.path.startsWith(prefix)) {
            continue;
        }
        const rel = entry.path.slice(prefix.length);
        if (rel === '' || rel.endsWith('/')) continue;
        const vfsPath = `games/${mod}/${rel}`;
        files[vfsPath] = new Blob([entry.data as BlobPart]);
        totalBytes += entry.data.byteLength;
        if (rel.startsWith('fmv/')) hasFmv = true;
        if (rel.startsWith('music/')) hasMusic = true;
        if (rel.startsWith('levels/')) hasLevels = true;
    }

    if (!files[`games/${mod}/gameflow.json5`]) {
        throw new LayoutError(
            'gameflow.json5 missing from the staged files — the archive layout did not match expectations.',
        );
    }

    return { files, totalBytes, hasFmv, hasMusic, hasLevels };
}

/** Shortest directory path that contains a gameflow.json5 entry, or null. */
function findModRoot(entries: ExtractedFile[]): string | null {
    let best: string | null = null;
    for (const entry of entries) {
        if (!entry.path.endsWith('gameflow.json5')) continue;
        const dir = entry.path.slice(
            0,
            Math.max(0, entry.path.length - 'gameflow.json5'.length - 1),
        );
        if (best === null || dir.length < best.length) best = dir;
    }
    return best;
}
