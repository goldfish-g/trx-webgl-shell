import { useEffect, useState } from 'react';
import { ENGINE_NAMES } from '../games/catalog';
import { removeGameData, retryImport, useImports } from '../gamedata/imports';
import type { GameDataRecord } from '../gamedata/types';
import { deleteProfile } from '../profiles/store';
import type { ProfileRecord } from '../profiles/types';
import { ConfirmDialog } from '../ui/Dialog';
import { formatBytes } from '../ui/format';
import { ProgressBar } from '../ui/ProgressBar';
import { describeProgress, describeSource } from './describe';

interface Props {
    gamedata: GameDataRecord[];
    profiles: ProfileRecord[];
}

function useStorageEstimate(deps: unknown): string | null {
    const [text, setText] = useState<string | null>(null);
    useEffect(() => {
        navigator.storage
            ?.estimate?.()
            .then(({ usage, quota }) => {
                if (usage !== undefined && quota !== undefined) {
                    setText(`${formatBytes(usage)} used of ${formatBytes(quota)} available to this site`);
                }
            })
            .catch(() => {});
    }, [deps]);
    return text;
}

export function GameDataSection({ gamedata, profiles }: Props) {
    const estimate = useStorageEstimate(gamedata);
    if (gamedata.length === 0) return null;
    return (
        <section className="section">
            <div className="section__header">
                <h2 className="section__title">Game data</h2>
                {estimate !== null ? <p className="section__aside">{estimate}</p> : null}
            </div>
            <ul className="rows">
                {gamedata.map((record) => (
                    <GameDataRow
                        key={record.id}
                        record={record}
                        users={profiles.filter((profile) => profile.gamedataId === record.id)}
                    />
                ))}
            </ul>
        </section>
    );
}

function GameDataRow({ record, users }: { record: GameDataRecord; users: ProfileRecord[] }) {
    const progress = useImports((state) => state.progress[record.id]);
    const [confirming, setConfirming] = useState(false);

    const remove = async () => {
        for (const profile of users) await deleteProfile(profile.id);
        await removeGameData(record.id);
    };

    let detail;
    if (record.status === 'importing') {
        const { fraction, label } =
            progress !== undefined ? describeProgress(progress) : { fraction: null, label: 'Waiting to continue…' };
        detail = <ProgressBar fraction={fraction} label={label} />;
    } else if (record.status === 'failed') {
        detail = <p className="row__error">{record.error ?? 'The import failed.'}</p>;
    }

    return (
        <li className="row">
            <div className="row__main">
                <p className="row__title">
                    <span className="card__badge">{ENGINE_NAMES[record.engine]}</span> {record.name}
                </p>
                <p className="row__meta">
                    {describeSource(record.source)}
                    {record.status === 'ready' ? ` · ${formatBytes(record.sizeBytes)} in ${record.fileCount} files` : ''}
                    {users.length > 0 ? ` · used by ${users.length} profile${users.length === 1 ? '' : 's'}` : ''}
                </p>
                {detail}
            </div>
            <div className="row__actions">
                {record.status === 'failed' && record.source.kind !== 'upload' ? (
                    <button className="button button--small" onClick={() => void retryImport(record.id)}>
                        Try again
                    </button>
                ) : null}
                <button className="button button--small button--quiet" onClick={() => setConfirming(true)}>
                    {record.status === 'importing' ? 'Cancel' : 'Delete'}
                </button>
            </div>
            {confirming ? (
                <ConfirmDialog
                    title={record.status === 'importing' ? `Cancel ${record.name}?` : `Delete ${record.name}?`}
                    confirmLabel={record.status === 'importing' ? 'Cancel import' : 'Delete'}
                    onConfirm={() => void remove()}
                    onClose={() => setConfirming(false)}
                >
                    {users.length > 0 ? (
                        <>
                            <p>These profiles play it, and are deleted with it, saves included:</p>
                            <ul className="plain-list">
                                {users.map((profile) => (
                                    <li key={profile.id}>{profile.name}</li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        <p>Its files are removed from this browser. You can add it again at any time.</p>
                    )}
                </ConfirmDialog>
            ) : null}
        </li>
    );
}
