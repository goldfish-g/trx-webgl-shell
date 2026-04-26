import type { DBSchema } from 'idb';
import type { GamedataRecord, ProfileRecord } from '../types';

export interface TrxDb extends DBSchema {
    gamedata: {
        key: string;
        value: GamedataRecord;
    };
    profiles: {
        key: string;
        value: ProfileRecord;
    };
}
