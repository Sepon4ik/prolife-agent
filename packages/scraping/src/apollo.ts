/**
 * Apollo.io Free Search Integration.
 *
 * The mixed_people/search endpoint is FREE — no credits consumed.
 * Returns list of people (names, titles, companies) matching filters.
 * Email/phone reveal costs credits, but SEARCH is free.
 *
 * Use case: find decision-makers at target companies without paying.
 * Then use our existing waterfall (Hunter, pattern guess) for emails.
 *
 * Requires APOLLO_API_KEY env var.
 * API docs: https://docs.apollo.io/reference/people-enrichment
 */

// ── Types ──

export interface ApolloPersonResult {
  name: string;
  firstName: string;
  lastName: string;
  title: string;
  seniority: string;
  department: string;
  linkedinUrl?: string;
  photoUrl?: string;
  city?: string;
  country?: string;
  companyName: string;
  companyDomain?: string;
  companyIndustry?: string;
  companySize?: string;
}

export interface ApolloSearchOptions {
  /** Job titles to search for */
  titles?: string[];
  /** Seniority levels: owner, founder, c_suite, partner, vp, head, director, manager */
  seniorityLevels?: string[];
  /** Person location country codes */
  personLocationCountries?: string[];
  /** Company domains to search within */
  companyDomains?: string[];
  /** Company name keywords */
  companyNames?: string[];
  /** Industry keywords */
  industries?: string[];
  /** Company size ranges: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001+" */
  companySizes?: string[];
  /** Page number (1-based) */
  page?: number;
  /** Results per page (max 100) */
  perPage?: number;
}

// ── API ──

/**
 * Search Apollo.io for people matching filters (FREE, no credits).
 * Returns names, titles, companies, LinkedIn URLs.
 * Does NOT return emails or phones (those cost credits).
 */
export async function searchApolloFree(
  options: ApolloSearchOptions
): Promise<ApolloPersonResult[]> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.warn("APOLLO_API_KEY not set, skipping Apollo search");
    return [];
  }

  const body: Record<string, unknown> = {
    page: options.page ?? 1,
    per_page: Math.min(options.perPage ?? 25, 100),
  };

  if (options.titles?.length) {
    body.person_titles = options.titles;
  }
  if (options.seniorityLevels?.length) {
    body.person_seniorities = options.seniorityLevels;
  }
  if (options.personLocationCountries?.length) {
    body.person_locations = options.personLocationCountries;
  }
  if (options.companyDomains?.length) {
    body.q_organization_domains_list = options.companyDomains;
  }
  if (options.companyNames?.length) {
    body.q_organization_name = options.companyNames.join(" OR ");
  }
  if (options.industries?.length) {
    body.organization_industry_tag_ids = options.industries;
  }
  if (options.companySizes?.length) {
    body.organization_num_employees_ranges = options.companySizes;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(
      "https://api.apollo.io/api/v1/mixed_people/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      if (res.status === 429) {
        console.warn("Apollo rate limit reached");
        return [];
      }
      const errText = await res.text().catch(() => "");
      throw new Error(`Apollo API error: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as {
      people?: Array<{
        first_name?: string;
        last_name?: string;
        name?: string;
        title?: string;
        seniority?: string;
        departments?: string[];
        linkedin_url?: string;
        photo_url?: string;
        city?: string;
        country?: string;
        organization?: {
          name?: string;
          primary_domain?: string;
          industry?: string;
          estimated_num_employees?: number;
        };
      }>;
    };

    return (data.people ?? []).map((p) => ({
      name: p.name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
      firstName: p.first_name ?? "",
      lastName: p.last_name ?? "",
      title: p.title ?? "",
      seniority: p.seniority ?? "",
      department: p.departments?.[0] ?? "",
      linkedinUrl: p.linkedin_url,
      photoUrl: p.photo_url,
      city: p.city,
      country: p.country,
      companyName: p.organization?.name ?? "",
      companyDomain: p.organization?.primary_domain,
      companyIndustry: p.organization?.industry,
      companySize: p.organization?.estimated_num_employees
        ? String(p.organization.estimated_num_employees)
        : undefined,
    }));
  } finally {
    clearTimeout(timeout);
  }
}

// ── Convenience functions ──

/**
 * Find decision-makers at pharma distributors in a target country.
 * Searches for relevant titles (CEO, Sales Director, BD) in pharma companies.
 */
export async function findDecisionMakers(
  country: string,
  options: { companyDomain?: string; maxResults?: number } = {}
): Promise<ApolloPersonResult[]> {
  const searchOptions: ApolloSearchOptions = {
    titles: [
      "CEO",
      "Managing Director",
      "General Manager",
      "Sales Director",
      "VP Sales",
      "Head of Sales",
      "Business Development Director",
      "Business Development Manager",
      "Commercial Director",
      "Purchasing Director",
      "Procurement Manager",
      "Import Manager",
    ],
    seniorityLevels: ["owner", "founder", "c_suite", "vp", "director"],
    personLocationCountries: [country],
    perPage: options.maxResults ?? 25,
  };

  if (options.companyDomain) {
    searchOptions.companyDomains = [options.companyDomain];
  }

  return searchApolloFree(searchOptions);
}

/**
 * Search for people at specific companies (by domain).
 * Useful after we scrape a company website — find their team via Apollo.
 */
export async function findPeopleAtCompany(
  companyDomain: string,
  options: { titles?: string[]; maxResults?: number } = {}
): Promise<ApolloPersonResult[]> {
  return searchApolloFree({
    companyDomains: [companyDomain],
    titles: options.titles ?? [
      "CEO",
      "Managing Director",
      "Sales Director",
      "Business Development",
      "Commercial Director",
    ],
    seniorityLevels: ["owner", "founder", "c_suite", "vp", "director", "manager"],
    perPage: options.maxResults ?? 10,
  });
}
