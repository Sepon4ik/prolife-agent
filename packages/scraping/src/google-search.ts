import * as cheerio from "cheerio";
import { crawlPages, type CrawlResult } from "./crawler";

export interface GoogleSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchAndCrawlResult {
  query: string;
  searchResults: GoogleSearchResult[];
  crawledPages: CrawlResult[];
}

/**
 * Search Google via SerpAPI and crawl the result pages.
 * Returns both search results and crawled page content.
 */
export async function searchAndCrawl(
  query: string,
  options: {
    maxResults?: number;
    maxCrawlPages?: number;
    country?: string;
  } = {}
): Promise<SearchAndCrawlResult> {
  const maxResults = options.maxResults ?? 20;
  const maxCrawlPages = options.maxCrawlPages ?? 10;

  // Step 1: Get Google search results via SerpAPI
  const searchResults = await googleSearch(query, {
    num: maxResults,
    gl: options.country,
  });

  // Step 2: Crawl the top result pages (1 page per domain, no link following)
  const urlsToCrawl = searchResults
    .map((r) => r.url)
    .filter((url) => {
      // Skip social media, Wikipedia, YouTube etc
      const skip = [
        "youtube.com",
        "facebook.com",
        "linkedin.com",
        "twitter.com",
        "instagram.com",
        "wikipedia.org",
        "reddit.com",
      ];
      return !skip.some((domain) => url.includes(domain));
    })
    .slice(0, maxCrawlPages);

  const crawledPages = await crawlPages(urlsToCrawl, {
    maxRequests: maxCrawlPages,
    maxConcurrency: 3,
  });

  return { query, searchResults, crawledPages };
}

/**
 * Search Google using SerpAPI.
 * Requires SERPAPI_KEY environment variable.
 */
async function googleSearch(
  query: string,
  options: { num?: number; gl?: string } = {}
): Promise<GoogleSearchResult[]> {
  const apiKey = process.env.SERPAPI_KEY;

  if (!apiKey) {
    console.warn("SERPAPI_KEY not set, falling back to direct crawl");
    return [];
  }

  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    engine: "google",
    num: String(options.num ?? 20),
    ...(options.gl ? { gl: options.gl } : {}),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(
      `https://serpapi.com/search.json?${params.toString()}`,
      { signal: controller.signal }
    );

    if (!res.ok) {
      throw new Error(`SerpAPI error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const organicResults = data.organic_results ?? [];

    return organicResults.map((r: any) => ({
      title: r.title ?? "",
      url: r.link ?? "",
      snippet: r.snippet ?? "",
    }));
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate search queries for finding distributors in a specific country/market.
 */
export function generateDistributorQueries(
  country: string,
  productType?: string
): string[] {
  const base = productType ?? "pharmaceutical supplements nutraceutical";
  return [
    `${base} distributor ${country}`,
    `pharma distribution company ${country}`,
    `supplement wholesale distributor ${country}`,
    `nutraceutical importer ${country}`,
    `health products distribution ${country}`,
  ];
}
