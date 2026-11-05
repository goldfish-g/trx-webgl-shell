import { describe, expect, it } from 'vitest';
import type { ArchiveEntry } from '../lib/archive';
import { detectGame, engineFromHeader, readModMeta } from './detect';
import { GAME_LEVELS } from './levels';

// The first bytes of real level files, read from the GOG releases.
const HEADERS = {
    1: [0x20, 0, 0, 0],
    2: [0x2d, 0, 0, 0],
    3: [0x38, 0, 0x18, 0xff],
    4: [0x54, 0x52, 0x34, 0],
} as const;

function file(path: string, content: string | readonly number[] = 'x'): ArchiveEntry {
    const blob = new Blob([typeof content === 'string' ? content : new Uint8Array(content)]);
    return { path, size: blob.size, read: async () => blob };
}

function levels(mod: string, engine: keyof typeof HEADERS, count?: number): ArchiveEntry[] {
    return (GAME_LEVELS[mod] ?? [])
        .slice(0, count)
        .map((name) => file(`DATA/${name.toUpperCase()}`, HEADERS[engine]));
}

describe('engineFromHeader', () => {
    it('reads the engine from the version every level file starts with', () => {
        expect(engineFromHeader(new Uint8Array(HEADERS[1]))).toBe(1);
        expect(engineFromHeader(new Uint8Array(HEADERS[2]))).toBe(2);
        expect(engineFromHeader(new Uint8Array([0x38, 0, 0x08, 0xff]))).toBe(3);
        expect(engineFromHeader(new Uint8Array([0x34, 0, 0x18, 0xff]))).toBe(3);
        expect(engineFromHeader(new Uint8Array(HEADERS[4]))).toBe(4);
        expect(engineFromHeader(new Uint8Array([0x54, 0x52, 0x34, 0x63]))).toBe(4);
        expect(engineFromHeader(new Uint8Array([1, 2, 3, 4]))).toBeUndefined();
    });
});

describe('readModMeta', () => {
    it('reads the top-level keys of a gameflow, comments and all', () => {
        const meta = readModMeta(`{
            // A custom level for TR2. "engine": 9 in a comment means nothing.
            engine: 2,
            "extends": "tr2",
            'name': "The Lost Valley",
            "levels": [{"name": "Not this one", "path": "valley.tr2"}],
        }`);
        expect(meta).toEqual({ engine: 2, extendsMod: 'tr2', name: 'The Lost Valley' });
    });
});

describe('detectGame', () => {
    it('recognises each game from its level files', async () => {
        for (const [mod, engine] of [
            ['tr1', 1],
            ['tr2', 2],
            ['tr3', 3],
            ['tr4', 4],
        ] as const) {
            const detection = await detectGame(levels(mod, engine));
            expect(detection).toMatchObject({ kind: 'game', game: { mod } });
        }
    });

    it('tells the expansions apart from their games', async () => {
        expect(await detectGame(levels('tr2-gm', 2))).toMatchObject({ kind: 'game', game: { mod: 'tr2-gm' } });
        expect(await detectGame(levels('tr3-la', 3))).toMatchObject({ kind: 'game', game: { mod: 'tr3-la' } });
        expect(await detectGame(levels('tr1-ub', 1))).toMatchObject({ kind: 'game', game: { mod: 'tr1-ub' } });
    });

    it('tells TR3 from TR2 by the files themselves, whatever they are called', async () => {
        const named = [file('DATA/WALL.TR2', HEADERS[3]), ...levels('tr3', 3, 10)];
        expect(await detectGame(named)).toMatchObject({ kind: 'game', game: { mod: 'tr3' } });
    });

    it('prefers the whole game when it holds the demo or an expansion as well', async () => {
        const tr1 = levels('tr1', 1);
        expect(await detectGame(tr1)).toMatchObject({ kind: 'game', game: { mod: 'tr1' } });
        // The GOG release lacks one of the levels the gameflow names.
        expect(await detectGame(tr1.slice(1))).toMatchObject({ kind: 'game', game: { mod: 'tr1' } });
        expect(await detectGame(levels('tr1-demo-pc', 1))).toMatchObject({
            kind: 'game',
            game: { mod: 'tr1-demo-pc' },
        });
    });

    it('counts the levels that are missing', async () => {
        const detection = await detectGame(levels('tr2', 2, 15));
        expect(detection).toMatchObject({ kind: 'game', game: { mod: 'tr2' }, found: 15 });
    });

    it('takes a custom level as its gameflow describes it', async () => {
        const detection = await detectGame([
            file('Valley/gameflow.json5', '{ "engine": 3, "extends": "tr3", "name": "The Valley" }'),
            file('Valley/levels/valley.tr2', HEADERS[3]),
        ]);
        expect(detection).toEqual({
            kind: 'custom',
            engine: 3,
            name: 'The Valley',
            extendsMod: 'tr3',
            root: 'Valley/',
        });
    });

    it('takes level files of no game as levels of their own', async () => {
        const detection = await detectGame([file('MyLevel.tr2', HEADERS[2]), file('notes.txt')]);
        expect(detection).toEqual({ kind: 'level', engine: 2, levels: ['MyLevel.tr2'] });
    });

    it('explains what it cannot read', async () => {
        expect(await detectGame([file('readme.txt')])).toMatchObject({ kind: 'unknown' });
        expect(await detectGame([file('fake.tr2', 'not a level')])).toMatchObject({ kind: 'unknown' });
        expect(await detectGame([file('mod/gameflow.json5', '{ "name": "No engine" }')])).toMatchObject({
            kind: 'unknown',
        });
    });
});
