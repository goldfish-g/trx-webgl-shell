import { useEffect, useMemo, useRef, useState } from 'react';
import { loadEngineVersions } from '../engine/versions';
import { FEATURES } from '../features';
import { customMod, ENGINE_NAMES, findGame, GAMES, type EngineNumber } from '../games/catalog';
import { detectGame, type Detection } from '../games/detect';
import { importGameData } from '../gamedata/imports';
import { LEVEL_CONVERTER_URL } from '../links';
import { LayoutError, loneLevelPath, planLayout } from '../gamedata/layout';
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
    | { kind: 'upload'; name: string; entries: ArchiveEntry[]; detection: Detection }
    | { kind: 'link'; url: string };

/** What the new profile plays. */
interface Target {
    /** The directory the game data goes into. */
    mod: string;
    engine: EngineNumber;
    layout: GameDataLayout;
    title: string;
    /** The mod the engine runs, which for a lone level is trN-level. */
    runMod: string;
    /** For a lone level, the one the engine starts. */
    startLevel?: string;
    /** The game this one needs alongside it to start. */
    needs?: string;
}

/** Reading uploaded files as what the detection found, or as a game the player picked. */
const AS_DETECTED = 'detected';

function describeError(error: unknown): string {
    if (error instanceof ArchiveError || error instanceof LayoutError) return error.message;
    return error instanceof Error ? error.message : String(error);
}

/** Reads an archive, or takes a lone level file as it is. */
async function readFileOrArchive(file: File): Promise<ArchiveEntry[]> {
    try {
        return await readArchive(file);
    } catch (error) {
        if (error instanceof ArchiveError && /\.(phd|tub|tr2|tr4)$/i.test(file.name)) return readFolder([file]);
        throw error;
    }
}

function basename(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1).toLowerCase();
}

function gameTarget(mod: string): Target | null {
    const game = findGame(mod);
    if (game === undefined) return null;
    return {
        mod: game.mod,
        engine: game.engine,
        layout: 'game',
        title: game.title,
        runMod: game.mod,
        needs: game.requires,
    };
}

function detectedTarget(detection: Detection, level: string): Target | null {
    switch (detection.kind) {
        case 'game':
            return gameTarget(detection.game.mod);
        case 'custom':
            return {
                mod: customMod(detection.name),
                engine: detection.engine,
                layout: 'custom',
                title: detection.name,
                runMod: customMod(detection.name),
                needs: detection.extendsMod ?? undefined,
            };
        case 'level': {
            const name = basename(level);
            const title = name.replace(/\.[^.]+$/, '');
            const mod = customMod(title);
            return {
                mod,
                engine: detection.engine,
                layout: 'level',
                title,
                runMod: `tr${detection.engine}-level`,
                startLevel: loneLevelPath(mod, name),
                needs: `tr${detection.engine}`,
            };
        }
        case 'convert':
        case 'unknown':
            return null;
    }
}

function describeDetection(detection: Detection): string {
    switch (detection.kind) {
        case 'game': {
            const { game, found, expected } = detection;
            return found === expected
                ? `Recognised as ${game.title}, with all ${expected} of its levels.`
                : `Recognised as ${game.title}, but only ${found} of its ${expected} levels are here. The game stops where a level is missing.`;
        }
        case 'custom':
            return `A custom level for ${ENGINE_NAMES[detection.engine]}, “${detection.name}”, with its own gameflow.`;
        case 'level':
            return detection.levels.length === 1
                ? `A level file for ${ENGINE_NAMES[detection.engine]}, which the engine plays on its own.`
                : `${detection.levels.length} level files for ${ENGINE_NAMES[detection.engine]}, which the engine plays one at a time.`;
        case 'convert':
            return `${detection.reason} Convert it with the TRX Level Converter first, then add what it gives you here.`;
        case 'unknown':
            return detection.reason;
    }
}

/** How the game picker offers what the detection found, if it found something to play. */
function labelDetected(detection: Detection): string | null {
    switch (detection.kind) {
        case 'game':
            return `${detection.game.title} (recognised)`;
        case 'custom':
        case 'level':
            return `A custom level for ${ENGINE_NAMES[detection.engine]} (recognised)`;
        case 'convert':
        case 'unknown':
            return null;
    }
}

