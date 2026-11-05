import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
    title: string;
    onClose(): void;
    children: ReactNode;
    /** The buttons along the bottom. */
    actions?: ReactNode;
}

/** A modal dialog on the platform's <dialog>, which handles focus and Escape. */
export function Dialog({ title, onClose, children, actions }: Props) {
    const ref = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = ref.current;
        if (dialog !== null && !dialog.open) dialog.showModal();
    }, []);

    return (
        <dialog
            ref={ref}
            className="dialog"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={(event) => {
                if (event.target === ref.current) onClose();
            }}
        >
            <div className="dialog__body">
                <h2 className="dialog__title">{title}</h2>
                {children}
                {actions !== undefined ? <div className="dialog__actions">{actions}</div> : null}
            </div>
        </dialog>
    );
}

interface ConfirmProps {
    title: string;
    children: ReactNode;
    confirmLabel: string;
    onConfirm(): void;
    onClose(): void;
}

export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onClose }: ConfirmProps) {
    return (
        <Dialog
            title={title}
            onClose={onClose}
            actions={
                <>
                    <button className="button" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className="button button--danger"
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                    >
                        {confirmLabel}
                    </button>
                </>
            }
        >
            {children}
        </Dialog>
    );
}
