import * as cheerio from "cheerio";
import metascraper from "metascraper";
import metascraperImage from "metascraper-image";
import metascraperLogo from "metascraper-logo";
import metascraperLogoFavicon from "metascraper-logo-favicon";

export type ExtractedContent = {
  text: string;
  imageUrl: string | null;
};

/**
 * Known default/placeholder OG images from major news sources.
 * These are generic brand images, not article-specific content.
 */
const DEFAULT_IMAGE_PATTERNS: Array<string | RegExp> = [
  // PR Newswire
  "prnewswire.com/content/dam/prnewswire/common",
  "prnewswire.com/prn-default",
  "mma.prnewswire.com/media/default",
  // Business Wire
  "businesswire.com/images/default",
  "businesswire.com/images/bw-social",
  // GlobeNewswire
  "globenewswire.com/images/default",
  "globenewswire.com/newsroom/social",
  // Yahoo Finance
  "s.yimg.com/cv/apiv2/social",
  "s.yimg.com/os/creatr-uploaded-images/default",
  // ChemAnalyst
  "chemanalyst.com/images/default",
  "chemanalyst.com/images/logo",
  // Generic patterns
  /\/default[-_]?(og|share|social|thumbnail|image)\./i,
  /\/social[-_]?share[-_]?(default|image)\./i,
  /\/og[-_]?(default|image|logo)\./i,
  /\/placeholder[-_]?(image|thumb)\./i,
  /\/(apple-touch-icon|favicon|logo)[-_\d]*\.(png|jpg|svg)/i,
];

/** Minimum dimensions — images smaller than this are likely icons/logos */
const MIN_IMAGE_DIMENSION = 200;

/**
 * Check if a URL is a known default/placeholder image that shouldn't be shown.
 * Returns true if the image should be filtered out.
 */
export function isDefaultImage(url: string): boolean {
  const lower = url.toLowerCase();
  for (const pattern of DEFAULT_IMAGE_PATTERNS) {
    if (typeof pattern === "string") {
      if (lower.includes(pattern)) return true;
    } else {
      if (pattern.test(lower)) return true;
    }
  }
  return false;
}

// Lazy-initialized metascraper instance
let _scraper: ReturnType<typeof metascraper> | null = null;
function getScraper() {
  if (!_scraper) {
    _scraper = metascraper([
      metascraperImage(),
      metascraperLogo(),
      metascraperLogoFavicon(),
    ]);
  }
  return _scraper;
}

/**
 * Extract article content and OG image from a URL.
 * Uses cheerio to parse HTML, extracts <article> or main content,
 * and grabs og:image for preview.
 */
