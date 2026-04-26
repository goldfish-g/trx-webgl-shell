import { useEffect, useState } from 'react';
import { useLibraryStore } from '../../stores/libraryStore';
import { CreateProfileDialog } from './CreateProfileDialog';
import { ProfileCard } from './ProfileCard';

export function LibraryScreen() {
    const loaded = useLibraryStore((s) => s.loaded);
    const profiles = useLibraryStore((s) => s.profiles);
    const gamedata = useLibraryStore((s) => s.gamedata);
    const init = useLibraryStore((s) => s.init);
    const [showCreate, setShowCreate] = useState(false);

    useEffect(() => {
        if (!loaded) init();
    }, [loaded, init]);

    return (
        <div className="library">
            <header className="library__header">
                <h1>TRX Library</h1>
                <div className="library__actions">
                    <button
                        className="btn btn--primary"
                        onClick={() => setShowCreate(true)}
                    >
                        + New profile
                    </button>
                </div>
            </header>

            {!loaded ? (
                <p className="library__empty">Loading…</p>
            ) : profiles.length === 0 ? (
                <div className="library__empty">
                    <p>No profiles yet.</p>
                    <p>Create one to import game data or use an existing download.</p>
                </div>
            ) : (
                <div className="grid">
                    {profiles.map((profile) => (
                        <ProfileCard
                            key={profile.id}
                            profile={profile}
                            gamedata={gamedata.get(profile.gamedataId)}
                        />
                    ))}
                </div>
            )}

            {showCreate ? (
                <CreateProfileDialog onClose={() => setShowCreate(false)} />
            ) : null}
        </div>
    );
}
