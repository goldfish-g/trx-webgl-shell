import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLibraryStore, type ProgressState } from '../../stores/libraryStore';
import type { GamedataRecord, ProfileRecord } from '../../types';
import { ProgressBar } from '../shared/ProgressBar';
import { DeleteProfileDialog } from './DeleteProfileDialog';

interface Props {
    profile: ProfileRecord;
    gamedata: GamedataRecord | undefined;
}

export function ProfileCard({ profile, gamedata }: Props) {
    const navigate = useNavigate();
    const progress = useLibraryStore(
        (s) => s.progress.get(gamedata?.id ?? '') ?? null,
    );
    const startDownload = useLibraryStore((s) => s.startDownload);
    const cancelDownload = useLibraryStore((s) => s.cancelDownload);
    const [showDelete, setShowDelete] = useState(false);

    const status = resolveStatus(gamedata, progress);
    const isBusy = status === 'downloading' || status === 'extracting';

    return (
        <div className="card">
            <div className="card__header">
                <h3 className="card__title">{profile.name}</h3>
                <button
                    className="card__delete"
                    onClick={() => setShowDelete(true)}
                    title="Delete profile"
                    aria-label="Delete profile"
                >
                    ×
                </button>
            </div>

            <div className="card__meta">
                <span className="pill">TR{profile.engine}</span>
                <span className="pill">engine {profile.engineVersion}</span>
                {gamedata?.kind === 'user' ? <span className="pill">imported</span> : null}
            </div>

            {profile.description ? (
                <p className="card__desc">{profile.description}</p>
            ) : null}

            <div className="card__status">{renderStatusLine(status, gamedata, progress)}</div>

            {isBusy && progress ? (
                <ProgressBar fraction={progress.fraction} label={progressLabel(progress)} />
            ) : null}

            <div className="card__actions">
                {renderPrimaryButton({
                    status,
                    isBusy,
                    onDownload: () => gamedata && startDownload(gamedata.id),
                    onCancel: () => gamedata && cancelDownload(gamedata.id),
                    onPlay: () => navigate(`/play/${profile.id}`),
                })}
            </div>

            {showDelete ? (
                <DeleteProfileDialog
                    profile={profile}
                    onClose={() => setShowDelete(false)}
                />
            ) : null}
        </div>
    );
}

type DisplayStatus =
    | 'ready'
    | 'needs-download'
    | 'downloading'
    | 'extracting'
    | 'error'
    | 'gamedata-missing';

function resolveStatus(
    gamedata: GamedataRecord | undefined,
    progress: ProgressState | null,
): DisplayStatus {
    if (!gamedata) return 'gamedata-missing';
    if (progress) return progress.phase === 'downloading' ? 'downloading' : 'extracting';
    switch (gamedata.status) {
        case 'ready':
            return 'ready';
        case 'downloading':
            return 'downloading';
        case 'extracting':
            return 'extracting';
        case 'error':
            return 'error';
        case 'gamedata-missing':
            return 'gamedata-missing';
        default:
            return 'needs-download';
    }
}

function renderStatusLine(
    status: DisplayStatus,
    gamedata: GamedataRecord | undefined,
    _progress: ProgressState | null,
): string {
    switch (status) {
        case 'ready':
            return gamedata?.lastPlayedAt
                ? `Last played ${new Date(gamedata.lastPlayedAt).toLocaleString()}`
                : 'Ready to play.';
        case 'needs-download':
            return gamedata?.sizeBytes
                ? `Download (${formatBytes(gamedata.sizeBytes)})`
                : 'Download';
        case 'downloading':
            return 'Downloading…';
        case 'extracting':
            return 'Extracting…';
        case 'error':
            return `Error: ${gamedata?.statusDetail ?? 'unknown'}`;
        case 'gamedata-missing':
            return 'Gamedata missing. Re-import to restore.';
    }
}

function progressLabel(p: ProgressState): string {
    if (p.phase === 'downloading' && p.bytes && p.totalBytes) {
        return `${formatBytes(p.bytes)} / ${formatBytes(p.totalBytes)}`;
    }
    return `${Math.round(p.fraction * 100)}%`;
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function renderPrimaryButton(args: {
    status: DisplayStatus;
    isBusy: boolean;
    onDownload: () => void;
    onCancel: () => void;
    onPlay: () => void;
}) {
    if (args.isBusy) {
        return (
            <button className="btn btn--ghost" onClick={args.onCancel}>
                Cancel
            </button>
        );
    }
    switch (args.status) {
        case 'ready':
            return (
                <button className="btn btn--primary" onClick={args.onPlay}>
                    Play
                </button>
            );
        case 'error':
        case 'needs-download':
            return (
                <button className="btn btn--primary" onClick={args.onDownload}>
                    Download
                </button>
            );
        case 'gamedata-missing':
            return (
                <button className="btn" disabled>
                    Re-import needed
                </button>
            );
        default:
            return null;
    }
}
