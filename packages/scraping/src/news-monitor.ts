/**
 * News Monitoring for Intent Signals.
 *
 * Searches Google News for companies that are actively:
 * - Seeking distribution partners
 * - Expanding to new markets
 * - Launching new product lines
 * - Announcing partnerships or acquisitions
 *
 * These are "hot leads" — companies with confirmed buying intent.
 * Reply rates are 3-5x higher than cold outreach.
 *
 * Uses SerpAPI Google News or free Google News RSS as fallback.
 */

import * as cheerio from "cheerio";

// ── Types ──

export interface NewsResult {
  title: string;
  url: string;
  source: string;
  date?: string;
  snippet: string;
}

export interface IntentSignal {
  companyName: string;
  intentType:
    | "seeking_partners"
    | "expanding_market"
    | "new_products"
    | "partnership_announced"
    | "funding_received"
    | "leadership_change";
  headline: string;
  url: string;
  source: string;
  date?: string;
  country?: string;
  confidence: "high" | "medium" | "low";
}

// ── Search Queries ──

/**
 * Generate news search queries for finding companies with distribution intent.
 */
export function generateIntentQueries(
  country: string,
  productType?: string
): string[] {
  const product = productType ?? "pharmaceutical supplement nutraceutical";
  return [
    `"seeking distribution" ${product} ${country}`,
    `"distribution partner" ${product} ${country}`,
    `"expand distribution" ${product} ${country}`,
    `"new distributor" ${product} ${country}`,
    `"import license" pharmaceutical ${country}`,
    `"market entry" pharmaceutical ${country}`,
    `pharma distributor expansion ${country}`,
  ];
}

// ── Google News RSS (free, no API key) ──

/**
 * Search Google News via RSS feed (free, no API key needed).
 * Returns recent news articles matching the query.
 * Rate limit: be respectful, max ~10 requests/minute.
 */
export async function searchGoogleNewsRSS(
  query: string,
  options: { maxResults?: number } = {}
): Promise<NewsResult[]> {
  const maxResults = options.maxResults ?? 10;
  const encodedQuery = encodeURIComponent(query);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(
      `https://news.google.com/rss/search?q=${encodedQuery}&hl=en&gl=US&ceid=US:en`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      console.warn(`Google News RSS error: ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const $ = cheerio.load(xml, { xml: true });

    const results: NewsResult[] = [];
    $("item")
      .slice(0, maxResults)
      .each((_, item) => {
        const title = $(item).find("title").text().trim();
        const url = $(item).find("link").text().trim();
        const source = $(item).find("source").text().trim();
        const pubDate = $(item).find("pubDate").text().trim();
        const description = $(item).find("description").text().trim();

        // Clean HTML from description
        const snippet = cheerio
          .load(description)
          .text()
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500);

        if (title && url) {
          results.push({
            title,
            url,
            source,
            date: pubDate || undefined,
            snippet,
          });
        }
      });

    return results;
  } finally {
    clearTimeout(timeout);
  }
}

// ── SerpAPI News (if key available) ──

/**
 * Search Google News via SerpAPI (requires SERPAPI_KEY).
 * Better structured results than RSS, but costs per query.
 */
export async function searchGoogleNewsSerpAPI(
  query: string,
  options: { maxResults?: number } = {}
): Promise<NewsResult[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    engine: "google_news",
    num: String(options.maxResults ?? 10),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(
      `https://serpapi.com/search.json?${params.toString()}`,
      { signal: controller.signal }
    );

    if (!res.ok) return [];

    const data = (await res.json()) as {
      news_results?: Array<{
        title?: string;
        link?: string;
        source?: { name?: string };
        date?: string;
        snippet?: string;
      }>;
    };

    return (data.news_results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.link ?? "",
      source: r.source?.name ?? "",
      date: r.date,
      snippet: r.snippet ?? "",
    }));
  } finally {
    clearTimeout(timeout);
  }
}

// ── Intent Signal Extraction ──

/**
 * Analyze news results and extract intent signals.
 * Uses keyword matching to classify the type of intent.
 */
