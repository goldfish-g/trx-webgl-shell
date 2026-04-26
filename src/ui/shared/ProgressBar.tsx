interface Props {
    fraction: number;
    label?: string;
}

export function ProgressBar({ fraction, label }: Props) {
    const pct = Math.max(0, Math.min(1, fraction)) * 100;
    return (
        <div className="progress">
            <div className="progress__bar" style={{ width: `${pct}%` }} />
            {label ? <span className="progress__label">{label}</span> : null}
        </div>
    );
}
