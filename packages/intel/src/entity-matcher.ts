/**
 * Entity Matcher — links news items to companies in our database.
 *
 * When a news article mentions "ABC Pharma" and we have "ABC Pharma" in our
 * Company table, we link them. This creates the "your pipeline company is
 * in the news" feature.
 */

import { prisma } from "@agency/db";
import type { ProcessedNewsItem } from "./summarizer";

/**
 * Match processed news items to companies in the database.
 * Uses fuzzy matching on entity names extracted by AI.
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
      allEntities.add(entity.toLowerCase().trim());
    }
  }

  if (allEntities.size === 0) {
    return items.map((item) => ({ ...item, companyId: null }));
  }

  // Fetch all company names for this tenant (for matching)
  const companies = await prisma.company.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });

  // Build a lookup map: lowercase name → company id
  const companyMap = new Map<string, string>();
  for (const company of companies) {
    companyMap.set(company.name.toLowerCase().trim(), company.id);
  }

  // Match each item's entities against company names
  return items.map((item) => {
    let matchedCompanyId: string | null = null;

    for (const entity of item.entities) {
      const entityLower = entity.toLowerCase().trim();

      // Exact match
      if (companyMap.has(entityLower)) {
        matchedCompanyId = companyMap.get(entityLower)!;
        break;
      }

      // Partial match: entity contains company name or vice versa
      for (const [companyName, companyId] of companyMap) {
        if (
          entityLower.includes(companyName) ||
          companyName.includes(entityLower)
        ) {
          // Only match if both are at least 4 chars (avoid false positives)
          if (entityLower.length >= 4 && companyName.length >= 4) {
            matchedCompanyId = companyId;
            break;
          }
        }
      }

      if (matchedCompanyId) break;
    }

    return { ...item, companyId: matchedCompanyId };
  });
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

  return queries.slice(0, 10); // Max 10 queries per topic
}
