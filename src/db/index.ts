import { openDB, type IDBPDatabase } from 'idb';
import type { TrxDb } from './schema';

let dbPromise: Promise<IDBPDatabase<TrxDb>> | null = null;

export function getDb(): Promise<IDBPDatabase<TrxDb>> {
    if (dbPromise === null) {
        dbPromise = openDB<TrxDb>('trx-shell', 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('gamedata')) {
                    db.createObjectStore('gamedata', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('profiles')) {
                    db.createObjectStore('profiles', { keyPath: 'id' });
                }
            },
        });
    }
    return dbPromise;
}
