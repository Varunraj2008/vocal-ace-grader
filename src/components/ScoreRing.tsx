import { cn } from "@/lib/utils";

export function ScoreRing({
  value,
  label,
  size = 96,
  suffix = "",
  className,
}: {
  value: number | null;
  label?: string;
  size?: number;
  suffix?: string;
  className?: string;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const stroke = Math.max(6, Math.round(size * 0.09));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="stroke-accent" fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            className="stroke-primary transition-[stroke-dashoffset] duration-700"
            strokeDasharray={c}
            strokeDashoffset={c - (pct / 100) * c}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-bold tabular-nums" style={{ fontSize: size * 0.24 }}>
            {value == null ? "—" : Math.round(value)}
            {value != null && suffix}
          </span>
        </div>
      </div>
      {label && <div className="text-xs text-muted-foreground text-center">{label}</div>}
    </div>
  );
}

export function MetricBar({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{value == null ? "Insufficient data" : Math.round(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-accent overflow-hidden">
        <div className="h-full rounded-full bg-brand-gradient transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
