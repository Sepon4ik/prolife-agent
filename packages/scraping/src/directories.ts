import * as cheerio from "cheerio";
import { crawlPages, type CrawlResult } from "./crawler";

// ── Types ──

export interface DirectoryListing {
  name: string;
  country?: string;
  city?: string;
  website?: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  categories?: string[];
  sourceDirectory: string;
}

export interface DirectoryConfig {
  name: string;
  /** Base URL to start crawling from */
  url: string;
  /** Max pages to crawl within this directory */
  maxPages?: number;
}

// ── Predefined directory sources by industry ──

/**
 * Get pharma/distributor directory URLs for a given country or region.
 * These are curated, freely-crawlable industry directories.
 */
export function getPharmaDirectories(country?: string): DirectoryConfig[] {
  const directories: DirectoryConfig[] = [
    // Global directories
    {
      name: "PharmaBoardroom",
      url: "https://pharmaboardroom.com/pharmaceutical-companies/",
      maxPages: 30,
    },
    {
      name: "ExportHub Pharma",
      url: "https://www.exporthub.com/pharmaceutical-products/pharmaceutical-distributors/",
      maxPages: 20,
    },
    {
      name: "Kompass Pharma",
      url: "https://www.kompass.com/a/pharmaceutical-products-distribution/55320/",
      maxPages: 20,
    },
    {
      name: "ThomasNet Pharma",
      url: "https://www.thomasnet.com/nsearch.html?cov=NA&heading=90832019&which=prod",
      maxPages: 15,
    },
    {
      name: "WholesaleCentral Health",
      url: "https://www.wholesalecentral.com/health-beauty/",
      maxPages: 20,
    },
    {
      name: "TradeIndia Pharma",
      url: "https://www.tradeindia.com/pharmaceutical-drugs/",
      maxPages: 20,
    },
  ];

  // Country-specific directories
  const countryDirectories: Record<string, DirectoryConfig[]> = {
    Indonesia: [
      {
        name: "IndonesiaYP Pharma",
        url: "https://www.indonesiayp.com/category/pharmaceutical-company",
        maxPages: 15,
      },
    ],
    Pakistan: [
      {
        name: "Jaiza Pharma",
        url: "https://www.jaiza.com.pk/pharmaceutical-companies",
        maxPages: 15,
      },
    ],
    UAE: [
      {
        name: "DubaiExporters Pharma",
        url: "https://www.dubaiexporters.com/search/pharmaceutical/",
        maxPages: 15,
      },
    ],
    Bangladesh: [
      {
        name: "BangladeshYP Pharma",
        url: "https://www.bdyellowpages.com/category/pharmaceutical",
        maxPages: 15,
      },
    ],
    Philippines: [
      {
        name: "PhilippinesYP Pharma",
        url: "https://www.yellowpages.ph/search/pharmaceutical+distributors",
        maxPages: 15,
      },
    ],
    Vietnam: [
      {
        name: "VietnamYP Pharma",
        url: "https://www.yellowpages.vn/cls/pharmaceutical-companies/",
        maxPages: 15,
      },
    ],
  };

  const lowerCountry = country?.toLowerCase();
  const countryMatch = Object.entries(countryDirectories).find(
    ([key]) => key.toLowerCase() === lowerCountry
  );

  if (countryMatch) {
    return [...directories, ...countryMatch[1]];
  }

  return directories;
}

// ── Extraction ──

/**
 * Extract company listings from a directory page using heuristics.
 * Works across different directory formats by looking for common patterns:
 * - Lists of company names with links
 * - Contact info blocks (email, phone, address)
 * - Category/industry tags
 */
export function extractDirectoryListings(
  pages: CrawlResult[],
  directoryName: string
): DirectoryListing[] {
  const listings: DirectoryListing[] = [];
  const seenNames = new Set<string>();

  for (const page of pages) {
    const extracted = extractFromPage(page, directoryName);
    for (const listing of extracted) {
      const key = listing.name.toLowerCase().trim();
      if (key.length >= 2 && !seenNames.has(key)) {
        seenNames.add(key);
        listings.push(listing);
      }
    }
  }

  return listings;
}

function extractFromPage(
  page: CrawlResult,
  directoryName: string
): DirectoryListing[] {
  const results: DirectoryListing[] = [];
  const text = page.text ?? "";

  // Strategy 1: Look for external links (company website links)
  const companyLinks = page.links.filter((link) => {
    try {
      const linkHost = new URL(link.href, page.url).hostname;
      const pageHost = new URL(page.url).hostname;
      return (
        linkHost !== pageHost &&
        link.text.length > 2 &&
        link.text.length < 100 &&
        !link.href.includes("facebook.com") &&
        !link.href.includes("twitter.com") &&
        !link.href.includes("linkedin.com") &&
        !link.href.includes("instagram.com") &&
        !link.href.includes("youtube.com") &&
        !link.href.includes("google.com")
      );
    } catch {
      return false;
    }
  });

  for (const link of companyLinks) {
    try {
      const domain = new URL(link.href).hostname.replace("www.", "");
      results.push({
        name: link.text.trim(),
        website: `https://${domain}`,
        sourceDirectory: directoryName,
      });
    } catch {
      // Invalid URL, skip
    }
  }

  // Strategy 2: Extract emails and phones from the page
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phoneRegex = /[\+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{7,}/g;
  const emails = text.match(emailRegex) ?? [];
  const phones = text.match(phoneRegex) ?? [];

  // If we found companies via links, try to match emails to them
  if (results.length > 0 && emails.length > 0) {
    for (const result of results) {
      if (!result.contactEmail && result.website) {
        try {
          const domain = new URL(result.website).hostname.replace("www.", "");
          const matchingEmail = emails.find((e) => e.includes(domain));
          if (matchingEmail) {
            result.contactEmail = matchingEmail;
          }
        } catch {
          // skip
        }
      }
    }
  }

  // Strategy 3: If no company links found, try extracting from text patterns
  if (results.length === 0) {
    // Look for "Company Name - Description" or "Company Name | Location" patterns
    const linePatterns =
      text.match(/(?:^|\n)([A-Z][A-Za-z0-9\s&.,'-]{3,60})(?:\s*[-|–]\s*)/gm) ??
      [];

    for (const match of linePatterns.slice(0, 30)) {
      const name = match.replace(/^\n/, "").replace(/\s*[-|–]\s*$/, "").trim();
      if (name.length >= 3 && name.length <= 60) {
        results.push({
          name,
          sourceDirectory: directoryName,
        });
      }
    }
  }

  return results;
}

// ── Pipeline Integration ──

/**
 * Crawl a directory and extract company listings.
 * Used by the scrape pipeline when sourceType is "directory".
 */
export async function scrapeDirectory(
  config: DirectoryConfig
): Promise<DirectoryListing[]> {
  const pages = await crawlPages([config.url], {
    maxRequests: config.maxPages ?? 20,
    maxConcurrency: 2,
  });

  return extractDirectoryListings(pages, config.name);
}

/**
 * Scrape multiple directories and return deduplicated results.
 */
export async function scrapeDirectoriesMulti(
  configs: DirectoryConfig[]
): Promise<DirectoryListing[]> {
  const allListings: DirectoryListing[] = [];
  const seenNames = new Set<string>();

  for (const config of configs) {
    try {
      const listings = await scrapeDirectory(config);
      for (const listing of listings) {
        const key = listing.name.toLowerCase().trim();
        if (!seenNames.has(key)) {
          seenNames.add(key);
          allListings.push(listing);
        }
      }
    } catch (err) {
      console.error(`Failed to scrape directory ${config.name}:`, err);
    }
  }

  return allListings;
}
