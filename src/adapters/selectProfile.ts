import type { TrxProfileSelection } from '../engine-loader/trx-types';

/**
 * Called from the engine's Exit Game flow. In this reference frontend
 * we never recreate a profile mid-session — we just let the engine
 * exit and route the user back to the Library.
 */
export async function exitOnlySelectProfile(): Promise<TrxProfileSelection> {
    return { mod: '', engine: 0 };
}