/** Reading uploaded files as no game yet, until the player picks one. */
const UNCHOSEN = '';

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
    const [gameKey, setGameKey] = useState<string>(AS_DETECTED);
    const [level, setLevel] = useState('');
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

    const target: Target | null = useMemo(() => {
        if (choice === null) return null;
        switch (choice.kind) {
            case 'library': {
                const { mod, engine, layout, name, startLevel } = choice.record;
                return {
                    mod,
                    engine,
                    layout,
                    title: findGame(mod)?.title ?? name,
                    runMod: layout === 'level' ? `tr${engine}-level` : mod,
                    startLevel,
                };
            }
            case 'server':
                return gameTarget(choice.entry.mod);
            case 'upload':
                if (choice.detection.kind === 'convert') return null;
                return gameKey === AS_DETECTED ? detectedTarget(choice.detection, level) : gameTarget(gameKey);
            case 'link':
                return gameKey === AS_DETECTED ? null : gameTarget(gameKey);
        }
    }, [choice, gameKey, level]);

    // Checks that uploaded files make what was asked for, before anything is stored.
    const layoutProblem = useMemo(() => {
        if (choice?.kind !== 'upload') return null;
        if (target === null) return null;
        try {
            planLayout(choice.entries, target);
            return null;
        } catch (problem) {
            return describeError(problem);
        }
    }, [choice, target]);

    // A custom level or an expansion builds on a game, which has to be in the library too.
    const missingBase = useMemo(() => {
        if (target?.needs === undefined || choice?.kind === 'library') return null;
        const present = library.some((record) => record.mod === target.needs && record.status !== 'failed');
        return present ? null : (findGame(target.needs)?.title ?? target.needs);
    }, [target, choice, library]);

    useEffect(() => {
        if (!nameEdited) setProfileName(target?.title ?? '');
    }, [target, nameEdited]);

    const pickUpload = async (name: string, read: () => Promise<ArchiveEntry[]> | ArchiveEntry[]) => {
        setError(null);
        setReading(true);
        try {
            const entries = await read();
            const detection = await detectGame(entries);
            setGameKey(detection.kind === 'unknown' || detection.kind === 'convert' ? UNCHOSEN : AS_DETECTED);
            setLevel(detection.kind === 'level' ? (detection.levels[0] ?? '') : '');
            setChoice({ kind: 'upload', name, entries, detection });
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
            const meta = {
                name: target.title,
                mod: target.mod,
                engine: target.engine,
                layout: target.layout,
                startLevel: target.startLevel,
            };
            switch (choice.kind) {
                case 'library':
                    gamedataId = choice.record.id;
                    break;
                case 'server': {
                    const { entry } = choice;
                    const record = await importGameData(
                        {
                            ...meta,
                            name: entry.name,
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
                        { ...meta, source: { kind: 'upload', name: choice.name } },
                        { kind: 'files', entries: choice.entries },
                    );
                    gamedataId = record.id;
                    break;
                }
                case 'link': {
                    const record = await importGameData(
                        { ...meta, source: { kind: 'link', url: choice.url } },
                        { kind: 'download' },
                    );
                    gamedataId = record.id;
                    break;
                }
            }
            await createProfile({
                name: profileName.trim() || target.title,
                gamedataId,
                mod: target.runMod,
                engine: target.engine,
                engineVersion: version,
            });
            onClose();
        } catch (problem) {
            setError(describeError(problem));
            setBusy(false);
        }
    };

    const detection = choice?.kind === 'upload' ? choice.detection : null;
    const detectedLabel = detection === null ? null : labelDetected(detection);
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
                            Choose a file…
                        </button>
                        <button className="button" disabled={reading} onClick={() => folderInput.current?.click()}>
                            Choose a folder…
                        </button>
                    </div>
                    <input
                        ref={fileInput}
                        type="file"
                        hidden
                        accept=".zip,.tar,.tgz,.gz,.phd,.tub,.tr2,.tr4,application/zip,application/x-tar,application/gzip"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file !== undefined) void pickUpload(file.name, () => readFileOrArchive(file));
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
                        <div className="choices__picked">
                            <p>
                                {choice.name} · {choice.entries.length} files
                            </p>
                            <p
                                className={
                                    choice.detection.kind === 'unknown' || choice.detection.kind === 'convert'
                                        ? 'dialog__error'
                                        : 'choices__note'
                                }
                            >
                                {describeDetection(choice.detection)}
                            </p>
                            {choice.detection.kind === 'convert' && LEVEL_CONVERTER_URL !== null ? (
                                <a className="button" href={LEVEL_CONVERTER_URL} target="_blank" rel="noreferrer">
                                    Open the TRX Level Converter
                                </a>
                            ) : null}
                        </div>
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
                                onClick={() => {
                                    setGameKey(UNCHOSEN);
                                    setChoice({ kind: 'link', url: linkUrl });
                                }}
                            >
                                Use link
                            </button>
                        </div>
                    </div>
                ) : null}
            </fieldset>

            {choice !== null ? (
                <div className="fields">
                    {(choice.kind === 'upload' && choice.detection.kind !== 'convert') || choice.kind === 'link' ? (
                        <label className="field">
                            <span className="field__label">These files are</span>
                            <select
                                className="field__input"
                                value={gameKey}
                                onChange={(event) => setGameKey(event.target.value)}
                            >
                                {gameKey === UNCHOSEN ? (
                                    <option value={UNCHOSEN} disabled>
                                        Choose the game
                                    </option>
                                ) : null}
                                {detectedLabel !== null ? <option value={AS_DETECTED}>{detectedLabel}</option> : null}
                                <optgroup label="Games">
                                    {GAMES.map((game) => (
                                        <option key={game.mod} value={game.mod}>
                                            {game.title}
                                        </option>
                                    ))}
                                </optgroup>
                            </select>
                        </label>
                    ) : null}
                    {detection?.kind === 'level' && gameKey === AS_DETECTED && detection.levels.length > 1 ? (
                        <label className="field">
                            <span className="field__label">Start with</span>
                            <select
                                className="field__input"
                                value={level}
                                onChange={(event) => setLevel(event.target.value)}
                            >
                                {detection.levels.map((path) => (
                                    <option key={path} value={path}>
                                        {basename(path)}
                                    </option>
                                ))}
                            </select>
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

            {missingBase !== null ? (
                <p className="dialog__warning">
                    This builds on {missingBase}, which is not in your library. Add {missingBase} as well, or it will
                    not start.
                </p>
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
