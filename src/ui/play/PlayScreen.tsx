import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { buildAdapters } from '../../adapters';
import { engineAssetUrl, loadEngine } from '../../engine-loader/loadEngine';
import type { EngineFs, TrxEngine } from '../../engine-loader/trx-types';
import { listGamedata } from '../../gamedata/library';
import { getProfile, markProfilePlayed } from '../../profiles/store';
import { Spinner } from '../shared/Spinner';
import { GameCanvas } from './GameCanvas';

type State =
    | { kind: 'loading'; message: string }
    | { kind: 'awaiting-input' }
    | { kind: 'running' }
    | { kind: 'error'; message: string }
    | { kind: 'missing' };

export function PlayScreen() {
    const { profileId } = useParams<{ profileId: string }>();
    const navigate = useNavigate();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<TrxEngine | null>(null);
    const [state, setState] = useState<State>({ kind: 'loading', message: 'Starting…' });

    useEffect(() => {
        if (!profileId) {
            setState({ kind: 'missing' });
            return;
        }
        let cancelled = false;

        (async () => {
            try {
                setState({ kind: 'loading', message: 'Loading profile…' });
                const profile = await getProfile(profileId);
                if (!profile) {
                    if (!cancelled) setState({ kind: 'missing' });
                    return;
                }

                setState({
                    kind: 'loading',
                    message: `Loading engine ${profile.engineVersion}…`,
                });
                const { createTRX } = await loadEngine(profile.engineVersion);
                if (cancelled) return;

                setState({ kind: 'loading', message: 'Reading gamedata…' });
                const allGamedata = await listGamedata();
                const readyGamedata = allGamedata.filter((g) => g.status === 'ready');
                const profileGamedata = readyGamedata.find((g) => g.id === profile.gamedataId);
                if (!profileGamedata) {
                    if (!cancelled) {
                        setState({
                            kind: 'error',
                            message: "Profile's gamedata is not ready.",
                        });
                    }
                    return;
                }

                const canvas = canvasRef.current;
                if (!canvas) return;

                let fsRef: EngineFs | null = null;
                const getFs = () => {
                    if (!fsRef) throw new Error('engine fs not yet available');
                    return fsRef;
                };

                setState({ kind: 'loading', message: 'Creating engine…' });
                const { adapters, preStage } = buildAdapters({
                    profile,
                    readyGamedata,
                    canvas,
                    getFs,
                    onGateOpen: () => {
                        if (!cancelled) setState({ kind: 'awaiting-input' });
                    },
                    onGateClose: () => {
                        if (!cancelled) {
                            setState({ kind: 'running' });
                            // Canvas needs focus to receive keyboard events.
                            canvas.focus();
                        }
                    },
                });
                const engine = await createTRX({
                    canvas,
                    adapters,
                    wasmUrl: engineAssetUrl(profile.engineVersion, 'TRX.wasm'),
                    dataUrl: engineAssetUrl(profile.engineVersion, 'TRX.data'),
                    jsUrl: engineAssetUrl(profile.engineVersion, 'trx-engine.js'),
                });
                if (cancelled) return;
                engineRef.current = engine;
                fsRef = engine.fs;

                setState({ kind: 'loading', message: 'Staging game files…' });
                await preStage(engine.fs);
                if (cancelled) return;

                await markProfilePlayed(profile.id);
                const exitCode = await engine.run([
                    '--engine',
                    String(profile.engine),
                    '--mod',
                    profile.mod,
                ]);
                console.log('[play] engine.run resolved with exit code', exitCode);
                if (!cancelled) navigate('/', { replace: true });
            } catch (err) {
                if (!cancelled) {
                    console.error(err);
                    setState({ kind: 'error', message: (err as Error).message });
                }
            }
        })();

        return () => {
            cancelled = true;
            engineRef.current = null;
        };
    }, [profileId, navigate]);

    return (
        <div className="play">
            {state.kind === 'loading' ? (
                <div className="play__overlay">
                    <Spinner label={state.message} />
                </div>
            ) : null}
            {state.kind === 'awaiting-input' ? (
                <div className="play__overlay play__overlay--gate">
                    <h2>Ready</h2>
                    <p>Click anywhere or tap any button to continue.</p>
                </div>
            ) : null}
            {state.kind === 'error' ? (
                <div className="play__overlay">
                    <p className="error">{state.message}</p>
                    <button className="btn" onClick={() => navigate('/')}>
                        Back to library
                    </button>
                </div>
            ) : null}
            {state.kind === 'missing' ? (
                <div className="play__overlay">
                    <p>Profile not found.</p>
                    <button className="btn" onClick={() => navigate('/')}>
                        Back to library
                    </button>
                </div>
            ) : null}
            <GameCanvas
                ref={canvasRef}
                onResize={() => engineRef.current?.syncViewport()}
            />
        </div>
    );
}
