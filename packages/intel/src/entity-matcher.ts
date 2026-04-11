/**
 * Entity Matcher — links news items to companies in our database.
 *
 * When a news article mentions "ABC Pharma" and we have "ABC Pharma" in our
 * Company table, we link them. This creates the "your pipeline company is
 * in the news" feature.
 *
 * Matching strategy (in order of confidence):
 * 1. Exact match (after normalization)
 * 2. Normalized match (strip suffixes like Inc, Ltd, GmbH, etc.)
 * 3. Contains match (one name contains the other, min 4 chars)
 * 4. Token overlap (Jaccard similarity >= 0.6 on meaningful words)
 */

import { prisma } from "@agency/db";
import type { ProcessedNewsItem } from "./summarizer";

/** Corporate suffixes to strip for fuzzy matching */
const CORP_SUFFIXES =
  /\b(inc\.?|incorporated|corp\.?|corporation|ltd\.?|limited|llc|l\.l\.c\.?|gmbh|ag|s\.?a\.?|s\.?r\.?l\.?|plc|co\.?|company|group|holdings?|international|intl\.?|enterprises?|pharm(?:a|aceuticals?)?|laboratories|labs?|med(?:ical)?|healthcare|health\s?care|bio(?:tech|sciences?|logics?)?|therapeutics?|diagnostics?|devices?|sciences?)\b/gi;

/** Words too common to be meaningful in matching */
const STOP_WORDS = new Set([
  "the", "and", "of", "for", "in", "a", "an", "to", "at", "by", "on",
  "de", "la", "le", "el", "del", "das", "die", "der", "und",
]);

/**
 * Normalize a company name for matching:
 * lowercase, strip suffixes, trim extra whitespace and punctuation.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[""]/g, '"')
    .replace(CORP_SUFFIXES, "")
    .replace(/[.,\-–—&+!@#$%^*()\[\]{}|\\/<>:;"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract meaningful tokens from a normalized name */
function tokens(normalized: string): string[] {
  return normalized
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

/** Jaccard similarity between two token sets */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

type CompanyEntry = {
  id: string;
  name: string;
  normalized: string;
  tokens: string[];
};

/**
 * Match processed news items to companies in the database.
 * Uses multi-level fuzzy matching on entity names extracted by AI.
 *
 * Returns the items with companyId filled in where matched.
 */
export async function matchEntitiesToCompanies(
  tenantId: string,
  items: ProcessedNewsItem[]
): Promise<Array<ProcessedNewsItem & { companyId: string | null }>> {
  // Collect all unique entity names from all items
  const allEntities = new Set<string>();
  for (const item of items) {
    for (const entity of item.entities) {
      allEntities.add(entity);
    }
  }

  if (allEntities.size === 0) {
    return items.map((item) => ({ ...item, companyId: null }));
  }

  // Fetch all company names for this tenant
  const companies = await prisma.company.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });

  // Pre-compute normalized forms
  const companyEntries: CompanyEntry[] = companies.map((c) => {
    const norm = normalizeCompanyName(c.name);
    return {
      id: c.id,
      name: c.name,
      normalized: norm,
      tokens: tokens(norm),
    };
  });

  // Build exact-match map on normalized names
  const exactMap = new Map<string, string>();
  for (const entry of companyEntries) {
    exactMap.set(entry.normalized, entry.id);
  }

  // Match each item's entities against company names
  return items.map((item) => {
    const companyId = matchBestCompany(item.entities, companyEntries, exactMap);
    return { ...item, companyId };
  });
}

/** Try to match an entity list to a company, returning the best match or null */
function matchBestCompany(
  entities: string[],
  companies: CompanyEntry[],
  exactMap: Map<string, string>
): string | null {
  for (const entity of entities) {
    const entityNorm = normalizeCompanyName(entity);
    if (!entityNorm || entityNorm.length < 2) continue;

    // Level 1: Exact match on normalized name
    const exact = exactMap.get(entityNorm);
    if (exact) return exact;

    const entityTokens = tokens(entityNorm);

    for (const company of companies) {
      // Level 2: Contains match (with min length guard)
      if (entityNorm.length >= 4 && company.normalized.length >= 4) {
        if (
          entityNorm.includes(company.normalized) ||
          company.normalized.includes(entityNorm)
        ) {
          return company.id;
        }
      }

      // Level 3: Token overlap (Jaccard >= 0.6)
      if (entityTokens.length >= 2 && company.tokens.length >= 2) {
        const similarity = jaccardSimilarity(entityTokens, company.tokens);
        if (similarity >= 0.6) {
          return company.id;
        }
      }
    }
  }

  return null;
}

/**
 * Generate search queries from a topic's keywords.
 * Combines keywords with pharma-specific terms.
 */
export function topicToQueries(topic: {
  keywords: string[];
  countries: string[];
}): string[] {
  const queries: string[] = [];

  for (const keyword of topic.keywords) {
    queries.push(keyword);

    // Add country-specific variants
    for (const country of topic.countries) {
      queries.push(`${keyword} ${country}`);
    }
  }

  return queries.slice(0, 10);
}
