/**
 * Enrichment Waterfall — cascading contact enrichment.
 *
 * Given a company domain, finds decision-makers and enriches each
 * through multiple sources until all key fields are filled.
 *
 * Cascade: Apollo Search (free) → Hunter Domain → Hunter Find Email
 *        → Gravatar (free) → Apollo Enrich (paid, optional)
 *
 * Stops early per contact when required fields are filled.
 */

import { searchApolloFree, findPeopleAtCompany, type ApolloPersonResult } from "./apollo";
import { hunterDomainSearch, hunterFindEmail, hunterVerifyEmail } from "./hunter";
import { getGravatarUrl } from "./gravatar";

// ── Types ──

export interface EnrichedContact {
  name: string;
  firstName: string;
  lastName: string;
  title: string | null;
  email: string | null;
  emailVerified: boolean;
  emailScore: number;
  phone: string | null;
  linkedin: string | null;
  photoUrl: string | null;
  seniority: string | null;
  department: string | null;
  sources: string[]; // which providers contributed data
}

export interface EnrichmentResult {
  companyDomain: string;
  contacts: EnrichedContact[];
  stats: {
    apolloFound: number;
    hunterFound: number;
    emailsVerified: number;
    photosFound: number;
    totalCost: number; // estimated USD
  };
}

// ── Waterfall Engine ──

/**
 * Full enrichment pipeline for a company.
 *
 * 1. Apollo People Search (FREE) — find names + titles + LinkedIn
 * 2. Hunter Domain Search — find emails at domain
 * 3. For each person without email: Hunter Find Email by name
 * 4. For each email found: Hunter Verify
 * 5. For each person: Gravatar photo (free)
 */
export async function enrichCompanyContacts(
  companyDomain: string,
  companyName: string,
  options: {
    maxContacts?: number;
    skipVerification?: boolean;
  } = {}
): Promise<EnrichmentResult> {
  const maxContacts = options.maxContacts ?? 10;
  const contacts = new Map<string, EnrichedContact>(); // key = normalized name
  const stats = {
    apolloFound: 0,
    hunterFound: 0,
    emailsVerified: 0,
    photosFound: 0,
    totalCost: 0,
  };

  // ── Step 1: Apollo People Search (FREE) ──
  const apolloPeople = await findPeopleAtCompany(companyDomain, {
    maxResults: maxContacts,
  });

  for (const person of apolloPeople) {
    const key = normalizeName(person.name);
    if (!key || contacts.has(key)) continue;

    contacts.set(key, {
      name: person.name,
      firstName: person.firstName,
      lastName: person.lastName,
      title: person.title || null,
      email: null,
      emailVerified: false,
      emailScore: 0,
      phone: null,
      linkedin: person.linkedinUrl || null,
      photoUrl: person.photoUrl || null,
      seniority: person.seniority || null,
      department: person.department || null,
      sources: ["apollo_search"],
    });
    stats.apolloFound++;
  }

  // ── Step 2: Hunter Domain Search ──
  const hunterDomain = await hunterDomainSearch(companyDomain);
  if (hunterDomain) {
    stats.totalCost += 0.01; // ~1 request

    for (const he of hunterDomain.emails) {
      if (he.type === "generic") continue; // skip info@, contact@

      const name =
        he.firstName && he.lastName
          ? `${he.firstName} ${he.lastName}`
          : null;
      const key = name ? normalizeName(name) : `email:${he.value}`;

      if (contacts.has(key)) {
        // Merge email into existing contact
        const existing = contacts.get(key)!;
        if (!existing.email) {
          existing.email = he.value;
          existing.emailScore = he.confidence;
          existing.sources.push("hunter_domain");
          stats.hunterFound++;
        }
      } else if (name && contacts.size < maxContacts) {
        // New contact from Hunter
        contacts.set(key, {
          name,
          firstName: he.firstName ?? "",
          lastName: he.lastName ?? "",
          title: he.position || null,
          email: he.value,
          emailVerified: false,
          emailScore: he.confidence,
          phone: null,
          linkedin: null,
          photoUrl: null,
          seniority: null,
          department: null,
          sources: ["hunter_domain"],
        });
        stats.hunterFound++;
      }
    }
  }

  // ── Step 3: Hunter Find Email for contacts without email ──
  for (const contact of contacts.values()) {
    if (contact.email) continue;
    if (!contact.firstName || !contact.lastName) continue;

    const found = await hunterFindEmail(
      companyDomain,
      contact.firstName,
      contact.lastName
    );
    if (found?.email) {
      contact.email = found.email;
      contact.emailScore = found.score;
      if (!contact.title && found.position) contact.title = found.position;
      contact.sources.push("hunter_find");
      stats.hunterFound++;
      stats.totalCost += 0.01;
    }
  }

  // ── Step 4: Verify emails ──
  if (!options.skipVerification) {
    for (const contact of contacts.values()) {
      if (!contact.email) continue;

      const verification = await hunterVerifyEmail(contact.email);
      if (verification) {
        contact.emailVerified = verification.valid;
        contact.emailScore = verification.score;
        stats.emailsVerified++;
        stats.totalCost += 0.01;
      }
    }
  }

  // ── Step 5: Gravatar photos (FREE) ──
  for (const contact of contacts.values()) {
    if (contact.photoUrl) continue; // already have photo from Apollo
    if (!contact.email) continue;

    const gravatarUrl = await getGravatarUrl(contact.email);
    if (gravatarUrl) {
      contact.photoUrl = gravatarUrl;
      contact.sources.push("gravatar");
      stats.photosFound++;
    }
  }

  // Count photos from Apollo
  stats.photosFound += Array.from(contacts.values()).filter(
    (c) => c.photoUrl && c.sources.includes("apollo_search")
  ).length;

  return {
    companyDomain,
    contacts: Array.from(contacts.values()),
    stats,
  };
}

// ── Helpers ──

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}
