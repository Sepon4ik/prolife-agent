/**
 * Mass scraping script — find pharma/medtech distributors across Eurasia.
 * Run: node scripts/mass-scrape.mjs
 *
 * Uses SerpAPI (Google Search) → extract company names + websites → save to DB.
 * Does NOT enrich contacts (run bulk-enrich.mjs after).
 */

// ── Prisma setup ──
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const prismaPath = require.resolve("@prisma/client", {
  paths: [new URL("../packages/db", import.meta.url).pathname],
});
const { PrismaClient } = await import(prismaPath);
const prisma = new PrismaClient();

const SERPAPI_KEY = process.env.SERPAPI_KEY;
if (!SERPAPI_KEY) { console.error("SERPAPI_KEY not set"); process.exit(1); }

// ── Search queries per region ──
const QUERIES = [
  // UAE / GCC (expand existing 33)
  { country: "United Arab Emirates", queries: [
    "pharmaceutical distributor UAE",
    "medical device distributor Dubai",
    "supplement distributor UAE",
    "dermo cosmetics distributor UAE",
    "OTC products distributor Abu Dhabi",
    "pharma wholesaler GCC",
    "health products distributor UAE list",
  ]},
  { country: "Saudi Arabia", queries: [
    "pharmaceutical distributor Saudi Arabia",
    "medical device distributor Riyadh",
    "supplement distributor KSA",
    "pharma wholesaler Jeddah",
    "health products distributor Saudi",
  ]},
  { country: "Egypt", queries: [
    "pharmaceutical distributor Egypt",
    "medical device distributor Cairo",
    "pharma wholesaler Egypt",
  ]},
  { country: "Turkey", queries: [
    "pharmaceutical distributor Turkey",
    "medical device distributor Istanbul",
    "supplement distributor Turkey",
    "pharma wholesaler Ankara",
  ]},
  // ASIA
  { country: "India", queries: [
    "pharmaceutical distributor India",
    "medical device distributor Mumbai",
    "supplement distributor Delhi",
    "pharma wholesaler India export",
    "health products distributor India",
  ]},
  { country: "Pakistan", queries: [
    "pharmaceutical distributor Pakistan",
    "medical device distributor Karachi",
    "pharma wholesaler Lahore",
  ]},
  { country: "Bangladesh", queries: [
    "pharmaceutical distributor Bangladesh",
    "medical device distributor Dhaka",
  ]},
  { country: "Indonesia", queries: [
    "pharmaceutical distributor Indonesia",
    "medical device distributor Jakarta",
    "supplement distributor Indonesia",
  ]},
  { country: "Philippines", queries: [
    "pharmaceutical distributor Philippines",
    "medical device distributor Manila",
  ]},
  { country: "Vietnam", queries: [
    "pharmaceutical distributor Vietnam",
    "medical device distributor Ho Chi Minh",
  ]},
  { country: "Thailand", queries: [
    "pharmaceutical distributor Thailand",
    "medical device distributor Bangkok",
  ]},
  { country: "South Korea", queries: [
    "pharmaceutical distributor South Korea",
    "medical device distributor Seoul",
  ]},
  { country: "Malaysia", queries: [
    "pharmaceutical distributor Malaysia",
    "medical device distributor Kuala Lumpur",
  ]},
  { country: "Singapore", queries: [
    "pharmaceutical distributor Singapore",
    "medical device distributor Singapore",
  ]},
  // CIS
  { country: "Uzbekistan", queries: [
    "pharmaceutical distributor Uzbekistan",
    "medical device distributor Tashkent",
    "pharma wholesaler Uzbekistan",
  ]},
  { country: "Kazakhstan", queries: [
    "pharmaceutical distributor Kazakhstan",
    "medical device distributor Almaty",
  ]},
  { country: "Georgia", queries: [
    "pharmaceutical distributor Georgia Tbilisi",
  ]},
  { country: "Azerbaijan", queries: [
    "pharmaceutical distributor Azerbaijan Baku",
  ]},
  // Africa
  { country: "Nigeria", queries: [
    "pharmaceutical distributor Nigeria",
    "medical device distributor Lagos",
  ]},
  { country: "Kenya", queries: [
    "pharmaceutical distributor Kenya Nairobi",
  ]},
  { country: "South Africa", queries: [
    "pharmaceutical distributor South Africa",
  ]},
];

