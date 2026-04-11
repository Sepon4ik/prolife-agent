"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronRight, Globe } from "lucide-react";
import { cn } from "@agency/ui";
import type { RegionGroup } from "./types";

interface CountrySidebarProps {
  regions: RegionGroup[];
  totalCount: number;
}

export function CountrySidebar({ regions, totalCount }: CountrySidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeCountry = searchParams.get("country") ?? "";
  const activeRegion = searchParams.get("region") ?? "";

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    // Auto-expand region that contains the active country
    const initial: Record<string, boolean> = {};
    for (const rg of regions) {
      if (
        activeRegion === rg.region ||
        rg.countries.some((c) => c.country === activeCountry)
      ) {
        initial[rg.region] = true;
      }
    }
    return initial;
  });

  function setFilter(country: string, region: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (country) {
      params.set("country", country);
      params.delete("region");
    } else if (region) {
      params.set("region", region);
      params.delete("country");
    } else {
      params.delete("country");
      params.delete("region");
    }
    router.push(`?${params.toString()}`, { scroll: false });
  }

  function toggleRegion(region: string) {
    setExpanded((prev) => ({ ...prev, [region]: !prev[region] }));
  }

  return (
    <div className="w-48 shrink-0 border-r border-white/5 pr-3 space-y-0.5">
      {/* All */}
      <button
        onClick={() => setFilter("", "")}
        className={cn(
          "w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors",
          !activeCountry && !activeRegion
            ? "bg-white/[0.08] text-white font-medium"
            : "text-gray-400 hover:bg-white/[0.04] hover:text-gray-200"
        )}
      >
        <span className="flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-gray-500" />
          All countries
        </span>
        <span className="text-[10px] text-gray-600">{totalCount}</span>
      </button>

      {/* Regions */}
      {regions.map((rg) => (
        <div key={rg.region}>
          {/* Region header */}
          <button
            onClick={() => {
              toggleRegion(rg.region);
              setFilter("", rg.region);
            }}
            className={cn(
              "w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors",
              activeRegion === rg.region && !activeCountry
                ? "bg-white/[0.08] text-white font-medium"
                : "text-gray-400 hover:bg-white/[0.04] hover:text-gray-200"
            )}
          >
            <span className="flex items-center gap-1">
              {expanded[rg.region] ? (
                <ChevronDown className="w-3 h-3 text-gray-600" />
              ) : (
                <ChevronRight className="w-3 h-3 text-gray-600" />
              )}
              {rg.region}
            </span>
            <span className="text-[10px] text-gray-600">{rg.total}</span>
          </button>

          {/* Countries */}
          {expanded[rg.region] && (
            <div className="ml-3 space-y-0.5 mt-0.5">
              {rg.countries.map((c) => (
                <button
                  key={c.country}
                  onClick={() => setFilter(c.country, "")}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-1 rounded-md text-xs transition-colors",
                    activeCountry === c.country
                      ? "bg-white/[0.08] text-white font-medium"
                      : "text-gray-500 hover:bg-white/[0.04] hover:text-gray-300"
                  )}
                >
                  <span className="truncate">{c.country}</span>
                  <span className="text-[10px] text-gray-600">{c.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
