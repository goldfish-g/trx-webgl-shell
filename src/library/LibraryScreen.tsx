import { useEffect, useState } from 'react';
import { resumeInterruptedImports } from '../gamedata/imports';
import { GameDataSection } from './GameDataSection';
import { NewProfileDialog } from './NewProfileDialog';
import { ProfileCard } from './ProfileCard';
import { refreshLibrary, useLibrary } from './store';

let resumed = false;

export function LibraryScreen() {
    const { loaded, profiles, gamedata } = useLibrary();
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        void refreshLibrary();
        // Downloads a reload cut short carry on, once per page.
        if (!resumed) {
            resumed = true;
            void resumeInterruptedImports();
        }
    }, []);

    return (
        <main className="library">
            <header className="library__header">
                <div>
                    <h1 className="library__title">TRX</h1>
                    <p className="library__subtitle">Tomb Raider I–IV, in the browser</p>
                </div>
                <button className="button button--primary" onClick={() => setCreating(true)}>
                    New profile
                </button>
            </header>

            <section className="section">
                <div className="section__header">
                    <h2 className="section__title">Profiles</h2>
                </div>
                {loaded && profiles.length === 0 ? (
                    <div className="empty">
                        <p>No profiles yet.</p>
                        <p>
                            A profile plays one game with saves of its own. Make one from a game the server offers,
                            or from your own copy.
                        </p>
                        <button className="button button--primary" onClick={() => setCreating(true)}>
                            New profile
                        </button>
                    </div>
                ) : (
                    <div className="cards">
                        {profiles.map((profile) => (
                            <ProfileCard
                                key={profile.id}
                                profile={profile}
                                gamedata={gamedata.find((record) => record.id === profile.gamedataId)}
                            />
                        ))}
                    </div>
                )}
            </section>

            <GameDataSection gamedata={gamedata} profiles={profiles} />

            {creating ? <NewProfileDialog library={gamedata} onClose={() => setCreating(false)} /> : null}
        </main>
    );
}
