/**
 * News Aggregator — collects pharma industry news from multiple sources.
 *
 * Sources (all free or cheap):
 * 1. Google News RSS — free, no key needed
 * 2. GNews API — free tier: 100 req/day
 * 3. Pharma regulatory RSS feeds (FDA, EMA, BPOM)
 * 4. Industry blog RSS (FiercePharma, PharmaBoardroom)
 *
 * Deduplicates by URL. Returns raw news items for AI processing.
 */

import * as cheerio from "cheerio";
import { fetchAllFDA } from "./sources/openfda";
import { fetchPharmaDistributionTrials } from "./sources/clinical-trials";
import { fetchEMAMedicines } from "./sources/ema";

// ── Types ──

export interface RawNewsItem {
  title: string;
  url: string;
  source: string;
  snippet: string;
  publishedAt?: string;
  /** Direct image URL extracted from RSS (enclosure, media:content, og:image) */
  imageUrl?: string;
  /** Publisher's base URL from Google News <source url=""> attribute */
  sourceUrl?: string;
}

// ── Google News RSS (free, no key) ──

export async function fetchGoogleNewsRSS(
  query: string,
  maxResults = 15
): Promise<RawNewsItem[]> {
  const encoded = encodeURIComponent(query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(
      `https://news.google.com/rss/search?q=${encoded}&hl=en&gl=US&ceid=US:en`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ProLifeIntel/1.0)",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        signal: controller.signal,
      }
    );

    if (!res.ok) return [];

    const xml = await res.text();
    const $ = cheerio.load(xml, { xml: true });

    const items: RawNewsItem[] = [];
    $("item")
      .slice(0, maxResults)
      .each((_, item) => {
        const title = $(item).find("title").text().trim();
        const url = $(item).find("link").text().trim();
        const source = $(item).find("source").text().trim();
        const sourceUrl = $(item).find("source").attr("url") ?? undefined;
        const pubDate = $(item).find("pubDate").text().trim();
        const desc = $(item).find("description").text().trim();
        const snippet = cheerio.load(desc).text().replace(/\s+/g, " ").trim().slice(0, 500);

        if (title && url) {
          items.push({
            title,
            url,
            source: source || "Google News",
            snippet,
            publishedAt: pubDate || undefined,
            sourceUrl,
          });
        }
      });

    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ── GNews API (free: 100 req/day) ──

