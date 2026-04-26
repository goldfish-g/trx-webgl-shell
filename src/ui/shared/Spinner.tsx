export function Spinner({ label }: { label?: string }) {
    return (
        <div className="spinner">
            <div className="spinner__dot" />
            {label ? <span>{label}</span> : null}
        </div>
    );
}
