import { cn } from "../utils";

const statusStyles: Record<string, string> = {
  RAW: "bg-gray-500/15 text-gray-400",
  ENRICHED: "bg-blue-500/15 text-blue-400",
  SCORED: "bg-purple-500/15 text-purple-400",
  OUTREACH_SENT: "bg-yellow-500/15 text-yellow-400",
  REPLIED: "bg-cyan-500/15 text-cyan-400",
  INTERESTED: "bg-green-500/15 text-green-400",
  NOT_INTERESTED: "bg-red-500/15 text-red-400",
  HANDED_OFF: "bg-emerald-500/15 text-emerald-400",
  DISQUALIFIED: "bg-rose-500/15 text-rose-400",
  // Email statuses
  QUEUED: "bg-gray-500/15 text-gray-400",
  SENT: "bg-blue-500/15 text-blue-400",
  DELIVERED: "bg-cyan-500/15 text-cyan-400",
  OPENED: "bg-purple-500/15 text-purple-400",
  CLICKED: "bg-indigo-500/15 text-indigo-400",
  BOUNCED: "bg-orange-500/15 text-orange-400",
  FAILED: "bg-red-500/15 text-red-400",
  // Job statuses
  pending: "bg-gray-500/15 text-gray-400",
  running: "bg-blue-500/15 text-blue-400 animate-pulse",
  completed: "bg-green-500/15 text-green-400",
  failed: "bg-red-500/15 text-red-400",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const label = status.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium",
        statusStyles[status] ?? "bg-gray-500/15 text-gray-400",
        className
      )}
    >
      {label}
    </span>
  );
}
