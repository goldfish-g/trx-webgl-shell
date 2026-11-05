import { useEffect, useMemo, useRef, useState } from 'react';
import { loadEngineVersions } from '../engine/versions';
import { FEATURES } from '../features';
import {
    customMod,
    ENGINE_NAMES,
    findGame,
    GAMES,
    guessGame,
    type EngineNumber,
} from '../games/catalog';
import { importGameData } from '../gamedata/imports';
import { LayoutError, planLayout } from '../gamedata/layout';
import { loadServerCatalog } from '../gamedata/server';
import type { GameDataLayout, GameDataRecord, ServerGameData } from '../gamedata/types';
import { ArchiveError, readArchive, readFolder, type ArchiveEntry } from '../lib/archive';
import { createProfile } from '../profiles/store';
import { Dialog } from '../ui/Dialog';
import { formatBytes } from '../ui/format';
import { describeSource } from './describe';

type Choice =
    | { kind: 'library'; record: GameDataRecord }
    | { kind: 'server'; entry: ServerGameData }
    | { kind: 'upload'; name: string; entries: ArchiveEntry[] }
    | { kind: 'link'; url: string };

/** A game picked from the catalog, or a custom level for an engine. */
type GameKey = string;
const CUSTOM = 'custom:';

interface Target {
    mod: string;
    engine: EngineNumber;
    layout: GameDataLayout;
    title: string;
}

function resolveTarget(key: GameKey, levelName: string): Target | null {
    if (key.startsWith(CUSTOM)) {
        const engine = Number(key.slice(CUSTOM.length)) as EngineNumber;
        const name = levelName.trim();
        return name === '' ? null : { mod: customMod(name), engine, layout: 'custom', title: name };
    }
    const game = findGame(key);
    return game === undefined ? null : { mod: game.mod, engine: game.engine, layout: 'game', title: game.title };
}

function describeError(error: unknown): string {
    if (error instanceof ArchiveError || error instanceof LayoutError) return error.message;
    return error instanceof Error ? error.message : String(error);
}

function useAsync<T>(load: () => Promise<T>): { value: T | undefined; error: string | null } {
    const [state, setState] = useState<{ value: T | undefined; error: string | null }>({
        value: undefined,
        error: null,
    });
    useEffect(() => {
        let live = true;
        load().then(
            (value) => live && setState({ value, error: null }),
            (error: unknown) => live && setState({ value: undefined, error: describeError(error) }),
        );
        return () => {
            live = false;
        };
    }, [load]);
    return state;
}

interface Props {
    library: GameDataRecord[];
    onClose(): void;
}

