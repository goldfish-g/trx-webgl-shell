// Mirrors the public surface of tools/shared/emscripten/trx.d.ts from
// the TRX repo. We redeclare it locally to avoid module-resolution
// pain across the /public boundary (Vite won't type-check a runtime-
// loaded URL).

export interface TrxProfileSelection {
    mod: string;
    engine: number;
}

export interface TrxAdapters {
    startGate: () => Promise<void>;
    mountPersistence: (mountPath: string) => Promise<void>;
    syncPersistenceIn: () => Promise<void>;
    syncPersistenceOut: (srcPath: string, dstPath: string) => void;
    flushPersistence: () => void;
    loadModData: (modName: string) => Promise<void>;
    selectProfile: () => Promise<TrxProfileSelection>;
}

export interface TrxCreateOptions {
    canvas: HTMLCanvasElement;
    adapters: TrxAdapters;
    wasmUrl?: string;
    dataUrl?: string;
    jsUrl?: string;
    onStdout?: (text: string) => void;
    onStderr?: (text: string) => void;
}

// Minimal surface of Emscripten's FS object that we interact with.
export interface EngineFs {
    mkdir(path: string): void;
    mkdirTree(path: string): void;
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    mount(fs: unknown, opts: Record<string, unknown>, path: string): void;
    syncfs(populate: boolean, cb: (err: Error | null) => void): void;
    filesystems: { IDBFS: unknown };
}

export interface TrxEngine {
    canvas: HTMLCanvasElement;
    fs: EngineFs;
    version: string;
    run(args: string[]): Promise<number>;
    syncViewport(): void;
}

export type CreateTrx = (opts: TrxCreateOptions) => Promise<TrxEngine>;