// ── SerpAPI ──
async function googleSearch(query, country) {
  const params = new URLSearchParams({
    q: query,
    api_key: SERPAPI_KEY,
    engine: "google",
    num: "20",
    gl: getGoogleCountryCode(country),
  });
  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!res.ok) {
    console.log(`    SerpAPI error: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return (data.organic_results || []).map(r => ({
    title: r.title || "",
    url: r.link || "",
    snippet: r.snippet || "",
    domain: extractDomain(r.link),
  }));
}

// ── Helpers ──
function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

function getGoogleCountryCode(country) {
  const map = {
    "United Arab Emirates": "ae", "Saudi Arabia": "sa", "Egypt": "eg",
    "Turkey": "tr", "India": "in", "Pakistan": "pk", "Bangladesh": "bd",
    "Indonesia": "id", "Philippines": "ph", "Vietnam": "vn",
    "Thailand": "th", "South Korea": "kr", "Malaysia": "my",
    "Singapore": "sg", "Uzbekistan": "uz", "Kazakhstan": "kz",
    "Georgia": "ge", "Azerbaijan": "az", "Nigeria": "ng",
    "Kenya": "ke", "South Africa": "za",
  };
  return map[country] || "us";
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isCompanyWebsite(url) {
  const skip = [
    "youtube.com", "facebook.com", "linkedin.com", "twitter.com",
    "instagram.com", "wikipedia.org", "reddit.com", "amazon.com",
    "google.com", "yelp.com", "crunchbase.com", "zoominfo.com",
    "bloomberg.com", "reuters.com", "who.int", "fda.gov",
    "dnb.com", "glassdoor.com", "indeed.com", "trustpilot.com",
  ];
  return url && !skip.some(d => url.includes(d));
}

function cleanCompanyName(title) {
  // Remove common suffixes
  return title
    .replace(/\s*[-–—|]\s*.*/g, "") // "Company - Description" → "Company"
    .replace(/\s*(LLC|Ltd|Inc|Corp|GmbH|SA|AG|FZE|FZCO|FZ-LLC)\s*\.?\s*$/i, (m) => m) // keep these
    .trim()
    .substring(0, 200);
}

// ── Main ──
async function main() {
  // Get tenant
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { name: "ProLife", slug: "prolife" } });
  }

  // Get existing companies to avoid duplicates
  const existing = await prisma.company.findMany({
    where: { tenantId: tenant.id, deletedAt: null },
    select: { name: true, website: true, country: true },
  });
  const existingDomains = new Set(
    existing.map(c => c.website ? extractDomain(c.website) : null).filter(Boolean)
  );
  const existingNames = new Set(
    existing.map(c => c.name.toLowerCase().trim())
  );

  console.log(`Existing: ${existing.length} companies, ${existingDomains.size} unique domains`);
  console.log(`Regions: ${QUERIES.length}, Total queries: ${QUERIES.reduce((s, r) => s + r.queries.length, 0)}`);
  console.log("");

  let totalNew = 0;
  let totalSkipped = 0;
  let totalSearches = 0;

  for (const region of QUERIES) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`REGION: ${region.country} (${region.queries.length} queries)`);
    console.log("=".repeat(50));

    for (const query of region.queries) {
      console.log(`\n  Q: "${query}"`);

      await sleep(3000); // Rate limit protection
      const results = await googleSearch(query, region.country);
      totalSearches++;

      console.log(`  Found ${results.length} results`);

      for (const result of results) {
        if (!result.domain || !isCompanyWebsite(result.url)) continue;
        if (existingDomains.has(result.domain)) continue;

        const name = cleanCompanyName(result.title);
        if (!name || name.length < 3) continue;
        if (existingNames.has(name.toLowerCase().trim())) continue;

        try {
          await prisma.company.create({
            data: {
              tenantId: tenant.id,
              name,
              country: region.country,
              website: result.url,
              description: result.snippet,
              source: "GOOGLE",
              sourceUrl: result.url,
              status: "RAW",
              stage: "NEW",
            },
          });

          existingDomains.add(result.domain);
          existingNames.add(name.toLowerCase().trim());
          totalNew++;
          console.log(`    + ${name} (${result.domain})`);
        } catch (e) {
          // Unique constraint violation — skip
          if (e.code === "P2002") {
            totalSkipped++;
          } else {
            console.error(`    Error saving ${name}:`, e.message);
          }
        }
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("SCRAPING COMPLETE");
  console.log(`Searches performed: ${totalSearches}`);
  console.log(`New companies added: ${totalNew}`);
  console.log(`Duplicates skipped: ${totalSkipped}`);
  console.log(`Total in DB: ${existing.length + totalNew}`);
  console.log("=".repeat(50));

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
