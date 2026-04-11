import { cn } from "../utils";

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function getScoreColor(score: number) {
  if (score >= 70) return "border-green-500/40 text-green-400 bg-green-500/10";
  if (score >= 40) return "border-yellow-500/40 text-yellow-400 bg-yellow-500/10";
  return "border-gray-500/40 text-gray-400 bg-gray-500/10";
}

const sizes = {
  sm: "w-8 h-8 text-[11px]",
  md: "w-10 h-10 text-xs",
  lg: "w-14 h-14 text-lg border-2",
};

export function ScoreBadge({ score, size = "md", className }: ScoreBadgeProps) {
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-bold border shrink-0 tabular-nums",
        getScoreColor(score),
        sizes[size],
        className
      )}
    >
      {score}
    </div>
  );
}