export function extractIntentSignals(
  newsResults: NewsResult[],
  country?: string
): IntentSignal[] {
  const signals: IntentSignal[] = [];

  for (const news of newsResults) {
    const text = `${news.title} ${news.snippet}`.toLowerCase();

    const intentType = classifyIntent(text);
    if (!intentType) continue;

    // Try to extract company name from title
    // Pattern: "CompanyName announces..." or "CompanyName expands..."
    const companyName = extractCompanyFromHeadline(news.title);
    if (!companyName) continue;

    const confidence = getConfidence(text, intentType);

    signals.push({
      companyName,
      intentType,
      headline: news.title,
      url: news.url,
      source: news.source,
      date: news.date,
      country,
      confidence,
    });
  }

  return signals;
}

function classifyIntent(
  text: string
): IntentSignal["intentType"] | null {
  if (
    text.includes("seeking distribution") ||
    text.includes("distribution partner") ||
    text.includes("looking for distributor") ||
    text.includes("appoint distributor")
  ) {
    return "seeking_partners";
  }
  if (
    text.includes("expand") ||
    text.includes("market entry") ||
    text.includes("enters market") ||
    text.includes("launches in")
  ) {
    return "expanding_market";
  }
  if (
    text.includes("new product") ||
    text.includes("launches") ||
    text.includes("introduces")
  ) {
    return "new_products";
  }
  if (
    text.includes("partnership") ||
    text.includes("agreement") ||
    text.includes("collaboration") ||
    text.includes("joint venture")
  ) {
    return "partnership_announced";
  }
  if (
    text.includes("funding") ||
    text.includes("raises") ||
    text.includes("investment") ||
    text.includes("series")
  ) {
    return "funding_received";
  }
  if (
    text.includes("appoints") ||
    text.includes("hires") ||
    text.includes("new ceo") ||
    text.includes("new director")
  ) {
    return "leadership_change";
  }
  return null;
}

function extractCompanyFromHeadline(title: string): string | null {
  // Common headline patterns:
  // "CompanyName Announces X" / "CompanyName to Expand" / "CompanyName Launches"
  const patterns = [
    /^([A-Z][A-Za-z0-9\s&.,'-]{2,40}?)\s+(?:announces?|expands?|launches?|enters?|seeks?|signs?|appoints?|hires?|raises?|receives?|partners?|introduces?)/i,
    /^([A-Z][A-Za-z0-9\s&.,'-]{2,40}?)\s+(?:to\s+(?:expand|launch|enter|distribute|partner))/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

function getConfidence(
  text: string,
  intentType: IntentSignal["intentType"]
): "high" | "medium" | "low" {
  // High: explicit distribution/partner intent
  if (
    intentType === "seeking_partners" &&
    (text.includes("pharma") || text.includes("supplement"))
  ) {
    return "high";
  }
  // Medium: expansion or new products in relevant industry
  if (
    intentType === "expanding_market" &&
    (text.includes("pharma") || text.includes("health"))
  ) {
    return "medium";
  }
  // Low: general business signals
  return "low";
}

// ── Pipeline Integration ──

/**
 * Search news for intent signals in a target country.
 * Uses SerpAPI if available, falls back to Google News RSS.
 */
export async function monitorNewsForCountry(
  country: string,
  options: { productType?: string; maxQueries?: number } = {}
): Promise<IntentSignal[]> {
  const queries = generateIntentQueries(country, options.productType).slice(
    0,
    options.maxQueries ?? 5
  );

  const allSignals: IntentSignal[] = [];
  const seenCompanies = new Set<string>();

  for (const query of queries) {
    // Try SerpAPI first, fallback to RSS
    let results = await searchGoogleNewsSerpAPI(query, { maxResults: 10 });
    if (results.length === 0) {
      results = await searchGoogleNewsRSS(query, { maxResults: 10 });
    }

    const signals = extractIntentSignals(results, country);
    for (const signal of signals) {
      const key = signal.companyName.toLowerCase();
      if (!seenCompanies.has(key)) {
        seenCompanies.add(key);
        allSignals.push(signal);
      }
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Sort: high confidence first
  return allSignals.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.confidence] - order[b.confidence];
  });
}
