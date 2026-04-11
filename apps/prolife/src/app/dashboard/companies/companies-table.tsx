"use client";

import Link from "next/link";
import { ScoreBadge, StatusBadge, PriorityBadge, timeAgo } from "@agency/ui";
import type { PipelineCompany } from "./types";

interface CompaniesTableProps {
  companies: PipelineCompany[];
}

const PRIORITY_ORDER = ["A", "B", "C"] as const;
const PRIORITY_LABELS: Record<string, string> = {
  A: "Priority A — Hot",
  B: "Priority B — Warm",
  C: "Priority C — Cold",
};

export function CompaniesTable({ companies }: CompaniesTableProps) {
  const grouped = new Map<string, PipelineCompany[]>();
  for (const p of PRIORITY_ORDER) {
    grouped.set(p, []);
  }
  for (const c of companies) {
    const bucket = grouped.get(c.priority) ?? [];
    bucket.push(c);
    grouped.set(c.priority, bucket);
  }

  return (
    <div className="space-y-0">
      {PRIORITY_ORDER.map((priority) => {
        const items = grouped.get(priority)!;
        if (items.length === 0) return null;

        return (
          <div key={priority}>
            {/* Sticky group header */}
            <div className="sticky top-0 z-10 flex items-center gap-2.5 px-5 py-2 bg-dark border-b border-white/5">
              <PriorityBadge priority={priority} />
              <span className="text-xs text-gray-500">
                {PRIORITY_LABELS[priority]} ({items.length})
              </span>
            </div>

            {/* Table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-gray-600 text-left text-[11px]">
                  <th className="px-5 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Country</th>
                  <th className="px-4 py-2 font-medium w-16 text-center">Score</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Activity</th>
                </tr>
              </thead>
              <tbody>
                {items.map((company) => (
                  <tr
                    key={company.id}
                    className="border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors group"
                  >
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/dashboard/companies/${company.id}`}
                        className="text-sm font-medium text-white group-hover:text-primary-400 transition-colors truncate block max-w-[280px]"
                      >
                        {company.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-gray-400">
                        {company.type.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-gray-400">
                        {company.country}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-center">
                        <ScoreBadge score={company.score} size="sm" />
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={company.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="text-xs">
                        {company.emailCount > 0 && (
                          <span className="text-gray-400 tabular-nums">
                            {company.emailCount} email{company.emailCount !== 1 ? "s" : ""}
                            <span className="text-gray-700 mx-1">&middot;</span>
                          </span>
                        )}
                        <span className="text-gray-600 tabular-nums">
                          {timeAgo(new Date(company.updatedAt))}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
