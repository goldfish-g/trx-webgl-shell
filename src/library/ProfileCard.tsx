import { useState } from 'react';
import { ENGINE_NAMES, findGame } from '../games/catalog';
import { retryImport, useImports } from '../gamedata/imports';
import type { GameDataRecord } from '../gamedata/types';
import { deleteProfile, renameProfile } from '../profiles/store';
import type { ProfileRecord } from '../profiles/types';
import { ConfirmDialog, Dialog } from '../ui/Dialog';
import { formatWhen } from '../ui/format';
import { ProgressBar } from '../ui/ProgressBar';
import { describeProgress } from './describe';

interface Props {
    profile: ProfileRecord;
    gamedata: GameDataRecord | undefined;
}

export function ProfileCard({ profile, gamedata }: Props) {
    const progress = useImports((state) => (gamedata === undefined ? undefined : state.progress[gamedata.id]));
    const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
    const game = findGame(profile.mod);
    const title = game?.title ?? gamedata?.name ?? profile.mod;

    let status;
    if (gamedata === undefined) {
        status = <p className="card__note card__note--error">Its game data was removed from the library.</p>;
    } else if (gamedata.status === 'importing') {
        const { fraction, label } =
            progress !== undefined ? describeProgress(progress) : { fraction: null, label: 'Waiting to continue…' };
        status = <ProgressBar fraction={fraction} label={label} />;
    } else if (gamedata.status === 'failed') {
        status = (
            <div className="card__note card__note--error">
                <p>{gamedata.error ?? 'The import failed.'}</p>
                {gamedata.source.kind !== 'upload' ? (
                    <button className="button button--small" onClick={() => void retryImport(gamedata.id)}>
                        Try again
                    </button>
                ) : null}
            </div>
        );
    }

    return (
        <article className="card">
            <div className="card__header">
                <span className="card__badge">{ENGINE_NAMES[profile.engine]}</span>
                <h3 className="card__title">{profile.name}</h3>
                {profile.name !== title ? <p className="card__subtitle">{title}</p> : null}
            </div>
            <p className="card__meta">
                Engine {profile.engineVersion} · played {formatWhen(profile.lastPlayedAt)}
            </p>
            {status}
            <div className="card__actions">
                {gamedata?.status === 'ready' ? (
                    // A full page load gives every session a fresh engine.
                    <a className="button button--primary" href={`/play/${profile.id}`}>
                        Play
                    </a>
                ) : null}
                <button className="button button--quiet" onClick={() => setDialog('rename')}>
                    Rename
                </button>
                <button className="button button--quiet" onClick={() => setDialog('delete')}>
                    Delete
                </button>
            </div>

            {dialog === 'rename' ? (
                <RenameDialog profile={profile} onClose={() => setDialog(null)} />
            ) : null}
            {dialog === 'delete' ? (
                <ConfirmDialog
                    title={`Delete ${profile.name}?`}
                    confirmLabel="Delete profile"
                    onConfirm={() => void deleteProfile(profile.id)}
                    onClose={() => setDialog(null)}
                >
                    <p>Its saves and settings are deleted with it. The game data stays in the library.</p>
                </ConfirmDialog>
            ) : null}
        </article>
    );
}

function RenameDialog({ profile, onClose }: { profile: ProfileRecord; onClose(): void }) {
    const [name, setName] = useState(profile.name);
    const trimmed = name.trim();
    const save = () => {
        if (trimmed === '') return;
        void renameProfile(profile.id, trimmed);
        onClose();
    };
    return (
        <Dialog
            title="Rename profile"
            onClose={onClose}
            actions={
                <>
                    <button className="button" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="button button--primary" disabled={trimmed === ''} onClick={save}>
                        Save
                    </button>
                </>
            }
        >
            <label className="field">
                <span className="field__label">Name</span>
                <input
                    className="field__input"
                    value={name}
                    autoFocus
                    maxLength={60}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') save();
                    }}
                />
            </label>
        </Dialog>
    );
}
