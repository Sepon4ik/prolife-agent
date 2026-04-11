import * as cheerio from "cheerio";
import { createHash } from "crypto";

/**
 * Website Change Monitor — scrapes company pages and detects changes.
 *
 * Targets news/press, products, partners, careers pages.
 * Uses content hashing to detect changes without storing full HTML.
 */

export interface PageScrapeResult {
  pageUrl: string;
  pageType: string;
  content: string;
  contentHash: string;
  title: string | null;
}

/** Common subpage paths to check per page type */
const PAGE_PATTERNS: Record<string, string[]> = {
  news: ["/news", "/press", "/media", "/press-releases", "/blog", "/updates", "/announcements"],
  products: ["/products", "/portfolio", "/our-products", "/brands", "/solutions"],
  partners: ["/partners", "/distributors", "/distribution", "/where-to-buy", "/network"],
  careers: ["/careers", "/jobs", "/join-us", "/vacancies", "/work-with-us"],
};

/**
 * Discover which subpages exist on a company website.
 * Probes common paths and returns those that return 200.
 */
export async function discoverCompanyPages(
  websiteUrl: string
): Promise<Array<{ url: string; pageType: string }>> {
  const base = websiteUrl.replace(/\/$/, "");
  const found: Array<{ url: string; pageType: string }> = [];

  // Always include homepage
  found.push({ url: base, pageType: "homepage" });

  const probes: Array<{ url: string; pageType: string }> = [];
  for (const [pageType, paths] of Object.entries(PAGE_PATTERNS)) {
    for (const path of paths) {
      probes.push({ url: `${base}${path}`, pageType });
    }
  }

  // Probe all paths in parallel (with concurrency limit)
  const results = await Promise.allSettled(
    probes.map(async (probe) => {
      try {
        const res = await fetch(probe.url, {
          method: "HEAD",
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(8_000),
        });
        // Accept 200 and 301/302 (some sites redirect /news → /blog)
        if (res.ok) {
          return probe;
        }
        return null;
      } catch {
        return null;
      }
    })
  );

  // Deduplicate by pageType (take first match per type)
  const seenTypes = new Set(found.map((f) => f.pageType));
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      const { pageType } = result.value;
      if (!seenTypes.has(pageType)) {
        seenTypes.add(pageType);
        found.push(result.value);
      }
    }
  }

  return found;
}

/**
 * Scrape a single page and extract meaningful text content.
 * Returns cleaned text + SHA-256 hash for change detection.
 */
export async function scrapePage(url: string, pageType: string): Promise<PageScrapeResult | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove noise
    $("script, style, nav, header, footer, aside, .cookie, .modal, .popup, iframe, noscript, svg").remove();

    // Extract title
    const title = $("title").text().trim() || $("h1").first().text().trim() || null;

    // Extract meaningful text
    let contentEl = $("article, [role='main'], main, .content, .post-content, .entry-content");
    if (contentEl.length === 0) contentEl = $("body");

    const paragraphs: string[] = [];
    contentEl.find("p, h1, h2, h3, h4, li, blockquote, td, dd").each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, " ");
      if (text.length > 20) {
        paragraphs.push(text);
      }
    });

    const content = paragraphs.join("\n");
    if (content.length < 100) return null; // Too little content = probably error page

    // Cap content at 10KB
    const trimmed = content.length > 10_000 ? content.slice(0, 10_000) : content;

    const contentHash = createHash("sha256").update(trimmed).digest("hex");

    return {
      pageUrl: url,
      pageType,
      content: trimmed,
      contentHash,
      title,
    };
  } catch {
    return null;
  }
}

/**
 * Generate a diff summary between old and new content.
 * Returns the new lines not present in old content.
 */
export function getContentDiff(oldContent: string, newContent: string): string {
  const oldLines = new Set(oldContent.split("\n").map((l) => l.trim()).filter(Boolean));
  const newLines = newContent.split("\n").map((l) => l.trim()).filter(Boolean);

  const added = newLines.filter((line) => !oldLines.has(line));

  if (added.length === 0) return "";

  return added.slice(0, 20).join("\n"); // Cap at 20 new lines
}
