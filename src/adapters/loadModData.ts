import type { EngineFs } from '../engine-loader/trx-types';
import type { GamedataRecord } from '../types';

/**
 * Write a gamedata record's blob map into the engine's FS under the
 * paths the engine expects (games/<mod>/…).
 */
export async function stageGamedataIntoFs(
    fs: EngineFs,
    record: GamedataRecord,
): Promise<void> {
    for (const [vfsPath, blob] of Object.entries(record.files)) {
        const absolute = vfsPath.startsWith('/') ? vfsPath : '/' + vfsPath;
        const lastSlash = absolute.lastIndexOf('/');
        if (lastSlash > 0) {
            try {
                fs.mkdirTree(absolute.slice(0, lastSlash));
            } catch (_) {}
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        try {
            fs.writeFile(absolute, bytes);
        } catch (err) {
            console.warn('[adapter] writeFile failed for', absolute, err);
        }
    }
}

export function makeLoadModDataAdapter(
    getFs: () => EngineFs,
    readyGamedataByMod: Map<string, GamedataRecord>,
) {
    return async (modName: string): Promise<void> => {
        const record = readyGamedataByMod.get(modName);
        if (!record) {
            console.warn(
                '[adapter] loadModData: no ready gamedata staged for mod',
                modName,
            );
            return;
        }
        // All same-version ready gamedata was pre-staged before
        // engine.run() — this call is typically a no-op confirming the
        // tree is present. We skip rewriting if games/<mod>/ already
        // appears non-empty.
        await stageGamedataIntoFs(getFs(), record);
    };
}
