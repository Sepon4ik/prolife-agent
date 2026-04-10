import * as cheerio from "cheerio";

// ── Types ──

export interface TradeRegistryResult {
  name: string;
  country: string;
  jurisdiction?: string;
  companyNumber?: string;
  status?: string;
  incorporationDate?: string;
  address?: string;
  officers?: string[];
  website?: string;
  sourceRegistry: string;
  sourceUrl: string;
}

// ── OpenCorporates API (free tier: 50 req/day, no key needed) ──

interface OpenCorpCompany {
  company: {
    name: string;
    company_number: string;
    jurisdiction_code: string;
    incorporation_date: string | null;
    current_status: string | null;
    registered_address_in_full: string | null;
    source: { url: string };
    officers?: Array<{
      officer: { name: string; position: string };
    }>;
  };
}

/**
 * Search OpenCorporates for companies matching a query.
 * Free API: 50 requests/day, no API key needed.
 * Paid: $100/mo for 10k requests.
 *
 * https://api.opencorporates.com/documentation/API-Reference
 */
export async function searchOpenCorporates(
  query: string,
  options: {
    jurisdictionCode?: string;
    perPage?: number;
  } = {}
): Promise<TradeRegistryResult[]> {
  const perPage = Math.min(options.perPage ?? 30, 100);

  const params = new URLSearchParams({
    q: query,
    per_page: String(perPage),
    order: "score",
  });

  if (options.jurisdictionCode) {
    params.set("jurisdiction_code", options.jurisdictionCode);
  }

  // Add API token if available (higher rate limits)
  const apiToken = process.env.OPENCORPORATES_API_KEY;
  if (apiToken) {
    params.set("api_token", apiToken);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(
      `https://api.opencorporates.com/v0.4/companies/search?${params.toString()}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (compatible; ProLifeAgent/1.0; +https://prolife-agent.com)",
        },
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      if (res.status === 429) {
        console.warn("OpenCorporates rate limit reached (50/day on free tier)");
        return [];
      }
      throw new Error(`OpenCorporates API error: ${res.status}`);
    }

    const data = (await res.json()) as {
      results?: { companies?: OpenCorpCompany[] };
    };
    const companies: OpenCorpCompany[] = data?.results?.companies ?? [];

    return companies.map((item) => {
      const c = item.company;
      const jurisdictionToCountry = getCountryFromJurisdiction(
        c.jurisdiction_code
      );

      return {
        name: c.name,
        country: jurisdictionToCountry,
        jurisdiction: c.jurisdiction_code,
        companyNumber: c.company_number,
        status: c.current_status ?? undefined,
        incorporationDate: c.incorporation_date ?? undefined,
        address: c.registered_address_in_full ?? undefined,
        officers: c.officers?.map((o) => `${o.officer.name} (${o.officer.position})`) ?? [],
        sourceRegistry: "OpenCorporates",
        sourceUrl: c.source?.url ?? `https://opencorporates.com/companies/${c.jurisdiction_code}/${c.company_number}`,
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate trade registry search queries for pharma distributors.
 */
export function generateTradeRegistryQueries(
  country: string
): string[] {
  return [
    `pharmaceutical distributor ${country}`,
    `pharma wholesale ${country}`,
    `supplement distribution ${country}`,
    `nutraceutical ${country}`,
    `medical products import ${country}`,
  ];
}

/**
 * Search multiple queries across trade registries, deduplicate by company number.
 */
export async function searchTradeRegistriesMulti(
  queries: string[],
  options: { jurisdictionCode?: string; maxPerQuery?: number } = {}
): Promise<TradeRegistryResult[]> {
  const seen = new Set<string>();
  const results: TradeRegistryResult[] = [];

  for (const query of queries) {
    try {
      const companies = await searchOpenCorporates(query, {
        jurisdictionCode: options.jurisdictionCode,
        perPage: options.maxPerQuery ?? 20,
      });

      for (const company of companies) {
        const key = company.companyNumber
          ? `${company.jurisdiction}:${company.companyNumber}`
          : company.name.toLowerCase();

        if (!seen.has(key)) {
          seen.add(key);
          results.push(company);
        }
      }
    } catch (err) {
      console.error(`Trade registry search failed for "${query}":`, err);
    }

    // Rate limit: 2 seconds between queries (free tier is very limited)
    if (queries.indexOf(query) < queries.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return results;
}

// ── Helpers ──

/** Map OpenCorporates jurisdiction codes to country names */
function getCountryFromJurisdiction(code: string): string {
  const map: Record<string, string> = {
    // P1 markets
    id: "Indonesia",
    pk: "Pakistan",
    bd: "Bangladesh",
    ph: "Philippines",
    vn: "Vietnam",
    ae: "UAE",
    // P2 markets
    ng: "Nigeria",
    ke: "Kenya",
    tz: "Tanzania",
    gh: "Ghana",
    eg: "Egypt",
    // Common
    gb: "United Kingdom",
    us: "United States",
    de: "Germany",
    fr: "France",
    in: "India",
    sg: "Singapore",
    my: "Malaysia",
    th: "Thailand",
    sa: "Saudi Arabia",
    tr: "Turkey",
  };

  // jurisdiction_code is like "gb", "us_ca", "id"
  const countryCode = code.split("_")[0].toLowerCase();
  return map[countryCode] ?? code.toUpperCase();
}
