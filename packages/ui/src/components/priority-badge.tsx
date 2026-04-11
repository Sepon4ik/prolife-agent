import { cn } from "../utils";

const priorityStyles = {
  A: {
    label: "Горячий",
    bg: "bg-green-500/10",
    text: "text-green-400",
    border: "border-green-500/30",
    bar: "bg-green-500",
  },
  B: {
    label: "Теплый",
    bg: "bg-yellow-500/10",
    text: "text-yellow-400",
    border: "border-yellow-500/30",
    bar: "bg-yellow-500",
  },
  C: {
    label: "Холодный",
    bg: "bg-gray-500/10",
    text: "text-gray-400",
    border: "border-gray-500/30",
    bar: "bg-gray-500",
  },
} as const;

type Priority = keyof typeof priorityStyles;

interface PriorityBadgeProps {
  priority: string;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const p = priority as Priority;
  const cfg = priorityStyles[p] ?? priorityStyles.C;
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border",
        cfg.bg,
        cfg.text,
        cfg.border,
        className
      )}
    >
      {cfg.label}
    </span>
  );
}

export { priorityStyles };
export type { Priority };
