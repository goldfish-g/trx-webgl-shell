import { useEffect, useMemo, useRef, useState } from 'react';
import { useLibraryStore } from '../../stores/libraryStore';
import { availableEngineVersions } from '../../engine-loader/versions';
import type { EngineNumber, GamedataMode } from '../../types';
import { ProgressBar } from '../shared/ProgressBar';
import { Spinner } from '../shared/Spinner';

interface Props {
    onClose: () => void;
}

type Source =
    | { kind: 'none' }
    | { kind: 'archive'; file: File; bytes: Uint8Array }
    | { kind: 'directory'; files: File[] };

const UPLOAD_VALUE = '__upload__';

const EXPANSION_LABEL: Record<EngineNumber, string> = {
    1: 'Unfinished Business',
    2: 'The Golden Mask',
    3: 'The Lost Artifact',
};

const EXPANSION_MOD: Record<EngineNumber, string> = {
    1: 'tr1-ub',
    2: 'tr2-gm',
    3: 'tr3-la',
};

const BASE_MOD: Record<EngineNumber, string> = {
    1: 'tr1',
    2: 'tr2',
    3: 'tr3',
};

type TypeChoice = 'original' | 'expansion' | 'custom-level';

export function CreateProfileDialog({ onClose }: Props) {
    const gamedata = useLibraryStore((s) => s.gamedata);
    const createProfile = useLibraryStore((s) => s.createProfile);
    const importAndCreateProfile = useLibraryStore(
        (s) => s.importAndCreateProfile,
    );

    // Offer only shipped default entries in the "Already imported"
    // picker. User-imported gamedata is implicitly tied to the profile
    // that created it; we don't try to share it across profiles here.
    const ready = useMemo(
        () =>
            Array.from(gamedata.values()).filter(
                (g) => g.status === 'ready' && g.kind === 'shipped',
            ),
        [gamedata],
    );

    // Single dropdown: "Upload" (default) or any existing ready gamedata.
    const [gamedataChoice, setGamedataChoice] = useState<string>(UPLOAD_VALUE);
    const isUpload = gamedataChoice === UPLOAD_VALUE;

    const [profileName, setProfileName] = useState('');
    const [description, setDescription] = useState('');
    const [engine, setEngine] = useState<EngineNumber>(1);
    const [type, setType] = useState<TypeChoice>('original');
    const [customSlug, setCustomSlug] = useState('');
    const [source, setSource] = useState<Source>({ kind: 'none' });
    const [engineVersions, setEngineVersions] = useState<string[]>([]);
    const [engineVersion, setEngineVersion] = useState('');
    const [busy, setBusy] = useState(false);
    const [picking, setPicking] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const importProgress = useLibraryStore((s) => s.currentImportProgress);

    const archiveInput = useRef<HTMLInputElement>(null);
    const dirInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        availableEngineVersions().then((list) => {
            setEngineVersions(list);
            if (list[0]) setEngineVersion(list[0]);
        });
    }, []);

    // `cancel` isn't in React's InputHTMLAttributes typing yet; attach
    // via native listener so the spinner clears when the user dismisses
    // the OS file/folder picker without selecting anything.
    useEffect(() => {
        const clear = () => setPicking(null);
        const a = archiveInput.current;
        const d = dirInput.current;
        a?.addEventListener('cancel', clear);
        d?.addEventListener('cancel', clear);
        return () => {
            a?.removeEventListener('cancel', clear);
            d?.removeEventListener('cancel', clear);
        };
    }, []);

    function onGamedataChoiceChange(value: string) {
        setGamedataChoice(value);
        if (value === UPLOAD_VALUE) return;
        const g = ready.find((r) => r.id === value);
        if (g && !profileName) setProfileName(g.name);
    }

    async function onArchivePicked(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) {
            setPicking(null);
            return;
        }
        setPicking(`Reading ${file.name}…`);
        setError(null);
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            setSource({ kind: 'archive', file, bytes });
            if (!profileName) {
                setProfileName(file.name.replace(/\.(zip|tar\.gz|tgz)$/i, ''));
            }
        } catch (err) {
            setError(`Failed to read file: ${(err as Error).message}`);
        } finally {
            setPicking(null);
        }
    }

    function onDirectoryPicked(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files ?? []);
        setPicking(null);
        if (files.length === 0) return;
        setSource({ kind: 'directory', files });
        const topDir = files[0]?.webkitRelativePath?.split('/')[0];
        if (topDir && !profileName) setProfileName(topDir);
        if (topDir && type === 'custom-level' && !customSlug) {
            setCustomSlug(slugify(topDir));
        }
    }

    function openArchivePicker() {
        setPicking('Waiting for file selection…');
        setError(null);
        archiveInput.current?.click();
    }

    function openFolderPicker() {
        setPicking('Reading folder…');
        setError(null);
        dirInput.current?.click();
    }

    function deriveMod(): { mod: string; mode: GamedataMode } | string {
        if (type === 'original') {
            return { mod: BASE_MOD[engine], mode: 'original' };
        }
        if (type === 'expansion') {
            return { mod: EXPANSION_MOD[engine], mode: 'expansion' };
        }
        const slug = slugify(customSlug || profileName);
        if (!slug) return 'Custom level needs an identifier.';
        return { mod: `tr${engine}-level-${slug}`, mode: 'custom-level' };
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!engineVersion) {
            setError('No engine versions available.');
            return;
        }
        if (!profileName.trim()) {
            setError('Pick a profile name.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            if (!isUpload) {
                await createProfile({
                    name: profileName,
                    description,
                    gamedataId: gamedataChoice,
                    engineVersion,
                });
                onClose();
                return;
            }

            if (source.kind === 'none') {
                throw new Error(
                    'Pick an archive or a folder to upload, or select an existing gamedata entry.',
                );
            }

            const derived = deriveMod();
            if (typeof derived === 'string') {
                throw new Error(derived);
            }

            await importAndCreateProfile({
                mod: derived.mod,
                engine,
                mode: derived.mode,
                profileName,
                description,
                engineVersion,
                archive:
                    source.kind === 'archive'
                        ? { bytes: source.bytes, filename: source.file.name }
                        : undefined,
                directory:
                    source.kind === 'directory'
                        ? { files: source.files }
                        : undefined,
            });
            onClose();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="modal" role="dialog" aria-modal="true">
            <form className="modal__panel" onSubmit={onSubmit}>
                <h2>New profile</h2>

                <label className="field">
                    <span>Profile name</span>
                    <input
                        type="text"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        disabled={busy}
                        required
                    />
                </label>

                <label className="field">
                    <span>Description (optional)</span>
                    <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={busy}
                    />
                </label>

                <label className="field">
                    <span>Game data</span>
                    <select
                        value={gamedataChoice}
                        onChange={(e) => onGamedataChoiceChange(e.target.value)}
                        disabled={busy}
                    >
                        <option value={UPLOAD_VALUE}>Upload…</option>
                        {ready.length > 0 ? (
                            <optgroup label="Already imported">
                                {ready.map((g) => (
                                    <option key={g.id} value={g.id}>
                                        {g.name} ({g.mod}, TR{g.engine})
                                    </option>
                                ))}
                            </optgroup>
                        ) : null}
                    </select>
                </label>

                {isUpload ? (
                    <>
                        <div className="field-row">
                            <label className="field">
                                <span>Engine</span>
                                <select
                                    value={engine}
                                    onChange={(e) => {
                                        const n = Number(e.target.value) as EngineNumber;
                                        setEngine(n);
                                        if (type === 'expansion') {
                                            /* keeps type valid; label just updates */
                                        }
                                    }}
                                    disabled={busy}
                                >
                                    <option value={1}>TR1</option>
                                    <option value={2}>TR2</option>
                                    <option value={3}>TR3</option>
                                </select>
                            </label>
                            <label className="field">
                                <span>Type</span>
                                <select
                                    value={type}
                                    onChange={(e) =>
                                        setType(e.target.value as TypeChoice)
                                    }
                                    disabled={busy}
                                >
                                    <option value="original">Original Game</option>
                                    <option value="expansion">
                                        {EXPANSION_LABEL[engine]}
                                    </option>
                                    <option value="custom-level">Custom Level</option>
                                </select>
                            </label>
                        </div>

                        {type === 'custom-level' ? (
                            <label className="field">
                                <span>
                                    Level ID (becomes
                                    <code> tr{engine}-level-&lt;id&gt;</code>)
                                </span>
                                <input
                                    type="text"
                                    value={customSlug}
                                    onChange={(e) =>
                                        setCustomSlug(slugify(e.target.value))
                                    }
                                    disabled={busy}
                                    required
                                    placeholder="my-custom-level"
                                />
                                <small className="hint">
                                    The archive or folder must contain a{' '}
                                    <code>gameflow.json5</code> and all assets.
                                </small>
                            </label>
                        ) : (
                            <p className="hint">
                                Upload the original game files (levels, music,
                                FMV, audio). The engine provides the gameflow
                                and injections.
                            </p>
                        )}

                        <div className="field">
                            <span>Source files</span>
                            <div className="import-sources">
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={openArchivePicker}
                                    disabled={busy || picking !== null}
                                >
                                    Pick archive (.zip / .tar.gz)
                                </button>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={openFolderPicker}
                                    disabled={busy || picking !== null}
                                >
                                    Pick folder
                                </button>
                                {source.kind !== 'none' ? (
                                    <span className="import-source-label">
                                        {source.kind === 'archive'
                                            ? source.file.name
                                            : `${source.files.length} files`}
                                    </span>
                                ) : null}
                            </div>
                            <input
                                ref={archiveInput}
                                type="file"
                                accept=".zip,.tar,.gz,.tgz,.tar.gz"
                                style={{ display: 'none' }}
                                onChange={onArchivePicked}
                            />
                            <input
                                ref={dirInput}
                                type="file"
                                style={{ display: 'none' }}
                                onChange={onDirectoryPicked}
                                // @ts-expect-error — non-standard attribute for folder picking
                                webkitdirectory=""
                                multiple
                            />
                        </div>
                    </>
                ) : null}

                <label className="field">
                    <span>Engine version</span>
                    <select
                        value={engineVersion}
                        onChange={(e) => setEngineVersion(e.target.value)}
                        disabled={busy || engineVersions.length === 0}
                    >
                        {engineVersions.map((v) => (
                            <option key={v} value={v}>
                                {v}
                            </option>
                        ))}
                    </select>
                </label>

                {picking ? (
                    <div className="dialog-status">
                        <Spinner label={picking} />
                    </div>
                ) : null}

                {busy && importProgress ? (
                    <div className="dialog-status">
                        <ProgressBar
                            fraction={importProgress.fraction}
                            label={formatProgress(importProgress)}
                        />
                    </div>
                ) : null}

                {error ? <p className="error">{error}</p> : null}

                <div className="modal__actions">
                    <button
                        type="button"
                        className="btn"
                        onClick={onClose}
                        disabled={busy}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn btn--primary"
                        disabled={busy || picking !== null}
                    >
                        {busy ? 'Importing…' : 'Create'}
                    </button>
                </div>
            </form>
        </div>
    );
}

function slugify(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}

function formatProgress(p: { phase: string; fraction: number; bytes?: number; totalBytes?: number }): string {
    const pct = Math.round(p.fraction * 100);
    const label = p.phase === 'downloading' ? 'Downloading' : 'Extracting';
    if (p.bytes && p.totalBytes) {
        return `${label}… ${formatBytes(p.bytes)} / ${formatBytes(p.totalBytes)} (${pct}%)`;
    }
    return `${label}… ${pct}%`;
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
