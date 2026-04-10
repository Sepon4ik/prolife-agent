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

// ── Types ──

export interface RawNewsItem {
  title: string;
  url: string;
  source: string;
  snippet: string;
  publishedAt?: string;
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
        const title = $(item).find("title").text().trim();
        const url =
          $(item).find("link").text().trim() ||
          $(item).find("guid").text().trim();
        const desc = $(item).find("description").text().trim();
        const pubDate = $(item).find("pubDate").text().trim();
        const snippet = cheerio.load(desc).text().replace(/\s+/g, " ").trim().slice(0, 500);

        if (title && url) {
          items.push({ title, url, source: sourceName, snippet, publishedAt: pubDate || undefined });
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

          if (title && url) {
            items.push({
              title,
              url,
              source: sourceName,
              snippet: summary.slice(0, 500),
              publishedAt: published || undefined,
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

export function getPharmaRSSFeeds(): Array<{ url: string; name: string }> {
  return [
    // Industry news
    { url: "https://www.fiercepharma.com/rss/xml", name: "FiercePharma" },
    { url: "https://www.pharmaceutical-technology.com/feed/", name: "Pharma Technology" },
    { url: "https://pharmaboardroom.com/feed/", name: "PharmaBoardroom" },
    { url: "https://www.europeanpharmaceuticalreview.com/feed/", name: "EU Pharma Review" },
    { url: "https://www.nutraceuticalsworld.com/rss", name: "Nutraceuticals World" },
    // Regulatory
    { url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml", name: "FDA Press Releases" },
    // Distribution / supply chain
    { url: "https://www.healthcaredistribution.org/news/feed", name: "HDA News" },
  ];
}

// ── Master aggregator ──

/**
 * Fetch news from all sources for a list of search queries.
 * Deduplicates by URL.
 */
export async function aggregateNews(
  queries: string[],
  options: { includeRSS?: boolean; maxPerSource?: number } = {}
): Promise<RawNewsItem[]> {
  const maxPer = options.maxPerSource ?? 10;
  const seen = new Set<string>();
  const all: RawNewsItem[] = [];

  const addItems = (items: RawNewsItem[]) => {
    for (const item of items) {
      // Normalize URL for dedup
      const key = item.url.replace(/[?#].*$/, "").toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        all.push(item);
      }
    }
  };

  // Google News RSS for each query
  for (const query of queries) {
    const items = await fetchGoogleNewsRSS(query, maxPer);
    addItems(items);
    await delay(1000); // Rate limit
  }

  // GNews API for each query
  for (const query of queries) {
    const items = await fetchGNewsAPI(query, maxPer);
    addItems(items);
    await delay(500);
  }

  // Industry RSS feeds
  if (options.includeRSS !== false) {
    const feeds = getPharmaRSSFeeds();
    for (const feed of feeds) {
      const items = await fetchRSSFeed(feed.url, feed.name, maxPer);
      addItems(items);
    }
  }

  return all;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