export async function extractArticleContent(
  url: string
): Promise<ExtractedContent | null> {
  try {
    // Resolve Google News redirect URLs to actual article URLs
    const resolvedUrl = await resolveGoogleNewsUrl(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(resolvedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract image via metascraper (OG, Twitter Cards, JSON-LD, Microdata, logo, favicon)
    let imageUrl: string | null = null;
    try {
      const scraper = getScraper();
      const metadata = await scraper({ html, url: resolvedUrl });
      imageUrl = metadata.image ?? metadata.logo ?? null;
    } catch {
      // Fallback to manual OG extraction
      imageUrl =
        $('meta[property="og:image"]').attr("content") ??
        $('meta[name="twitter:image"]').attr("content") ??
        $('meta[property="og:image:url"]').attr("content") ??
        null;
    }

    // If OG image is missing or a known default, try to find a content image
    if (!imageUrl || isDefaultImage(imageUrl)) {
      imageUrl = null;
      // Look for the first substantial <img> in the article body
      const candidateSelectors = [
        "article img",
        '[role="main"] img',
        "main img",
        ".post-content img, .article-content img, .entry-content img, .story-body img",
        ".content img",
      ];
      for (const sel of candidateSelectors) {
        const imgs = $(sel);
        imgs.each((_, el) => {
          if (imageUrl) return; // already found one
          const src = $(el).attr("src") ?? $(el).attr("data-src") ?? "";
          if (!src || src.startsWith("data:")) return;
          // Skip tiny images (icons, tracking pixels, avatars)
          const w = parseInt($(el).attr("width") ?? "0");
          const h = parseInt($(el).attr("height") ?? "0");
          if ((w > 0 && w < 200) || (h > 0 && h < 150)) return;
          // Skip common non-content patterns
          const srcLower = src.toLowerCase();
          if (
            srcLower.includes("avatar") ||
            srcLower.includes("icon") ||
            srcLower.includes("logo") ||
            srcLower.includes("pixel") ||
            srcLower.includes("tracking") ||
            srcLower.includes("badge") ||
            srcLower.includes("spinner")
          ) return;
          imageUrl = src;
        });
        if (imageUrl) break;
      }
    }

    // Remove noise
    $(
      "script, style, nav, header, footer, aside, .sidebar, .nav, .menu, .ad, .advertisement, .social-share, .comments, .related, iframe, noscript"
    ).remove();

    // Try to find article content in order of specificity
    let contentEl = $("article");
    if (contentEl.length === 0) contentEl = $('[role="main"]');
    if (contentEl.length === 0) contentEl = $("main");
    if (contentEl.length === 0) contentEl = $(".post-content, .article-content, .entry-content, .story-body");
    if (contentEl.length === 0) contentEl = $(".content");

    // Fallback: body
    if (contentEl.length === 0) contentEl = $("body");

    // Extract text paragraphs
    const paragraphs: string[] = [];
    contentEl.find("p, h1, h2, h3, h4, li, blockquote").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 30) {
        paragraphs.push(text);
      }
    });

    const text = paragraphs.join("\n\n");

    // Skip if too short (probably paywall or error page)
    if (text.length < 200) return null;

    // Cap at ~8000 chars to keep DB size reasonable and translation cost low
    const trimmed = text.length > 8000 ? text.slice(0, 8000) + "..." : text;

    const resolvedImage = imageUrl ? resolveUrl(imageUrl, url) : null;

    return {
      text: trimmed,
      imageUrl: resolvedImage && !isDefaultImage(resolvedImage) ? resolvedImage : null,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve Google News redirect URLs to actual article URLs.
 * Google News encodes URLs in protobuf within the base64 article ID.
 * The URL is embedded as a string field in the protobuf message.
 */
async function resolveGoogleNewsUrl(url: string): Promise<string> {
  if (!url.includes("news.google.com/rss/articles/")) return url;

  try {
    // Extract the base64-encoded article ID from the URL
    const match = url.match(/articles\/([^?]+)/);
    if (!match) return url;

    // Decode base64 (URL-safe variant)
    const encoded = match[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(encoded, "base64");

    // Extract URLs from the protobuf binary data
    // URLs appear as plain ASCII strings starting with "http"
    const str = decoded.toString("binary");
    const urlMatch = str.match(/https?:\/\/[^\s\x00-\x1f"<>]+/);
    if (urlMatch) {
      return urlMatch[0];
    }

    return url;
  } catch {
    return url;
  }
}

/** Resolve relative URLs to absolute */
function resolveUrl(src: string, base: string): string {
  try {
    return new URL(src, base).href;
  } catch {
    return src;
  }
}

export type TranslationResult = {
  title: string;
  summary: string | null;
  content: string | null;
};

/**
 * Translate title, summary and content to Russian using Claude API.
 * Returns all three fields in one API call for efficiency.
 */
export async function translateToRussian(
  text: string | null,
  title: string,
  summary?: string | null
): Promise<TranslationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const parts = [`TITLE: ${title}`];
    if (summary) parts.push(`SUMMARY: ${summary}`);
    if (text) parts.push(`CONTENT:\n${text}`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: `Translate this pharmaceutical industry article to Russian. Keep it professional and accurate. Preserve paragraph structure.

Output EXACTLY in this format (keep the labels in English):
TITLE: <translated title>
SUMMARY: <translated summary>
CONTENT:
<translated content>

If a section is missing in the input, output the label with "—".

${parts.join("\n\n")}`,
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as {
      content?: Array<{ text?: string }>;
    };
    const raw = data.content?.[0]?.text;
    if (!raw) return null;

    // Parse structured response
    const titleMatch = raw.match(/TITLE:\s*(.+?)(?:\n|$)/);
    const summaryMatch = raw.match(/SUMMARY:\s*(.+?)(?:\nCONTENT:|\n\n|$)/s);
    const contentMatch = raw.match(/CONTENT:\s*\n([\s\S]+)/);

    const translatedTitle = titleMatch?.[1]?.trim();
    const translatedSummary = summaryMatch?.[1]?.trim();
    const translatedContent = contentMatch?.[1]?.trim();

    return {
      title: translatedTitle && translatedTitle !== "—" ? translatedTitle : title,
      summary: translatedSummary && translatedSummary !== "—" ? translatedSummary : null,
      content: translatedContent && translatedContent !== "—" ? translatedContent : null,
    };
  } catch {
    return null;
  }
}

/**
 * Track already-used Pexels image URLs to avoid duplicates within a batch.
 * Resets each time the module is freshly loaded.
 */
const usedPexelsUrls = new Set<string>();

/**
 * Search Pexels for a relevant stock photo based on article keywords.
 * Free API: 200 req/hr, no cost.
 * Fetches multiple results and picks one not yet used, avoiding duplicates.
 */
export async function findStockImage(
  title: string,
  category?: string
): Promise<string | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return null;

  try {
    // Build search query from category + key terms
    const categoryKeywords: Record<string, string> = {
      REGULATORY: "pharmaceutical regulation",
      CONTRACT: "business handshake agreement",
      EXPANSION: "global expansion logistics",
      MA_FUNDING: "corporate merger acquisition",
      LEADERSHIP: "executive business leader",
      PRODUCT_LAUNCH: "medical product launch",
      TENDER: "government procurement",
      EVENT: "medical conference exhibition",
      GENERAL: "pharmaceutical industry",
    };

    const baseQuery = categoryKeywords[category ?? ""] ?? "pharmaceutical";

    // Extract meaningful words from title (skip common words)
    const stopWords = new Set([
      "the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "or",
      "with", "by", "as", "is", "are", "was", "were", "be", "been", "has",
      "have", "had", "do", "does", "did", "will", "would", "could", "should",
      "from", "its", "their", "this", "that", "new", "via", "after", "says",
    ]);
    const titleWords = title
      .replace(/[^a-zA-Z\s]/g, "")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w))
      .slice(0, 3);

    const query = titleWords.length > 0
      ? `${baseQuery} ${titleWords.join(" ")}`
      : baseQuery;

    // Fetch 15 results and pick one not yet used
    const page = Math.floor(Math.random() * 5) + 1;
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&page=${page}&orientation=landscape`,
      {
        headers: { Authorization: apiKey },
        signal: AbortSignal.timeout(5_000),
      }
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      photos?: Array<{ src?: { medium?: string; small?: string } }>;
    };

    const photos = data.photos ?? [];
    // Pick first photo not already used
    for (const photo of photos) {
      const url = photo.src?.medium ?? photo.src?.small;
      if (url && !usedPexelsUrls.has(url)) {
        usedPexelsUrls.add(url);
        return url;
      }
    }
    // All used — return first available anyway
    return photos[0]?.src?.medium ?? photos[0]?.src?.small ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract OG image from URL without full content extraction.
 * Lighter than extractArticleContent — for image-only backfill.
 */
export async function extractImageOnly(url: string): Promise<string | null> {
  try {
    const resolvedUrl = await resolveGoogleNewsUrl(url);
    if (resolvedUrl.includes("news.google.com")) return null;

    const response = await fetch(resolvedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });

    if (!response.ok) return null;
    const html = await response.text();

    const scraper = getScraper();
    const metadata = await scraper({ html, url: resolvedUrl });
    const image = metadata.image ?? metadata.logo ?? null;
    if (image && isDefaultImage(image)) return null;
    return image;
  } catch {
    return null;
  }
}

/**
 * Extract content + translate for a batch of news items.
 * Processes sequentially to avoid rate limits.
 */
export async function extractAndTranslateBatch(
  items: Array<{ id: string; url: string; title: string; summary?: string | null }>
): Promise<
  Array<{
    id: string;
    fullContent: string | null;
    translatedTitle: string | null;
    translatedSummary: string | null;
    translatedContent: string | null;
    imageUrl: string | null;
  }>
> {
  const results: Array<{
    id: string;
    fullContent: string | null;
    translatedTitle: string | null;
    translatedSummary: string | null;
    translatedContent: string | null;
    imageUrl: string | null;
  }> = [];

  for (const item of items) {
    const extracted = await extractArticleContent(item.url);

    let translatedTitle: string | null = null;
    let translatedSummary: string | null = null;
    let translatedContent: string | null = null;

    const translation = await translateToRussian(
      extracted?.text ?? null,
      item.title,
      item.summary
    );
    if (translation) {
      translatedTitle = translation.title;
      translatedSummary = translation.summary;
      translatedContent = translation.content;
    }

    results.push({
      id: item.id,
      fullContent: extracted?.text ?? null,
      translatedTitle,
      translatedSummary,
      translatedContent,
      imageUrl: extracted?.imageUrl ?? null,
    });
  }

  return results;
}
