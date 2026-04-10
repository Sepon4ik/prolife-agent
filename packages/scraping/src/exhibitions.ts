import { crawlPages, type CrawlResult } from "./crawler";

// ── Types ──

export interface ExhibitionEvent {
  name: string;
  /** URL of the exhibitor list page */
  exhibitorListUrl: string;
  /** Date range of the event */
  dateRange?: string;
  /** Location of the event */
  location?: string;
  /** Focus area */
  focus: string;
  /** Max pages to crawl for exhibitor list */
  maxPages: number;
}

export interface ExhibitorFromList {
  name: string;
  country?: string;
  website?: string;
  boothNumber?: string;
  description?: string;
  categories?: string[];
  sourceExhibition: string;
}

// ── Curated Exhibition Database ──

/**
 * Major pharma/supplement/health exhibitions with exhibitor list URLs.
 * These lists are publicly available and updated annually.
 * Sorted by relevance to ProLife's target markets.
 */
export function getPharmaExhibitions(): ExhibitionEvent[] {
  return [
    // Tier 1 — Core pharma/supplement exhibitions
    {
      name: "CPhI Worldwide",
      exhibitorListUrl: "https://www.cphi.com/europe/en/visit/exhibitor-list.html",
      location: "Europe (rotating)",
      focus: "Pharma ingredients, finished dosage, packaging",
      maxPages: 50,
    },
    {
      name: "CPhI South East Asia",
      exhibitorListUrl: "https://www.cphi.com/sea/en/visit/exhibitor-list.html",
      location: "Southeast Asia",
      focus: "Pharma for SEA markets — Indonesia, Vietnam, Philippines, Thailand",
      maxPages: 30,
    },
    {
      name: "CPhI Middle East & Africa",
      exhibitorListUrl: "https://www.cphi.com/mea/en/visit/exhibitor-list.html",
      location: "Middle East",
      focus: "Pharma for MENA + Africa — UAE, Saudi, Nigeria, Kenya, Egypt",
      maxPages: 30,
    },
    {
      name: "Vitafoods Europe",
      exhibitorListUrl: "https://www.vitafoods.eu.com/en/visit/exhibitor-list.html",
      location: "Geneva, Switzerland",
      focus: "Nutraceuticals, supplements, functional foods — CORE for ProLife",
      maxPages: 40,
    },
    {
      name: "Vitafoods Asia",
      exhibitorListUrl: "https://www.vitafoodsasia.com/en/visit/exhibitor-list.html",
      location: "Bangkok, Thailand",
      focus: "Supplements & nutraceuticals for Asian markets",
      maxPages: 30,
    },
    {
      name: "Arab Health",
      exhibitorListUrl: "https://www.arabhealthonline.com/en/exhibitor-list.html",
      location: "Dubai, UAE",
      focus: "Healthcare, medical devices, pharma — UAE gateway",
      maxPages: 40,
    },
    {
      name: "Medica Dusseldorf",
      exhibitorListUrl: "https://www.medica-tradefair.com/vis/v1/en/search?f_type=exhibitor&oid=64906&lang=2",
      location: "Dusseldorf, Germany",
      focus: "Medical devices, health products — world's largest medical trade fair",
      maxPages: 30,
    },

    // Tier 2 — Regional exhibitions
    {
      name: "AIME Asia",
      exhibitorListUrl: "https://www.aimexpo.com.au/exhibitors/",
      location: "Asia-Pacific",
      focus: "Medical and pharma for Asia-Pacific",
      maxPages: 20,
    },
    {
      name: "PharmaTech Expo (India/Pakistan)",
      exhibitorListUrl: "https://www.pharmatechexpo.com/exhibitor-list.php",
      location: "India",
      focus: "Pharma manufacturing, distribution — India + Pakistan corridor",
      maxPages: 20,
    },
    {
      name: "ISPE South East Asia",
      exhibitorListUrl: "https://ispe.org/conferences",
      location: "SEA rotating",
      focus: "Pharma engineering and manufacturing",
      maxPages: 15,
    },
    {
      name: "Beautyworld Middle East",
      exhibitorListUrl: "https://beautyworld-middle-east.ae.messefrankfurt.com/dubai/en/planning-preparation/exhibitor-search.html",
      location: "Dubai, UAE",
      focus: "Beauty, cosmetics, derma — relevant for dermo-cosmetics line",
      maxPages: 25,
    },
    {
      name: "in-cosmetics Global",
      exhibitorListUrl: "https://www.in-cosmetics.com/global/en-gb/lp/exhibitor-list.html",
      location: "Europe (rotating)",
      focus: "Cosmetic ingredients and formulation — dermo-cosmetics",
      maxPages: 25,
    },
  ];
}

/**
 * Filter exhibitions relevant to specific markets or product types.
 */
