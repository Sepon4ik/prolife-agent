import type { CrawlResult } from "../crawler";

// URL path and link text patterns for team/about/contact pages
const CONTACT_PAGE_PATTERNS = [
  /\/(about|team|leadership|management|our-team|our-people|contact|kontakt|ueber-uns|equipe)/i,
  /\/(who-we-are|meet-the-team|staff|directors|board)/i,
];

const LINK_TEXT_PATTERNS = [
  /\b(about\s*us|our\s*team|team|leadership|management|contact|who\s*we\s*are|meet\s*the\s*team)\b/i,
  /\b(directors|board|staff|our\s*people)\b/i,
];

/**
 * From already-crawled pages, find those likely to contain team/contact info.
 * Returns concatenated text from relevant pages (max 10k chars).
 */
export function extractContactPages(crawlResults: CrawlResult[]): string {
  const contactPages: CrawlResult[] = [];

  for (const page of crawlResults) {
    const urlMatch = CONTACT_PAGE_PATTERNS.some((p) => p.test(page.url));
    const titleMatch = LINK_TEXT_PATTERNS.some((p) => p.test(page.title));

    if (urlMatch || titleMatch) {
      contactPages.push(page);
    }
  }

  // If no dedicated pages found, check all pages for team-related content
  if (contactPages.length === 0) {
    for (const page of crawlResults) {
      const hasTeamContent =
        /\b(CEO|Managing Director|Sales Director|Business Development|founder|co-founder)\b/i.test(
          page.text
        );
      if (hasTeamContent) {
        contactPages.push(page);
      }
    }
  }

  return contactPages
    .map((p) => `--- Page: ${p.url} ---\n${p.text}`)
    .join("\n\n")
    .slice(0, 10_000);
}

/**
 * Find URLs for team/about/contact pages from crawled page links.
 * Returns URLs not yet in crawlResults that should be fetched.
 */
export function findContactPageUrls(
  crawlResults: CrawlResult[],
  baseUrl: string
): string[] {
  const visitedUrls = new Set(crawlResults.map((r) => r.url));
  const candidateUrls = new Set<string>();

  let baseDomain: string;
  try {
    baseDomain = new URL(baseUrl).hostname;
  } catch {
    return [];
  }

  for (const page of crawlResults) {
    for (const link of page.links) {
      try {
        const url = new URL(link.href, page.url).href;
        const urlDomain = new URL(url).hostname;

        if (urlDomain !== baseDomain) continue;
        if (visitedUrls.has(url)) continue;

        const urlMatch = CONTACT_PAGE_PATTERNS.some((p) => p.test(url));
        const textMatch = LINK_TEXT_PATTERNS.some((p) =>
          p.test(link.text)
        );

        if (urlMatch || textMatch) {
          candidateUrls.add(url);
        }
      } catch {
        // invalid URL, skip
      }
    }
  }

  return [...candidateUrls].slice(0, 5);
}