export function NewProfileDialog({ library, onClose }: Props) {
    const catalog = useAsync(loadServerCatalog);
    const versions = useAsync(loadEngineVersions);
    const [choice, setChoice] = useState<Choice | null>(null);
    const [gameKey, setGameKey] = useState<GameKey>('tr1');
    const [levelName, setLevelName] = useState('');
    const [profileName, setProfileName] = useState('');
    const [nameEdited, setNameEdited] = useState(false);
    const [engineVersion, setEngineVersion] = useState<string | null>(null);
    const [reading, setReading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [linkUrl, setLinkUrl] = useState('');
    const fileInput = useRef<HTMLInputElement>(null);
    const folderInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        folderInput.current?.setAttribute('webkitdirectory', '');
    }, []);

    const usable = library.filter((record) => record.status !== 'failed');
    const installedEntries = new Set(
        library.flatMap((record) => (record.source.kind === 'server' ? [record.source.entryId] : [])),
    );
    const offered = (catalog.value ?? []).filter((entry) => !installedEntries.has(entry.id));
    const version = engineVersion ?? versions.value?.[0] ?? null;

    // What the new profile plays, once a choice says it.
    const target: Target | null = useMemo(() => {
        if (choice === null) return null;
        if (choice.kind === 'library') {
            const { mod, engine, layout, name } = choice.record;
            return { mod, engine, layout, title: findGame(mod)?.title ?? name };
        }
        if (choice.kind === 'server') {
            const { mod, engine, name } = choice.entry;
            return { mod, engine, layout: 'game', title: findGame(mod)?.title ?? name };
        }
        return resolveTarget(gameKey, levelName);
    }, [choice, gameKey, levelName]);

    // Checks that uploaded files make the game asked for, before anything is stored.
    const layoutProblem = useMemo(() => {
        if (choice?.kind !== 'upload' || target === null) return null;
        try {
            planLayout(choice.entries, target);
            return null;
        } catch (problem) {
            return describeError(problem);
        }
    }, [choice, target]);

    useEffect(() => {
        if (!nameEdited) setProfileName(target?.title ?? '');
    }, [target, nameEdited]);

    const pickUpload = async (name: string, read: () => Promise<ArchiveEntry[]> | ArchiveEntry[]) => {
        setError(null);
        setReading(true);
        try {
            const entries = await read();
            const guess = guessGame(entries.map((entry) => entry.path));
            if (guess !== undefined) setGameKey(guess.mod);
            setChoice({ kind: 'upload', name, entries });
        } catch (problem) {
            setError(describeError(problem));
        } finally {
            setReading(false);
        }
    };

    const create = async () => {
        if (choice === null || target === null || version === null) return;
        setBusy(true);
        setError(null);
        try {
            let gamedataId: string;
            switch (choice.kind) {
                case 'library':
                    gamedataId = choice.record.id;
                    break;
                case 'server': {
                    const { entry } = choice;
                    const record = await importGameData(
                        {
                            name: entry.name,
                            mod: entry.mod,
                            engine: entry.engine,
                            layout: 'game',
                            source: { kind: 'server', entryId: entry.id, url: entry.url },
                            sizeBytes: entry.sizeBytes,
                        },
                        { kind: 'download' },
                    );
                    gamedataId = record.id;
                    break;
                }
                case 'upload': {
                    const record = await importGameData(
                        { name: target.title, ...target, source: { kind: 'upload', name: choice.name } },
                        { kind: 'files', entries: choice.entries },
                    );
                    gamedataId = record.id;
                    break;
                }
                case 'link': {
                    const record = await importGameData(
                        { name: target.title, ...target, source: { kind: 'link', url: choice.url } },
                        { kind: 'download' },
                    );
                    gamedataId = record.id;
                    break;
                }
            }
            await createProfile({
                name: profileName.trim() || target.title,
                gamedataId,
                mod: target.mod,
                engine: target.engine,
                engineVersion: version,
            });
            onClose();
        } catch (problem) {
            setError(describeError(problem));
            setBusy(false);
        }
    };

    const needsGamePicker = choice?.kind === 'upload' || choice?.kind === 'link';
    const canCreate =
        choice !== null && target !== null && version !== null && layoutProblem === null && !busy && !reading;

    return (
        <Dialog
            title="New profile"
            onClose={onClose}
            actions={
                <>
                    <button className="button" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="button button--primary" disabled={!canCreate} onClick={() => void create()}>
                        {choice?.kind === 'server' ? 'Download and create' : 'Create profile'}
                    </button>
                </>
            }
        >
            <fieldset className="choices">
                <legend className="choices__legend">Game data</legend>

                {usable.length > 0 ? (
                    <div className="choices__group">
                        <p className="choices__heading">In your library</p>
                        {usable.map((record) => (
                            <ChoiceOption
                                key={record.id}
                                checked={choice?.kind === 'library' && choice.record.id === record.id}
                                onSelect={() => setChoice({ kind: 'library', record })}
                                title={record.name}
                                detail={`${ENGINE_NAMES[record.engine]} · ${describeSource(record.source)}${
                                    record.status === 'importing' ? ' · still importing' : ''
                                }`}
                            />
                        ))}
                    </div>
                ) : null}

                <div className="choices__group">
                    <p className="choices__heading">From the server</p>
                    {catalog.error !== null ? (
                        <p className="choices__note">The server's games could not be listed: {catalog.error}</p>
                    ) : catalog.value === undefined ? (
                        <p className="choices__note">Listing the server's games…</p>
                    ) : offered.length === 0 ? (
                        <p className="choices__note">
                            {catalog.value.length === 0
                                ? 'This server offers no games.'
                                : 'Everything the server offers is already in your library.'}
                        </p>
                    ) : (
                        offered.map((entry) => (
                            <ChoiceOption
                                key={entry.id}
                                checked={choice?.kind === 'server' && choice.entry.id === entry.id}
                                onSelect={() => setChoice({ kind: 'server', entry })}
                                title={entry.name}
                                detail={`${ENGINE_NAMES[entry.engine]} · download${
                                    entry.sizeBytes > 0 ? `, ${formatBytes(entry.sizeBytes)}` : ''
                                }`}
                            />
                        ))
                    )}
                </div>

                <div className="choices__group">
                    <p className="choices__heading">From this device</p>
                    <div className="choices__buttons">
                        <button className="button" disabled={reading} onClick={() => fileInput.current?.click()}>
                            Choose an archive…
                        </button>
                        <button className="button" disabled={reading} onClick={() => folderInput.current?.click()}>
                            Choose a folder…
                        </button>
                    </div>
                    <input
                        ref={fileInput}
                        type="file"
                        hidden
                        accept=".zip,.tar,.tgz,.gz,application/zip,application/x-tar,application/gzip"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file !== undefined) void pickUpload(file.name, () => readArchive(file));
                        }}
                    />
                    <input
                        ref={folderInput}
                        type="file"
                        hidden
                        multiple
                        onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);
                            event.target.value = '';
                            const folder = files[0]?.webkitRelativePath.split('/')[0] ?? 'folder';
                            if (files.length > 0) void pickUpload(folder, () => readFolder(files));
                        }}
                    />
                    {reading ? <p className="choices__note">Reading the files…</p> : null}
                    {choice?.kind === 'upload' ? (
                        <p className="choices__picked">
                            {choice.name} · {choice.entries.length} files
                        </p>
                    ) : null}
                </div>

                {FEATURES.linkSources ? (
                    <div className="choices__group">
                        <p className="choices__heading">From a link</p>
                        <div className="choices__buttons">
                            <input
                                className="field__input"
                                type="url"
                                placeholder="https://example.com/game.zip"
                                value={linkUrl}
                                onChange={(event) => setLinkUrl(event.target.value)}
                            />
                            <button
                                className="button"
                                disabled={!URL.canParse(linkUrl)}
                                onClick={() => setChoice({ kind: 'link', url: linkUrl })}
                            >
                                Use link
                            </button>
                        </div>
                    </div>
                ) : null}
            </fieldset>

            {choice !== null ? (
                <div className="fields">
                    {needsGamePicker ? (
                        <label className="field">
                            <span className="field__label">Game</span>
                            <select
                                className="field__input"
                                value={gameKey}
                                onChange={(event) => setGameKey(event.target.value)}
                            >
                                <optgroup label="Games">
                                    {GAMES.map((game) => (
                                        <option key={game.mod} value={game.mod}>
                                            {game.title}
                                        </option>
                                    ))}
                                </optgroup>
                                <optgroup label="Custom levels">
                                    {([1, 2, 3, 4] as const).map((engine) => (
                                        <option key={engine} value={`${CUSTOM}${engine}`}>
                                            Custom level for {ENGINE_NAMES[engine]}
                                        </option>
                                    ))}
                                </optgroup>
                            </select>
                        </label>
                    ) : null}
                    {needsGamePicker && gameKey.startsWith(CUSTOM) ? (
                        <label className="field">
                            <span className="field__label">Level name</span>
                            <input
                                className="field__input"
                                value={levelName}
                                maxLength={60}
                                onChange={(event) => setLevelName(event.target.value)}
                            />
                        </label>
                    ) : null}
                    <label className="field">
                        <span className="field__label">Profile name</span>
                        <input
                            className="field__input"
                            value={profileName}
                            maxLength={60}
                            onChange={(event) => {
                                setProfileName(event.target.value);
                                setNameEdited(true);
                            }}
                        />
                    </label>
                    <label className="field">
                        <span className="field__label">Engine</span>
                        <select
                            className="field__input"
                            value={version ?? ''}
                            disabled={versions.value === undefined || versions.value.length === 0}
                            onChange={(event) => setEngineVersion(event.target.value)}
                        >
                            {(versions.value ?? []).map((v, index) => (
                                <option key={v} value={v}>
                                    {v}
                                    {index === 0 ? ' (newest)' : ''}
                                </option>
                            ))}
                        </select>
                    </label>
                    {versions.error !== null ? (
                        <p className="dialog__error">The engine versions could not be listed: {versions.error}</p>
                    ) : null}
                    {versions.value?.length === 0 ? (
                        <p className="dialog__error">This server offers no engine builds.</p>
                    ) : null}
                </div>
            ) : null}

            {layoutProblem !== null ? <p className="dialog__error">{layoutProblem}</p> : null}
            {error !== null ? <p className="dialog__error">{error}</p> : null}
        </Dialog>
    );
}

interface ChoiceOptionProps {
    checked: boolean;
    onSelect(): void;
    title: string;
    detail: string;
}

function ChoiceOption({ checked, onSelect, title, detail }: ChoiceOptionProps) {
    return (
        <label className={checked ? 'choice choice--checked' : 'choice'}>
            <input type="radio" name="gamedata" checked={checked} onChange={onSelect} />
            <span className="choice__text">
                <span className="choice__title">{title}</span>
                <span className="choice__detail">{detail}</span>
            </span>
        </label>
    );
}
