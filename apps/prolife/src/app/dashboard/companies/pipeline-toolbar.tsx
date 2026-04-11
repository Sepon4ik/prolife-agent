"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Search, FolderOpen, FolderSearch, CheckCircle2, Trash2 } from "lucide-react";
import { cn } from "@agency/ui";
import type { PipelineStage } from "@agency/db";
import type { StageCounts } from "./types";
import { STAGE_LABELS } from "./types";

const STAGE_ICONS: Record<PipelineStage, React.ElementType> = {
  NEW: FolderOpen,
  DEEP_RESEARCH: FolderSearch,
  LAST_STAGE: CheckCircle2,
  TRASH: Trash2,
};

const STAGE_TAB_COLORS: Record<PipelineStage, string> = {
  NEW: "border-blue-500 text-blue-400",
  DEEP_RESEARCH: "border-amber-500 text-amber-400",
  LAST_STAGE: "border-green-500 text-green-400",
  TRASH: "border-red-500 text-red-400",
};

interface PipelineToolbarProps {
  stageCounts: StageCounts;
}

export function PipelineToolbar({ stageCounts }: PipelineToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeStage = (searchParams.get("stage") ?? "NEW") as PipelineStage;
  const q = searchParams.get("q") ?? "";

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const stages: PipelineStage[] = [
    "NEW",
    "DEEP_RESEARCH",
    "LAST_STAGE",
    "TRASH",
  ];

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      {/* Stage tabs */}
      <div className="flex items-center gap-1 bg-white/[0.02] rounded-lg p-1 border border-white/5">
        {stages.map((stage) => {
          const Icon = STAGE_ICONS[stage];
          const isActive = activeStage === stage;
          const count = stageCounts[stage];

          return (
            <button
              key={stage}
              onClick={() => setParam("stage", stage)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border-b-2",
                isActive
                  ? `bg-white/[0.06] ${STAGE_TAB_COLORS[stage]}`
                  : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {STAGE_LABELS[stage]}
              <span
                className={cn(
                  "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                  isActive
                    ? "bg-white/[0.1] text-current"
                    : "bg-white/[0.04] text-gray-600"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative ml-auto">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
        <input
          type="text"
          value={q}
          onChange={(e) => setParam("q", e.target.value)}
          placeholder="Search..."
          className="h-8 w-52 bg-white/[0.04] border border-white/5 rounded-lg pl-8 pr-3 text-xs text-white placeholder-gray-600 focus:border-primary-600/50 focus:outline-none"
        />
      </div>
    </div>
  );
}