export function filterExhibitions(options: {
  region?: "asia" | "middle_east" | "africa" | "europe" | "global";
  productFocus?: "pharma" | "supplements" | "cosmetics" | "devices";
}): ExhibitionEvent[] {
  const all = getPharmaExhibitions();

  return all.filter((ex) => {
    if (options.region) {
      const locationLower = (ex.location ?? "").toLowerCase();
      const nameLower = ex.name.toLowerCase();
      switch (options.region) {
        case "asia":
          return (
            locationLower.includes("asia") ||
            locationLower.includes("bangkok") ||
            nameLower.includes("asia") ||
            nameLower.includes("sea")
          );
        case "middle_east":
          return (
            locationLower.includes("dubai") ||
            locationLower.includes("middle east") ||
            nameLower.includes("arab")
          );
        case "europe":
          return (
            locationLower.includes("europe") ||
            locationLower.includes("geneva") ||
            locationLower.includes("dusseldorf")
          );
        default:
          return true;
      }
    }

    if (options.productFocus) {
      const focusLower = ex.focus.toLowerCase();
      switch (options.productFocus) {
        case "supplements":
          return (
            focusLower.includes("supplement") ||
            focusLower.includes("nutraceutical")
          );
        case "cosmetics":
          return (
            focusLower.includes("cosmetic") || focusLower.includes("beauty")
          );
        case "devices":
          return focusLower.includes("device") || focusLower.includes("medical");
        default:
          return true;
      }
    }

    return true;
  });
}

// ── Extraction ──

/**
 * Extract exhibitors from exhibition pages.
 * Exhibition sites typically have structured exhibitor listings with
 * company name, country, booth number, and sometimes website/category.
 */
export function extractExhibitorsFromList(
  pages: CrawlResult[],
  exhibitionName: string
): ExhibitorFromList[] {
  const exhibitors: ExhibitorFromList[] = [];
  const seenNames = new Set<string>();

  for (const page of pages) {
    // Strategy 1: Extract from links (most exhibitor lists link to company profiles)
    for (const link of page.links) {
      const name = link.text.trim();
      if (
        name.length >= 2 &&
        name.length <= 100 &&
        !seenNames.has(name.toLowerCase()) &&
        !isBoilerplate(name)
      ) {
        seenNames.add(name.toLowerCase());
        exhibitors.push({
          name,
          sourceExhibition: exhibitionName,
        });
      }
    }

    // Strategy 2: Extract country info from text around company names
    const text = page.text ?? "";
    const countryPattern =
      /([A-Z][A-Za-z\s&.,'-]{2,50})\s*[-–|]\s*(Indonesia|Pakistan|Bangladesh|Philippines|Vietnam|UAE|Nigeria|Kenya|India|Thailand|Malaysia|Egypt|Saudi Arabia|Turkey|China|Germany|USA|UK|France|Italy|Spain|Japan|South Korea|Singapore)/g;

    let match: RegExpExecArray | null;
    while ((match = countryPattern.exec(text)) !== null) {
      const name = match[1].trim();
      const country = match[2];
      const existing = exhibitors.find(
        (e) => e.name.toLowerCase() === name.toLowerCase()
      );
      if (existing) {
        existing.country = country;
      }
    }
  }

  return exhibitors;
}

function isBoilerplate(text: string): boolean {
  const boilerplate = [
    "home",
    "about",
    "contact",
    "login",
    "register",
    "search",
    "exhibitor list",
    "floor plan",
    "visit",
    "exhibit",
    "conference",
    "agenda",
    "speakers",
    "sponsors",
    "privacy",
    "terms",
    "cookie",
    "back to top",
    "load more",
    "show more",
    "view all",
    "read more",
  ];
  return boilerplate.some((w) => text.toLowerCase() === w);
}

// ── Pipeline Integration ──

/**
 * Scrape exhibitor list from a specific exhibition.
 */
export async function scrapeExhibition(
  exhibition: ExhibitionEvent
): Promise<ExhibitorFromList[]> {
  const pages = await crawlPages([exhibition.exhibitorListUrl], {
    maxRequests: exhibition.maxPages,
    maxConcurrency: 2,
  });

  return extractExhibitorsFromList(pages, exhibition.name);
}

/**
 * Scrape multiple exhibitions and return deduplicated exhibitors.
 */
export async function scrapeExhibitionsMulti(
  exhibitions: ExhibitionEvent[]
): Promise<ExhibitorFromList[]> {
  const allExhibitors: ExhibitorFromList[] = [];
  const seenNames = new Set<string>();

  for (const exhibition of exhibitions) {
    try {
      const exhibitors = await scrapeExhibition(exhibition);
      for (const exhibitor of exhibitors) {
        const key = exhibitor.name.toLowerCase();
        if (!seenNames.has(key)) {
          seenNames.add(key);
          allExhibitors.push(exhibitor);
        }
      }
    } catch (err) {
      console.error(`Failed to scrape ${exhibition.name}:`, err);
    }
  }

  return allExhibitors;
}
