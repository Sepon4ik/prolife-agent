import { crawlPages, type CrawlResult } from "./crawler";

// ── Types ──

export interface RegulatoryListing {
  name: string;
  country: string;
  licenseNumber?: string;
  licenseType?: string;
  products?: string[];
  address?: string;
  website?: string;
  contactEmail?: string;
  contactPhone?: string;
  sourceRegistry: string;
  sourceUrl: string;
}

export interface RegulatorySource {
  name: string;
  country: string;
  /** URL to start crawling or API endpoint */
  url: string;
  /** Max pages to crawl */
  maxPages: number;
  /** How to extract data from the pages */
  type: "crawl" | "api";
}

// ── Regulatory sources by country ──

/**
 * Get regulatory database sources for target countries.
 * These are government registries of licensed pharma importers/distributors.
 */
export function getRegulatorySourcesForCountry(
  country: string
): RegulatorySource[] {
  const sources: Record<string, RegulatorySource[]> = {
    Indonesia: [
      {
        name: "BPOM Licensed Distributors",
        country: "Indonesia",
        url: "https://cekbpom.pom.go.id/",
        maxPages: 20,
        type: "crawl",
      },
      {
        name: "Indonesia Pharma Importers",
        country: "Indonesia",
        url: "https://www.bpom.go.id/registrasi-obat",
        maxPages: 15,
        type: "crawl",
      },
    ],
    Pakistan: [
      {
        name: "DRAP Licensed Manufacturers & Importers",
        country: "Pakistan",
        url: "https://www.dfrplicensing.pk/PublicSearchResult.aspx",
        maxPages: 20,
        type: "crawl",
      },
    ],
    Bangladesh: [
      {
        name: "DGDA Licensed Pharma Companies",
        country: "Bangladesh",
        url: "https://www.dgda.gov.bd/index.php/drug-info",
        maxPages: 15,
        type: "crawl",
      },
    ],
    Philippines: [
      {
        name: "FDA Philippines Licensed Establishments",
        country: "Philippines",
        url: "https://verification.fda.gov.ph/",
        maxPages: 20,
        type: "crawl",
      },
    ],
    Vietnam: [
      {
        name: "Vietnam DAV Pharma Registry",
        country: "Vietnam",
        url: "https://dichvucong.dav.gov.vn/",
        maxPages: 15,
        type: "crawl",
      },
    ],
    UAE: [
      {
        name: "UAE MOH Licensed Importers",
        country: "UAE",
        url: "https://www.mohap.gov.ae/en/services/pharmaceutical-facilities",
        maxPages: 15,
        type: "crawl",
      },
    ],
    Nigeria: [
      {
        name: "NAFDAC Licensed Importers",
        country: "Nigeria",
        url: "https://www.nafdac.gov.ng/",
        maxPages: 15,
        type: "crawl",
      },
    ],
    Kenya: [
      {
        name: "PPB Kenya Licensed Distributors",
        country: "Kenya",
        url: "https://pharmacyboardkenya.org/",
        maxPages: 15,
        type: "crawl",
      },
    ],
  };

  const lowerCountry = country.toLowerCase();
  const match = Object.entries(sources).find(
    ([key]) => key.toLowerCase() === lowerCountry
  );

  return match ? match[1] : [];
}

/** Get all supported countries */
export function getSupportedRegulatoryCountries(): string[] {
  return [
    "Indonesia",
    "Pakistan",
    "Bangladesh",
    "Philippines",
    "Vietnam",
    "UAE",
    "Nigeria",
    "Kenya",
  ];
}

// ── Extraction ──

/**
 * Extract company listings from regulatory pages.
 * Uses heuristic patterns — regulatory sites typically list:
 * - Company/establishment name
 * - License/registration number
 * - Address
 * - Contact info
 */
export function extractRegulatoryListings(
  pages: CrawlResult[],
  source: RegulatorySource
): RegulatoryListing[] {
  const listings: RegulatoryListing[] = [];
  const seenNames = new Set<string>();

  for (const page of pages) {
    const text = page.text ?? "";

    // Extract emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = text.match(emailRegex) ?? [];

    // Extract phone numbers
    const phoneRegex = /[\+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{7,}/g;
    const phones = text.match(phoneRegex) ?? [];

    // Extract potential company names — look for patterns in links
    for (const link of page.links) {
      const name = link.text.trim();
      if (
        name.length >= 3 &&
        name.length <= 100 &&
        !seenNames.has(name.toLowerCase()) &&
        // Filter out navigation/generic links
        !isNavigationText(name)
      ) {
        seenNames.add(name.toLowerCase());

        // Try to find a website URL for this company
        let website: string | undefined;
        try {
          const linkUrl = new URL(link.href, page.url);
          const pageHost = new URL(page.url).hostname;
          if (linkUrl.hostname !== pageHost) {
            website = linkUrl.href;
          }
        } catch {
          // skip
        }

        listings.push({
          name,
          country: source.country,
          website,
          contactEmail: emails[0],
          contactPhone: phones[0],
          sourceRegistry: source.name,
          sourceUrl: page.url,
        });
      }
    }

    // Also extract from text patterns: lines that look like company names
    // (capitalized, followed by license-like numbers)
    const licensePattern =
      /([A-Z][A-Za-z\s&.,'-]{3,60})\s*(?:[-–:]\s*)?(?:License|Reg|No|#|Izin|SIUP|CDOB)\s*[.:#]?\s*([A-Z0-9/-]+)/g;
    let match: RegExpExecArray | null;
    while ((match = licensePattern.exec(text)) !== null) {
      const name = match[1].trim();
      const license = match[2].trim();
      if (!seenNames.has(name.toLowerCase()) && name.length >= 3) {
        seenNames.add(name.toLowerCase());
        listings.push({
          name,
          country: source.country,
          licenseNumber: license,
          sourceRegistry: source.name,
          sourceUrl: page.url,
        });
      }
    }
  }

  return listings;
}

function isNavigationText(text: string): boolean {
  const navWords = [
    "home",
    "about",
    "contact",
    "login",
    "register",
    "search",
    "menu",
    "back",
    "next",
    "previous",
    "read more",
    "click here",
    "download",
    "privacy",
    "terms",
    "cookie",
    "faq",
    "help",
    "sitemap",
  ];
  return navWords.some((w) => text.toLowerCase() === w);
}

// ── Pipeline Integration ──

/**
 * Scrape a regulatory source and extract licensed companies.
 */
export async function scrapeRegulatorySource(
  source: RegulatorySource
): Promise<RegulatoryListing[]> {
  const pages = await crawlPages([source.url], {
    maxRequests: source.maxPages,
    maxConcurrency: 2,
  });

  return extractRegulatoryListings(pages, source);
}

/**
 * Scrape all regulatory sources for a country.
 */
export async function scrapeRegulatoryByCountry(
  country: string
): Promise<RegulatoryListing[]> {
  const sources = getRegulatorySourcesForCountry(country);
  if (sources.length === 0) {
    console.warn(`No regulatory sources configured for ${country}`);
    return [];
  }

  const allListings: RegulatoryListing[] = [];
  const seenNames = new Set<string>();

  for (const source of sources) {
    try {
      const listings = await scrapeRegulatorySource(source);
      for (const listing of listings) {
        const key = listing.name.toLowerCase();
        if (!seenNames.has(key)) {
          seenNames.add(key);
          allListings.push(listing);
        }
      }
    } catch (err) {
      console.error(`Failed to scrape ${source.name}:`, err);
    }
  }

  return allListings;
}
