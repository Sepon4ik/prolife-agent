"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const sourceTypes = [
  {
    value: "exhibition",
    label: "Exhibition",
    icon: "\uD83C\uDFAA",
    placeholder: "https://www.cphi.com/exhibitors/list",
  },
  {
    value: "google_search",
    label: "Google Search",
    icon: "\uD83D\uDD0D",
    placeholder: "pharmaceutical distributors Germany",
  },
  {
    value: "linkedin",
    label: "LinkedIn",
    icon: "\uD83D\uDD17",
    placeholder: "https://www.linkedin.com/search/results/companies/...",
  },
  {
    value: "website",
    label: "Website",
    icon: "\uD83C\uDF10",
    placeholder: "https://example-directory.com/members",
  },
];

export function StartScrapeForm() {
  const router = useRouter();
  const [sourceType, setSourceType] = useState("exhibition");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    error?: string;
    jobId?: string;
  } | null>(null);

  const selectedType = sourceTypes.find((t) => t.value === sourceType);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sourceUrl) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType, sourceUrl, sourceName }),
      });
      const data = await res.json();

      if (res.ok) {
        setResult({ success: true, jobId: data.jobId });
        setSourceUrl("");
        setSourceName("");
        router.refresh();
      } else {
        setResult({ error: data.error || "Failed to start scraping" });
      }
    } catch (err: any) {
      setResult({ error: err.message || "Network error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-dark-secondary rounded-lg p-5 border border-white/10"
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Source Type */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">
            Source Type
          </label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="w-full bg-dark-tertiary border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:border-primary-600 focus:outline-none"
          >
            {sourceTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Source Name */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">
            Name (optional)
          </label>
          <input
            type="text"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="e.g. CPhI 2026"
            className="w-full bg-dark-tertiary border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-primary-600 focus:outline-none"
          />
        </div>

        {/* URL */}
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-400 mb-1.5">
            {sourceType === "google_search" ? "Search Query" : "Source URL"}
          </label>
          <div className="flex gap-2">
            <input
              type={sourceType === "google_search" ? "text" : "url"}
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder={selectedType?.placeholder}
              required
              className="flex-1 bg-dark-tertiary border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-primary-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !sourceUrl}
              className="px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap"
            >
              {loading
                  ? "Starting..."
                  : sourceType === "google_search"
                    ? "Search"
                    : "Start Scraping"}
            </button>
          </div>
        </div>
      </div>

      {/* Result message */}
      {result && (
        <div
          className={`mt-3 text-sm px-3 py-2 rounded ${
            result.success
              ? "bg-green-500/10 text-green-400"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          {result.success
            ? `Scraping job started (ID: ${result.jobId})`
            : `Error: ${result.error}`}
        </div>
      )}
    </form>
  );
}