export async function fetchGNewsAPI(
  query: string,
  maxResults = 10
): Promise<RawNewsItem[]> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    q: query,
    token: apiKey,
    lang: "en",
    max: String(Math.min(maxResults, 10)),
    sortby: "publishedAt",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(
      `https://gnews.io/api/v4/search?${params.toString()}`,
      { signal: controller.signal }
    );

    if (!res.ok) return [];

    const data = (await res.json()) as {
      articles?: Array<{
        title?: string;
        url?: string;
        source?: { name?: string };
        description?: string;
        publishedAt?: string;
      }>;
    };

    return (data.articles ?? []).map((a) => ({
      title: a.title ?? "",
      url: a.url ?? "",
      source: a.source?.name ?? "GNews",
      snippet: a.description ?? "",
      publishedAt: a.publishedAt,
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ── RSS Feed Fetcher (for industry blogs + regulatory) ──

export async function fetchRSSFeed(
  feedUrl: string,
  sourceName: string,
  maxResults = 20
): Promise<RawNewsItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(feedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ProLifeIntel/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml, application/atom+xml",
      },
      signal: controller.signal,
    });

    if (!res.ok) return [];

    const xml = await res.text();
    const $ = cheerio.load(xml, { xml: true });

    const items: RawNewsItem[] = [];

    // RSS 2.0
    $("item")
      .slice(0, maxResults)
      .each((_, item) => {
        const rawTitle = $(item).find("title").text().trim();
        // Strip CDATA wrapper if present
        const title = rawTitle.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
        const url =
          $(item).find("link").text().trim() ||
          $(item).find("guid").text().trim();
        const rawDesc = $(item).find("description").text().trim();
        const desc = rawDesc.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
        const pubDate = $(item).find("pubDate").text().trim();
        const snippet = cheerio.load(desc).text().replace(/\s+/g, " ").trim().slice(0, 500);

        // Extract image from RSS media tags
        const imageUrl = extractRSSImage($(item));

        if (title && url) {
          items.push({
            title,
            url,
            source: sourceName,
            snippet,
            publishedAt: pubDate || undefined,
            imageUrl,
          });
        }
      });

    // Atom fallback
    if (items.length === 0) {
      $("entry")
        .slice(0, maxResults)
        .each((_, entry) => {
          const title = $(entry).find("title").text().trim();
          const url = $(entry).find("link").attr("href") ?? "";
          const summary = $(entry).find("summary").text().trim();
          const published = $(entry).find("published").text().trim();

          const imageUrl = extractRSSImage($(entry));

          if (title && url) {
            items.push({
              title,
              url,
              source: sourceName,
              snippet: summary.slice(0, 500),
              publishedAt: published || undefined,
              imageUrl,
            });
          }
        });
    }

    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ── Curated pharma RSS feeds ──

export function getPharmaRSSFeeds(): Array<{ url: string; name: string; category: string }> {
  return [
    // ── Industry News ──
    { url: "https://www.fiercepharma.com/rss/xml", name: "FiercePharma", category: "news" },
    { url: "https://www.biopharmadive.com/feeds/news/", name: "BioPharma Dive", category: "news" },
    { url: "https://endpts.com/feed", name: "Endpoints News", category: "news" },
    { url: "https://pharmaphorum.com/rssfeed", name: "Pharmaphorum", category: "news" },
    { url: "https://www.pharmaceutical-technology.com/feed/", name: "Pharma Technology", category: "news" },
    { url: "https://pharmaboardroom.com/feed/", name: "PharmaBoardroom", category: "news" },
    { url: "https://www.europeanpharmaceuticalreview.com/feed/", name: "EU Pharma Review", category: "news" },
    { url: "https://www.pharmaceutical-business-review.com/feed/", name: "Pharma Business Review", category: "news" },
    { url: "https://www.nutraceuticalsworld.com/rss", name: "Nutraceuticals World", category: "news" },

    // ── Drugs.com (6 feeds) ──
    { url: "https://www.drugs.com/feeds/medical-news.xml", name: "Drugs.com MedNews", category: "clinical" },
    { url: "https://www.drugs.com/feeds/fda-alerts.xml", name: "Drugs.com FDA Alerts", category: "regulatory" },
    { url: "https://www.drugs.com/feeds/new-drug-approvals.xml", name: "Drugs.com Approvals", category: "regulatory" },
    { url: "https://www.drugs.com/feeds/new-drug-applications.xml", name: "Drugs.com Applications", category: "regulatory" },
    { url: "https://www.drugs.com/feeds/drug-shortages.xml", name: "Drugs.com Shortages", category: "regulatory" },
    { url: "https://www.drugs.com/feeds/clinical-trial-results.xml", name: "Drugs.com Trials", category: "clinical" },

    // ── Regulatory ──
    { url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml", name: "FDA Press Releases", category: "regulatory" },
    { url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/drugs/rss.xml", name: "FDA Drugs", category: "regulatory" },
    { url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml", name: "FDA MedWatch", category: "safety" },

    // ── Distribution / Supply Chain ──
    { url: "https://www.healthcaredistribution.org/news/feed", name: "HDA News", category: "distribution" },
    { url: "https://www.drugstorenews.com/feed", name: "Drug Store News", category: "distribution" },
    { url: "https://www.drugtopics.com/rss", name: "Drug Topics", category: "distribution" },

    // ── Biotech / R&D ──
    { url: "https://www.genengnews.com/feed/", name: "GEN News", category: "biotech" },
    { url: "https://www.bioworld.com/rss/news", name: "BioWorld", category: "biotech" },

    // ── Medical Devices ──
    { url: "https://www.medtechdive.com/feeds/news/", name: "MedTech Dive", category: "medtech" },
    { url: "https://www.medicaldevice-network.com/feed/", name: "Medical Device Network", category: "medtech" },
    { url: "https://www.massdevice.com/feed/", name: "MassDevice", category: "medtech" },
    { url: "https://www.mddionline.com/rss", name: "MD+DI Online", category: "medtech" },
    { url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medical-devices/rss.xml", name: "FDA Medical Devices", category: "medtech" },
  ];
}

// ── Master aggregator ──

/**
 * Fetch news from all sources for a list of search queries.
 * Deduplicates by URL.
 */
export async function aggregateNews(
  queries: string[],
  options: {
    includeRSS?: boolean;
    includeFDA?: boolean;
    includeClinicalTrials?: boolean;
    includeEMA?: boolean;
    maxPerSource?: number;
  } = {}
): Promise<RawNewsItem[]> {
  const maxPer = options.maxPerSource ?? 10;
  const seen = new Set<string>();
  const all: RawNewsItem[] = [];

  const addItems = (items: RawNewsItem[]) => {
    for (const item of items) {
      const key = item.url.replace(/[?#].*$/, "").toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        all.push(item);
      }
    }
  };

  // ── Google News RSS ──
  for (const query of queries) {
    const items = await fetchGoogleNewsRSS(query, maxPer);
    addItems(items);
    await delay(1000);
  }

  // ── GNews API ──
  for (const query of queries) {
    const items = await fetchGNewsAPI(query, maxPer);
    addItems(items);
    await delay(500);
  }

  // ── Industry RSS feeds (23 feeds) ──
  if (options.includeRSS !== false) {
    const feeds = getPharmaRSSFeeds();
    const feedResults = await Promise.allSettled(
      feeds.map((feed) => fetchRSSFeed(feed.url, feed.name, maxPer))
    );
    for (const result of feedResults) {
      if (result.status === "fulfilled") addItems(result.value);
    }
  }

  // ── OpenFDA (approvals, recalls, shortages) ──
  if (options.includeFDA !== false) {
    const fdaItems = await fetchAllFDA();
    addItems(fdaItems);
  }

  // ── ClinicalTrials.gov ──
  if (options.includeClinicalTrials !== false) {
    const trialItems = await fetchPharmaDistributionTrials();
    addItems(trialItems);
  }

  // ── EMA ──
  if (options.includeEMA !== false) {
    for (const query of queries.slice(0, 3)) {
      const emaItems = await fetchEMAMedicines(query, 5);
      addItems(emaItems);
    }
  }

  return all;
}

/**
 * Extract image URL from RSS item using standard media tags.
 * Checks (in priority order): media:content, media:thumbnail, enclosure, img in description.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractRSSImage(el: cheerio.Cheerio<any>): string | undefined {
  // 1. media:content with image type or medium="image"
  const mediaContent =
    el.find("media\\:content[medium='image']").attr("url") ??
    el.find("media\\:content[type^='image']").attr("url") ??
    el.find("media\\:content").attr("url");
  if (mediaContent) return mediaContent;

  // 2. media:thumbnail
  const mediaThumbnail = el.find("media\\:thumbnail").attr("url");
  if (mediaThumbnail) return mediaThumbnail;

  // 3. enclosure with image type
  const enclosure = el.find("enclosure[type^='image']").attr("url");
  if (enclosure) return enclosure;

  // 4. Any enclosure (some feeds don't set type)
  const anyEnclosure = el.find("enclosure").attr("url");
  if (anyEnclosure && /\.(jpg|jpeg|png|webp|gif)/i.test(anyEnclosure)) {
    return anyEnclosure;
  }

  // 5. img tag inside description HTML (common in RSS)
  const desc = el.find("description").html() ?? el.find("content\\:encoded").html() ?? "";
  const imgMatch = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch?.[1] && !imgMatch[1].startsWith("data:")) {
    return imgMatch[1];
  }

  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
