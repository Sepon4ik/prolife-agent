import { cn } from "../utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  subtitle?: string;
  subtitleColor?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function KpiCard({
  title,
  value,
  delta,
  deltaLabel,
  subtitle,
  subtitleColor,
  icon,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "bg-dark-secondary rounded-xl border border-white/5 p-4",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-wider">
          {title}
        </p>
        {icon && <div className="text-gray-600">{icon}</div>}
      </div>
      <p className="text-3xl font-bold text-white mt-1 tabular-nums">
        {value}
      </p>
      {delta !== undefined && delta > 0 && (
        <p className="text-xs text-green-400 mt-1">
          +{delta} {deltaLabel}
        </p>
      )}
      {delta !== undefined && delta === 0 && (
        <p className="text-xs text-gray-600 mt-1">No change {deltaLabel}</p>
      )}
      {subtitle && (
        <p className={cn("text-xs mt-1", subtitleColor ?? "text-gray-500")}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
