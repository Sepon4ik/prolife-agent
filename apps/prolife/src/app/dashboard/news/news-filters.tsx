"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";
import { Search, X, Filter, Globe, MapPin } from "lucide-react";

interface FilterOption {
  value: string;
  label: string;
  count: number;
}

interface NewsFiltersProps {
  categories: FilterOption[];
  topics: FilterOption[];
  countries: string[];
  currentCategory?: string;
  currentTopic?: string;
  currentCountry?: string;
  currentQuery?: string;
  currentPeriod?: string;
  currentPcat?: string;
}

// ProLife target markets grouped by region
const REGIONS = [
  {
    label: "APAC",
    countries: ["Indonesia", "Philippines", "Vietnam", "Thailand", "Malaysia", "Singapore", "South Korea", "Bangladesh", "Sri Lanka", "Nepal"],
  },
  {
    label: "MENA",
    countries: ["UAE", "United Arab Emirates", "Turkey", "Pakistan"],
  },
  {
    label: "Europe",
    countries: ["Romania", "Czech Republic", "Hungary", "Austria", "Netherlands", "Poland", "Germany", "Switzerland", "Belgium", "France", "Italy", "Spain", "UK"],
  },
  {
    label: "Africa",
    countries: ["Nigeria", "Kenya", "South Africa"],
  },
];

// ProLife product categories (what Pavel actually sells)
const PROLIFE_CATEGORIES = [
  { value: "vitamins", label: "Витамины", keywords: "vitamin supplement nutraceutical" },
  { value: "medtech", label: "Медтехника", keywords: "medical device monitor tonometer nebulizer thermometer oximeter" },
  { value: "dermo", label: "Дерма", keywords: "dermo-cosmetic skincare dermatology cosmetic" },
  { value: "baby", label: "Бэби", keywords: "baby infant pediatric children nutrition" },
  { value: "homecare", label: "Домашнее", keywords: "home health home care home medical equipment" },
];

const periods = [
  { value: "today", label: "Сегодня" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "", label: "Все" },
];

