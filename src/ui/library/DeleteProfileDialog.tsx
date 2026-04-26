import { useLibraryStore } from '../../stores/libraryStore';
import type { ProfileRecord } from '../../types';

interface Props {
    profile: ProfileRecord;
    onClose: () => void;
}

export function DeleteProfileDialog({ profile, onClose }: Props) {
    const deleteProfile = useLibraryStore((s) => s.deleteProfile);

    async function onConfirm() {
        await deleteProfile(profile.id);
        onClose();
    }

    return (
        <div className="modal" role="dialog" aria-modal="true">
            <div className="modal__panel">
                <h2>Delete profile</h2>
                <p>
                    Remove <strong>{profile.name}</strong>? If no other profile references
                    its gamedata, the imported files will also be deleted. Saves stored on
                    the engine side remain under <code>/persist/{profile.mod}</code>.
                </p>
                <div className="modal__actions">
                    <button className="btn" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn--danger" onClick={onConfirm}>
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
