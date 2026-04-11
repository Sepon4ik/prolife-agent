"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Trash2,
  RotateCcw,
  ChevronDown,
} from "lucide-react";
import { cn } from "@agency/ui";
import { ScoreBadge, PriorityBadge, StatusBadge } from "@agency/ui";
import type { PipelineStage, SalesStatus } from "@agency/db";
import { moveToStage, setSalesStatus } from "./actions";
import { TrashReasonDialog } from "./trash-reason-dialog";
import type { PipelineCompany } from "./types";
import {
  STAGE_LABELS,
  SALES_STATUS_LABELS,
  SALES_STATUS_COLORS,
} from "./types";

interface CompaniesTableProps {
  companies: PipelineCompany[];
  activeStage: PipelineStage;
}

export function CompaniesTable({ companies, activeStage }: CompaniesTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trashDialogIds, setTrashDialogIds] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === companies.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(companies.map((c) => c.id)));
    }
  }

  function handleMove(companyId: string, stage: PipelineStage) {
    if (stage === "TRASH") {
      setTrashDialogIds([companyId]);
      return;
    }
    startTransition(async () => {
      await moveToStage({ companyId, stage });
      setSelected(new Set());
    });
  }

  function handleBulkTrash() {
    setTrashDialogIds(Array.from(selected));
  }

  function handleBulkMove(stage: PipelineStage) {
    if (stage === "TRASH") {
      handleBulkTrash();
      return;
    }
    startTransition(async () => {
      const { bulkMoveToStage } = await import("./actions");
      await bulkMoveToStage({ companyIds: Array.from(selected), stage });
      setSelected(new Set());
    });
  }

  function handleSalesStatusChange(companyId: string, status: SalesStatus) {
    startTransition(async () => {
      await setSalesStatus({ companyId, salesStatus: status });
    });
  }

  // Available move targets depend on current stage
  const moveTargets = getMoveTargets(activeStage);

  return (
    <>
      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary-600/10 border-b border-primary-600/20">
          <span className="text-xs text-primary-400 font-medium">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-1 ml-2">
            {moveTargets.map((stage) => (
              <button
                key={stage}
                onClick={() => handleBulkMove(stage)}
                disabled={isPending}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  stage === "TRASH"
                    ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                    : "bg-white/[0.06] text-gray-300 hover:bg-white/[0.1]"
                )}
              >
                {stage === "TRASH" ? (
                  <Trash2 className="w-3 h-3" />
                ) : (
                  <ArrowRight className="w-3 h-3" />
                )}
                {STAGE_LABELS[stage]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/5">
            <th className="w-10 px-4 py-2.5">
              <input
                type="checkbox"
                checked={
                  companies.length > 0 && selected.size === companies.length
                }
                onChange={toggleAll}
                className="rounded border-gray-600 bg-transparent"
              />
            </th>
            <th className="text-left px-3 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              Company
            </th>
            <th className="text-left px-3 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              Country
            </th>
            <th className="text-left px-3 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th className="text-center px-3 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              Score
            </th>
            <th className="text-center px-3 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              Priority
            </th>
            {activeStage === "LAST_STAGE" && (
              <th className="text-left px-3 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                Sales Status
              </th>
            )}
            {activeStage === "TRASH" && (
              <th className="text-left px-3 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                Reason
              </th>
            )}
            <th className="text-right px-4 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => (
            <tr
              key={company.id}
              className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
            >
              <td className="px-4 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(company.id)}
                  onChange={() => toggleSelect(company.id)}
                  className="rounded border-gray-600 bg-transparent"
                />
              </td>
              <td className="px-3 py-2">
                <Link
                  href={`/dashboard/companies/${company.id}`}
                  className="text-sm text-white hover:text-primary-400 transition-colors font-medium"
                >
                  {company.name}
                </Link>
              </td>
              <td className="px-3 py-2 text-xs text-gray-400">
                {company.country}
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={company.type} />
              </td>
              <td className="px-3 py-2 text-center">
                <ScoreBadge score={company.score} />
              </td>
              <td className="px-3 py-2 text-center">
                <PriorityBadge priority={company.priority} />
              </td>
              {activeStage === "LAST_STAGE" && (
                <td className="px-3 py-2">
                  <SalesStatusDropdown
                    value={company.salesStatus}
                    onChange={(status) =>
                      handleSalesStatusChange(company.id, status)
                    }
                    disabled={isPending}
                  />
                </td>
              )}
              {activeStage === "TRASH" && (
                <td className="px-3 py-2">
                  <span className="text-xs text-gray-500 line-clamp-1">
                    {company.trashReason ?? "—"}
                  </span>
                </td>
              )}
              <td className="px-4 py-2 text-right">
                <RowActions
                  companyId={company.id}
                  activeStage={activeStage}
                  moveTargets={moveTargets}
                  onMove={handleMove}
                  isPending={isPending}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Trash dialog */}
      {trashDialogIds && (
        <TrashReasonDialog
          companyIds={trashDialogIds}
          onClose={() => setTrashDialogIds(null)}
          onSuccess={() => {
            setTrashDialogIds(null);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function SalesStatusDropdown({
  value,
  onChange,
  disabled,
}: {
  value: SalesStatus | null;
  onChange: (status: SalesStatus) => void;
  disabled: boolean;
}) {
  const statuses: SalesStatus[] = [
    "READY_TO_WORK",
    "IN_PROGRESS",
    "POTENTIAL_CONTRACT",
    "DONE",
  ];

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value as SalesStatus)}
      disabled={disabled}
      className={cn(
        "text-[11px] font-medium px-2 py-0.5 rounded-md border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-600/50",
        value ? SALES_STATUS_COLORS[value] : "bg-gray-500/20 text-gray-400"
      )}
    >
      {!value && <option value="">—</option>}
      {statuses.map((s) => (
        <option key={s} value={s}>
          {SALES_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

function RowActions({
  companyId,
  activeStage,
  moveTargets,
  onMove,
  isPending,
}: {
  companyId: string;
  activeStage: PipelineStage;
  moveTargets: PipelineStage[];
  onMove: (companyId: string, stage: PipelineStage) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (activeStage === "TRASH") {
    return (
      <button
        onClick={() => onMove(companyId, "NEW")}
        disabled={isPending}
        className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
        title="Restore to New"
      >
        <RotateCcw className="w-3 h-3" />
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
      >
        Move
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-dark-secondary border border-white/10 rounded-lg shadow-xl py-1 min-w-[140px]">
            {moveTargets.map((stage) => (
              <button
                key={stage}
                onClick={() => {
                  setOpen(false);
                  onMove(companyId, stage);
                }}
                disabled={isPending}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2",
                  stage === "TRASH"
                    ? "text-red-400 hover:bg-red-500/10"
                    : "text-gray-300 hover:bg-white/[0.06]"
                )}
              >
                {stage === "TRASH" ? (
                  <Trash2 className="w-3 h-3" />
                ) : (
                  <ArrowRight className="w-3 h-3" />
                )}
                {STAGE_LABELS[stage]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function getMoveTargets(currentStage: PipelineStage): PipelineStage[] {
  switch (currentStage) {
    case "NEW":
      return ["DEEP_RESEARCH", "LAST_STAGE", "TRASH"];
    case "DEEP_RESEARCH":
      return ["LAST_STAGE", "NEW", "TRASH"];
    case "LAST_STAGE":
      return ["DEEP_RESEARCH", "NEW", "TRASH"];
    case "TRASH":
      return ["NEW"];
    default:
      return [];
  }
}
