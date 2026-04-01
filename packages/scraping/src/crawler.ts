import * as cheerio from "cheerio";

export interface CrawlResult {
  url: string;
  title: string;
  text: string;
  links: { href: string; text: string }[];
  scrapedAt: string;
}

interface CrawlerOptions {
  maxRequests?: number;
  maxConcurrency?: number;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Crawl pages using fetch + cheerio (serverless-compatible).
 * Starts from the given URLs, follows same-domain links up to maxRequests.
 */
export async function crawlPages(
  startUrls: string[],
  options: CrawlerOptions = {}
): Promise<CrawlResult[]> {
  const maxRequests = options.maxRequests ?? 100;
  const maxConcurrency = options.maxConcurrency ?? 3;
  const visited = new Set<string>();
  const results: CrawlResult[] = [];
  const queue: string[] = [...startUrls];

  while (queue.length > 0 && results.length < maxRequests) {
    // Process batch
    const batch = queue.splice(0, maxConcurrency).filter((url) => {
      if (visited.has(url)) return false;
      visited.add(url);
      return true;
    });

    if (batch.length === 0) continue;

    const batchResults = await Promise.allSettled(
      batch.map((url) => fetchAndParse(url))
    );

    for (const result of batchResults) {
      if (result.status !== "fulfilled") continue;
      const page = result.value;
      results.push(page);

      if (results.length >= maxRequests) break;

      // Enqueue same-domain links
      try {
        const baseHost = new URL(page.url).hostname;
        for (const link of page.links) {
          try {
            const resolved = new URL(link.href, page.url);
            if (
              resolved.hostname === baseHost &&
              resolved.protocol.startsWith("http") &&
              !visited.has(resolved.href)
            ) {
              queue.push(resolved.href);
            }
          } catch {
            // Invalid URL — skip
          }
        }
      } catch {
        // Invalid base URL — skip
      }
    }
  }

  return results;
}

/**
 * Fetch a single page and extract text + links with cheerio.
 */
async function fetchAndParse(url: string): Promise<CrawlResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove noise
    $("script, style, noscript, nav, footer, header, iframe").remove();

    const title = $("title").text().trim();
    const text = $("body")
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 10_000);

    const links: { href: string; text: string }[] = [];
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        links.push({ href, text: $(el).text().trim() });
      }
    });

    return { url, title, text, links, scrapedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Legacy export name for backward compatibility.
 * Returns an object with a `run` method that matches the old Crawlee pattern.
 */
export function createExhibitionCrawler(options: {
  maxRequests?: number;
  maxConcurrency?: number;
  proxyUrls?: string[];
}) {
  return {
    crawl: (urls: string[]) =>
      crawlPages(urls, {
        maxRequests: options.maxRequests,
        maxConcurrency: options.maxConcurrency,
      }),
  };
}
