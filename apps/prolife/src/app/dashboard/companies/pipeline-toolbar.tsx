"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Search, LayoutList, Columns3 } from "lucide-react";

const STATUSES = [
  "RAW",
  "ENRICHED",
  "SCORED",
  "OUTREACH_SENT",
  "REPLIED",
  "INTERESTED",
  "HANDED_OFF",
] as const;

const PRIORITIES = ["A", "B", "C"] as const;

const TYPES = [
  "DISTRIBUTOR",
  "PHARMACY_CHAIN",
  "RETAIL",
  "HYBRID",
  "UNKNOWN",
] as const;

const LABEL: Record<string, string> = {
  RAW: "Raw",
  ENRICHED: "Enriched",
  SCORED: "Scored",
  OUTREACH_SENT: "Outreach Sent",
  REPLIED: "Replied",
  INTERESTED: "Interested",
  HANDED_OFF: "Handed Off",
  DISTRIBUTOR: "Distributor",
  PHARMACY_CHAIN: "Pharmacy Chain",
  RETAIL: "Retail",
  HYBRID: "Hybrid",
  UNKNOWN: "Unknown",
  A: "A — Hot",
  B: "B — Warm",
  C: "C — Cold",
};

export function PipelineToolbar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const view = searchParams.get("view") ?? "table";
  const status = searchParams.get("status") ?? "";
  const priority = searchParams.get("priority") ?? "";
  const type = searchParams.get("type") ?? "";
  const country = searchParams.get("country") ?? "";
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

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      {/* View toggle */}
      <div className="flex items-center bg-white/[0.04] rounded-lg p-0.5 border border-white/5">
        <button
          onClick={() => setParam("view", "table")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === "table"
              ? "bg-white/[0.08] text-white"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <LayoutList className="w-3.5 h-3.5" />
          Table
        </button>
        <button
          onClick={() => setParam("view", "board")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === "board"
              ? "bg-white/[0.08] text-white"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <Columns3 className="w-3.5 h-3.5" />
          Board
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap flex-1">
        <FilterSelect
          value={status}
          onChange={(v) => setParam("status", v)}
          options={STATUSES}
          placeholder="Status"
        />
        <FilterSelect
          value={priority}
          onChange={(v) => setParam("priority", v)}
          options={PRIORITIES}
          placeholder="Priority"
        />
        <FilterSelect
          value={type}
          onChange={(v) => setParam("type", v)}
          options={TYPES}
          placeholder="Type"
        />
        <input
          type="text"
          value={country}
          onChange={(e) => setParam("country", e.target.value)}
          placeholder="Country"
          className="h-8 w-28 bg-white/[0.04] border border-white/5 rounded-lg px-2.5 text-xs text-white placeholder-gray-600 focus:border-primary-600/50 focus:outline-none"
        />

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
          <input
            type="text"
            value={q}
            onChange={(e) => setParam("q", e.target.value)}
            placeholder="Search..."
            className="h-8 w-44 bg-white/[0.04] border border-white/5 rounded-lg pl-8 pr-3 text-xs text-white placeholder-gray-600 focus:border-primary-600/50 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-8 bg-white/[0.04] border border-white/5 rounded-lg px-2.5 text-xs focus:border-primary-600/50 focus:outline-none appearance-none cursor-pointer pr-6 ${
        value ? "text-white" : "text-gray-600"
      }`}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 6px center",
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {LABEL[opt] ?? opt}
        </option>
      ))}
    </select>
  );
}
