/**
 * Bulk enrichment script — Hunter Domain Search + Gravatar for all companies.
 * Run: node scripts/bulk-enrich.mjs
 *
 * Uses Hunter free plan (50 searches/mo) + Gravatar (free).
 * Adds 5-10 sec delay between requests to avoid rate limiting.
 */

import { createHash } from "crypto";

const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!HUNTER_API_KEY) {
  console.error("HUNTER_API_KEY not set");
  process.exit(1);
}

// ── Prisma setup ──
const { createRequire } = await import("module");
const require = createRequire(import.meta.url);
// Resolve from packages/db which has @prisma/client
const prismaPath = require.resolve("@prisma/client", {
  paths: [new URL("../packages/db", import.meta.url).pathname],
});
const { PrismaClient } = await import(prismaPath);
const prisma = new PrismaClient();

// ── Hunter API ──
async function hunterDomainSearch(domain) {
  const params = new URLSearchParams({
    domain,
    api_key: HUNTER_API_KEY,
    limit: "10",
  });
  const res = await fetch(`https://api.hunter.io/v2/domain-search?${params}`);
  if (res.status === 429) {
    console.log("    Rate limited, waiting 15s...");
    await sleep(15000);
    return hunterDomainSearch(domain); // retry once
  }
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

async function hunterVerifyEmail(email) {
  const params = new URLSearchParams({
    email,
    api_key: HUNTER_API_KEY,
  });
  const res = await fetch(`https://api.hunter.io/v2/email-verifier?${params}`);
  if (res.status === 429) {
    await sleep(15000);
    return hunterVerifyEmail(email);
  }
  if (!res.ok) return null;
  const json = await res.json();
  return {
    valid: json.data?.result === "deliverable" || json.data?.result === "risky",
    score: json.data?.score ?? 0,
    status: json.data?.result ?? "unknown",
  };
}

// ── Gravatar ──
async function getGravatarUrl(email) {
  const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  const url = `https://gravatar.com/avatar/${hash}?d=404&s=200`;
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return res.ok ? `https://gravatar.com/avatar/${hash}?s=200` : null;
  } catch {
    return null;
  }
}

// ── Helpers ──
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ──
async function main() {
  // Get all companies with websites
  const companies = await prisma.company.findMany({
    where: { deletedAt: null, website: { not: null } },
    select: {
      id: true,
      name: true,
      website: true,
      country: true,
      score: true,
      _count: { select: { contacts: true } },
      contacts: {
        where: { email: { not: null } },
        select: { email: true },
        take: 1,
      },
    },
    orderBy: { score: "desc" },
  });

  console.log(`Found ${companies.length} companies with websites`);

  // Check Hunter credits
  const creditsRes = await fetch(
    `https://api.hunter.io/v2/account?api_key=${HUNTER_API_KEY}`
  );
  const creditsJson = await creditsRes.json();
  const searches = creditsJson.data?.requests?.searches;
  const verifications = creditsJson.data?.requests?.verifications;
  console.log(`Hunter searches: ${searches?.used}/${searches?.available} used`);
  console.log(`Hunter verifications: ${verifications?.used}/${verifications?.available} used`);
  console.log("");

  const searchesLeft = (searches?.available ?? 0) - (searches?.used ?? 0);
  if (searchesLeft < 5) {
    console.error("Not enough Hunter searches left. Aborting.");
    process.exit(1);
  }

  let enriched = 0;
  let contactsAdded = 0;
  let emailsFound = 0;
  let photosFound = 0;
  let skipped = 0;

  for (const company of companies) {
    const domain = extractDomain(company.website);
    if (!domain) {
      console.log(`[SKIP] ${company.name} — invalid website`);
      skipped++;
      continue;
    }

    // Skip if already has contacts with email
    if (company.contacts.length > 0) {
      console.log(`[SKIP] ${company.name} — already has email contacts`);
      skipped++;
      continue;
    }

    if (enriched >= searchesLeft) {
      console.log(`\nStopping: Hunter search limit reached (${searchesLeft})`);
      break;
    }

    console.log(`\n[${enriched + 1}] ${company.name} (${domain}) — score ${company.score}`);

    // Hunter Domain Search
    await sleep(8000); // Rate limit protection
    const hunterData = await hunterDomainSearch(domain);

    if (!hunterData || !hunterData.emails?.length) {
      console.log("    No emails found by Hunter");
      enriched++;
      continue;
    }

    console.log(`    Found ${hunterData.emails.length} emails at ${domain}`);

    // Get existing contacts
    const existingContacts = await prisma.contact.findMany({
      where: { companyId: company.id },
      select: { id: true, email: true, name: true },
    });
    const existingEmails = new Set(
      existingContacts.map((c) => c.email?.toLowerCase()).filter(Boolean)
    );

    const priorityTitles =
      /\b(CEO|Managing Director|General Manager|Sales Director|VP Sales|Head of Sales|Business Development|Commercial Director|Founder|Owner)\b/i;
    let hasPrimary = existingContacts.some(() => false); // check if any existing is primary

    for (const he of hunterData.emails) {
      if (existingEmails.has(he.value.toLowerCase())) continue;

      const name = [he.first_name, he.last_name].filter(Boolean).join(" ");
      if (!name && he.type === "generic") continue; // skip info@ without name

      // Check if we have an <UNKNOWN> contact to update
      const unknownContact = existingContacts.find(
        (c) => c.name === "<UNKNOWN>" && !c.email
      );

      if (unknownContact) {
        await prisma.contact.update({
          where: { id: unknownContact.id },
          data: {
            ...(name && { name }),
            email: he.value,
            ...(he.position && { title: he.position }),
            isPrimary: !hasPrimary && priorityTitles.test(he.position || ""),
          },
        });
        console.log(`    Updated: ${name || "?"} — ${he.value} (${he.position || "no title"})`);
      } else {
        const isPrimary = !hasPrimary && priorityTitles.test(he.position || "");
        if (isPrimary) hasPrimary = true;

        await prisma.contact.create({
          data: {
            companyId: company.id,
            name: name || "Unknown",
            email: he.value,
            title: he.position || null,
            isPrimary,
          },
        });
        console.log(`    Added: ${name || "?"} — ${he.value} (${he.position || "no title"})`);
      }

      existingEmails.add(he.value.toLowerCase());
      emailsFound++;
      contactsAdded++;

      // Gravatar photo
      const photoUrl = await getGravatarUrl(he.value);
      if (photoUrl) {
        const contact = await prisma.contact.findFirst({
          where: { companyId: company.id, email: he.value },
          select: { id: true },
        });
        if (contact) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: { photoUrl },
          });
          photosFound++;
          console.log(`    Photo found for ${name}`);
        }
      }
    }

    enriched++;
  }

  console.log("\n" + "=".repeat(50));
  console.log("ENRICHMENT COMPLETE");
  console.log(`Companies processed: ${enriched}`);
  console.log(`Companies skipped: ${skipped}`);
  console.log(`Contacts added/updated: ${contactsAdded}`);
  console.log(`Emails found: ${emailsFound}`);
  console.log(`Photos found: ${photosFound}`);
  console.log("=".repeat(50));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