export function NewsFilters({
  categories,
  topics,
  countries,
  currentCategory,
  currentTopic,
  currentCountry,
  currentQuery,
  currentPeriod,
  currentPcat,
}: NewsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(currentQuery ?? "");

  const hasFilters = currentCategory || currentTopic || currentCountry || currentQuery || currentPeriod || currentPcat;

  const updateFilter = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/dashboard/news?${params.toString()}`);
    },
    [router, searchParams]
  );

  const updateMultiple = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      router.push(`/dashboard/news?${params.toString()}`);
    },
    [router, searchParams]
  );

  const clearAll = useCallback(() => {
    router.push("/dashboard/news");
    setQuery("");
  }, [router]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      updateFilter("q", query || undefined);
    },
    [query, updateFilter]
  );

  // Check if current country is in a region
  const activeRegion = REGIONS.find((r) =>
    r.countries.some((c) => c === currentCountry)
  );

  // ProLife category toggle (separate from free-text search)
  const handleProlifeCategory = useCallback(
    (cat: (typeof PROLIFE_CATEGORIES)[number]) => {
      updateFilter("pcat", currentPcat === cat.value ? undefined : cat.value);
    },
    [currentPcat, updateFilter]
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1: Country quick-select */}
      <div className="flex items-center gap-2 flex-wrap">
        <Globe className="w-3.5 h-3.5 text-gray-600 shrink-0" />

        {/* Region pills */}
        {REGIONS.map((region) => {
          // Check if any of this region's countries match available data
          const available = region.countries.filter((c) => countries.includes(c));
          if (available.length === 0) return null;

          const isActive = activeRegion?.label === region.label;

          return (
            <div key={region.label} className="flex items-center">
              <span className="text-[10px] text-gray-600 mr-1">{region.label}:</span>
              <div className="flex gap-0.5">
                {available.slice(0, 6).map((country) => (
                  <button
                    key={country}
                    onClick={() =>
                      updateFilter("country", currentCountry === country ? undefined : country)
                    }
                    className={`px-2 py-1 rounded text-[11px] transition-colors ${
                      currentCountry === country
                        ? "bg-primary-600/20 text-primary-400 font-medium"
                        : "text-gray-400 hover:bg-white/[0.04] hover:text-gray-200"
                    }`}
                  >
                    {country.length > 10 ? country.slice(0, 8) + "..." : country}
                  </button>
                ))}
              </div>
              <span className="text-gray-800 mx-1">|</span>
            </div>
          );
        })}

        {/* All countries dropdown for those not in quick-select */}
        <select
          value={currentCountry ?? ""}
          onChange={(e) => updateFilter("country", e.target.value || undefined)}
          className="bg-dark-secondary border border-white/5 rounded-lg px-2 py-1 text-[11px] text-gray-400 focus:outline-none focus:border-primary-600/30 appearance-none cursor-pointer"
        >
          <option value="">Ещё...</option>
          {countries
            .filter((c) => !REGIONS.some((r) => r.countries.includes(c)))
            .map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
        </select>
      </div>

      {/* Row 2: ProLife product categories */}
      <div className="flex items-center gap-2 flex-wrap">
        <MapPin className="w-3.5 h-3.5 text-gray-600 shrink-0" />
        <span className="text-[10px] text-gray-600">ProLife:</span>
        {PROLIFE_CATEGORIES.map((cat) => {
          const isActive = currentPcat === cat.value;
          return (
            <button
              key={cat.value}
              onClick={() => handleProlifeCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors border ${
                isActive
                  ? "bg-primary-600/15 text-primary-400 border-primary-600/30 font-medium"
                  : "text-gray-400 border-transparent hover:bg-white/[0.04] hover:text-gray-200"
              }`}
            >
              {cat.label}
            </button>
          );
        })}

        <span className="text-gray-800">|</span>

        {/* Event type categories */}
        <select
          value={currentCategory ?? ""}
          onChange={(e) => updateFilter("category", e.target.value || undefined)}
          className="bg-dark-secondary border border-white/5 rounded-lg px-2 py-1 text-[11px] text-gray-400 focus:outline-none focus:border-primary-600/30 appearance-none cursor-pointer"
        >
          <option value="">Тип события</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label} ({c.count})
            </option>
          ))}
        </select>
      </div>

      {/* Row 3: Search + Period + Clear */}
      <div className="flex items-center gap-3 flex-wrap">
        <form onSubmit={handleSearch} className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по заголовкам, компаниям..."
            className="w-full bg-dark-secondary border border-white/5 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-primary-600/30"
          />
        </form>

        <div className="flex items-center gap-0.5">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => updateFilter("period", p.value || undefined)}
              className={`px-2 py-1 rounded-lg text-[11px] transition-colors ${
                (currentPeriod ?? "") === p.value
                  ? "bg-primary-600/15 text-primary-400 font-medium"
                  : "text-gray-400 hover:bg-white/[0.04] hover:text-gray-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {hasFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <X className="w-3 h-3" />
            Сбросить
          </button>
        )}
      </div>

      {/* Active filters chips */}
      {hasFilters && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3 h-3 text-gray-600" />
          {currentCountry && (
            <FilterChip
              label={currentCountry}
              onRemove={() => updateFilter("country", undefined)}
            />
          )}
          {currentCategory && (
            <FilterChip
              label={categories.find((c) => c.value === currentCategory)?.label ?? currentCategory}
              onRemove={() => updateFilter("category", undefined)}
            />
          )}
          {currentTopic && (
            <FilterChip
              label={`Тема: ${topics.find((t) => t.value === currentTopic)?.label ?? currentTopic}`}
              onRemove={() => updateFilter("topic", undefined)}
            />
          )}
          {currentPcat && (
            <FilterChip
              label={PROLIFE_CATEGORIES.find((c) => c.value === currentPcat)?.label ?? currentPcat}
              onRemove={() => updateFilter("pcat", undefined)}
            />
          )}
          {currentQuery && (
            <FilterChip
              label={`"${currentQuery}"`}
              onRemove={() => {
                setQuery("");
                updateFilter("q", undefined);
              }}
            />
          )}
          {currentPeriod && (
            <FilterChip
              label={periods.find((p) => p.value === currentPeriod)?.label ?? currentPeriod}
              onRemove={() => updateFilter("period", undefined)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 text-xs text-gray-300">
      {label}
      <button onClick={onRemove} className="text-gray-500 hover:text-red-400 transition-colors">
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}
