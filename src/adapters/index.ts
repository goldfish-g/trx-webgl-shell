import type { EngineFs, TrxAdapters } from '../engine-loader/trx-types';
import type { GamedataRecord, ProfileRecord } from '../types';
import { stageGamedataIntoFs, makeLoadModDataAdapter } from './loadModData';
import { makePersistenceAdapter } from './persistence';
import { exitOnlySelectProfile } from './selectProfile';
import { makeStartGateAdapter } from './startGate';

export interface BuildAdaptersOptions {
    profile: ProfileRecord;
    readyGamedata: GamedataRecord[];
    canvas: HTMLCanvasElement;
    getFs: () => EngineFs;
    getIdbfs: () => unknown;
    /** Called when the start gate opens (waiting for user interaction). */
    onGateOpen?: () => void;
    /** Called when the start gate closes (after user interaction). */
    onGateClose?: () => void;
}

export interface BuiltAdapters {
    adapters: TrxAdapters;
    preStage(fs: EngineFs): Promise<void>;
}

/**
 * Build the full TrxAdapters object for a play session.
 *
 * `preStage` must be called AFTER createTRX resolves (so `fs` is
 * available) but BEFORE engine.run() — it writes every ready gamedata
 * record under games/<mod>/ so the engine's desktop-style
 * Shell_ScanAvailableMods can discover them, which powers the in-game
 * Switch Mod dialog across all imported games (even cross-engine).
 */
export function buildAdapters(opts: BuildAdaptersOptions): BuiltAdapters {
    // Stage EVERY ready gamedata regardless of engine — the in-engine
    // Switch Mod dialog reads from Shell_ScanAvailableMods which walks
    // the VFS, so any mod we want to let the player jump to must be
    // on disk at start-up. The engine itself handles cross-engine mod
    // switches (it restarts Shell_Main with the new engine_version).
    const toStage = opts.readyGamedata;
    const byMod = new Map<string, GamedataRecord>();
    for (const g of toStage) byMod.set(g.mod, g);

    const persistence = makePersistenceAdapter(opts.getFs, opts.getIdbfs);

    const adapters: TrxAdapters = {
        startGate: makeStartGateAdapter(opts.canvas, {
            onOpen: opts.onGateOpen,
            onClose: opts.onGateClose,
        }),
        mountPersistence: persistence.mountPersistence,
        syncPersistenceIn: persistence.syncPersistenceIn,
        syncPersistenceOut: persistence.syncPersistenceOut,
        flushPersistence: persistence.flushPersistence,
        loadModData: makeLoadModDataAdapter(opts.getFs, byMod),
        selectProfile: exitOnlySelectProfile,
    };

    async function preStage(fs: EngineFs): Promise<void> {
        for (const record of toStage) {
            await stageGamedataIntoFs(fs, record);
        }
    }

    return { adapters, preStage };
}
