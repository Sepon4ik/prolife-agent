/**
 * EMA (European Medicines Agency) — free API, no auth.
 * ePI API + medicine data download.
 * https://epi.developer.ema.europa.eu/
 */

import type { RawNewsItem } from "../aggregator";

const TIMEOUT = 15_000;

// ── EMA ePI API — Electronic Product Information ──

interface EmaBundle {
  entry?: Array<{
    resource?: {
      id?: string;
      name?: string;
      description?: string;
      status?: string;
      date?: string;
      identifier?: Array<{ value?: string }>;
      author?: Array<{ display?: string }>;
    };
  }>;
}

/**
 * Search EMA for recently updated medicines via ePI API.
 */
export async function fetchEMAMedicines(
  query: string,
  limit = 15
): Promise<RawNewsItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const params = new URLSearchParams({
      name: query,
      _count: String(limit),
      _sort: "-date",
    });

    const res = await fetch(
      `https://epi.developer.ema.europa.eu/api/fhir/Bundle?${params.toString()}`,
      {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "ProLifeIntel/1.0",
        },
      }
    );

    if (!res.ok) return [];

    const data = (await res.json()) as EmaBundle;
    if (!data.entry) return [];

    return data.entry.map((e) => {
      const r = e.resource;
      return {
        title: `EMA: ${r?.name ?? "Unknown Medicine"} — ${r?.status ?? ""}`,
        url: `https://www.ema.europa.eu/en/medicines`,
        source: "EMA",
        snippet: r?.description?.slice(0, 500) ?? `Author: ${r?.author?.[0]?.display ?? "N/A"}`,
        publishedAt: r?.date ?? undefined,
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ── EMA RSS Feeds ──

/**
 * EMA provides RSS feeds for news and safety updates.
 * These are consumed via the standard fetchRSSFeed from aggregator.
 */
export function getEMARSSFeeds(): Array<{ url: string; name: string; category: string }> {
  return [
    {
      url: "https://www.ema.europa.eu/en/news-events/rss-feeds",
      name: "EMA News",
      category: "regulatory",
    },
  ];
}

// ── EMA Medicine Data Download (Excel) ──
// https://www.ema.europa.eu/en/medicines/download-medicine-data
// Updated daily — Excel files. For batch processing, download and parse.
// Too heavy for real-time; better as scheduled weekly job.
