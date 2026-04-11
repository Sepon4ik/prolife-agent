/**
 * Mass AI enrichment — classify RAW companies with Claude Haiku.
 * Run: ANTHROPIC_API_KEY=sk-ant-... node scripts/mass-enrich-ai.mjs
 *
 * For each RAW company with a website:
 * 1. Fetch homepage text (simple fetch + cheerio)
 * 2. Classify with Claude Haiku (type, categories, brands, revenue, etc.)
 * 3. Hunter domain search for contacts
 * 4. Score company (11 factors)
 * 5. Update DB
 *
 * Cost: ~$0.01-0.03 per company (Haiku) = ~$5-10 for 358 companies
 */

import { createRequire } from "module";
import { createHash } from "crypto";

const require = createRequire(import.meta.url);
const prismaPath = require.resolve("@prisma/client", {
  paths: [new URL("../packages/db", import.meta.url).pathname],
});
const { PrismaClient } = await import(prismaPath);
const prisma = new PrismaClient();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const HUNTER_API_KEY = process.env.HUNTER_API_KEY;

if (!ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY not set"); process.exit(1); }

// ── Website Fetcher (simple, no puppeteer) ──
async function fetchWebsiteText(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ProLifeBot/1.0)" },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return "";
    const html = await res.text();
    // Simple HTML to text: strip tags, decode entities, collapse whitespace
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#?\w+;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 8000);
  } catch {
    return "";
  }
}

// ── Claude Haiku Classification ──
async function classifyWithAI(websiteText, companyName, country) {
  const systemPrompt = `You are an expert at analyzing pharmaceutical and healthcare distribution companies.
ProLife is a Swiss company producing vitamins, supplements, dermo-cosmetics, children's products, and home medical devices.
Evaluate if a company would be a good distribution partner. Be precise and conservative.`;

  const userPrompt = `Classify this company based on their website content:

Company: ${companyName}
Country: ${country}
Website content: ${websiteText.substring(0, 6000)}

Return a JSON tool call with your classification.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      tools: [{
        name: "classify_company",
        description: "Classify a pharma/healthcare company",
        input_schema: {
          type: "object",
          properties: {
            companyName: { type: "string", description: "Clean company name" },
            country: { type: "string" },
            city: { type: ["string", "null"] },
            type: { type: "string", enum: ["distributor", "pharmacy_chain", "retail", "hybrid", "unknown"] },
            categories: { type: "array", items: { type: "string" } },
            estimatedRevenue: { type: "string", enum: ["under_2m", "2m_10m", "10m_plus", "unknown"] },
            hasEcommerce: { type: "boolean" },
            hasSalesTeam: { type: "boolean" },
            hasMarketingTeam: { type: "boolean" },
            hasMedReps: { type: "boolean" },
            pharmacyCount: { type: ["number", "null"] },
            portfolioBrands: { type: "array", items: { type: "string" } },
            portfolioBrandInfo: { type: "object", additionalProperties: { type: "string" } },
            activelySeekingBrands: { type: "boolean" },
            relevanceScore: { type: "number", minimum: 0, maximum: 100 },
          },
          required: ["companyName", "type", "categories", "estimatedRevenue", "hasEcommerce", "hasSalesTeam", "hasMedReps", "portfolioBrands", "relevanceScore"],
        },
      }],
      tool_choice: { type: "tool", name: "classify_company" },
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const toolBlock = data.content?.find(b => b.type === "tool_use");
  if (!toolBlock) throw new Error("No tool_use in response");
  return toolBlock.input;
}

// ── Scoring (simplified 11-factor) ──
function scoreCompany(c) {
  const GEO_PRIORITY = {
    "Indonesia": 20, "Pakistan": 20, "Bangladesh": 20, "Philippines": 20,
    "Vietnam": 20, "United Arab Emirates": 20, "UAE": 20,
    "Thailand": 15, "Turkey": 15, "South Korea": 15, "Malaysia": 15,
    "Singapore": 10, "India": 10, "Saudi Arabia": 10, "Egypt": 10,
    "Nigeria": 10, "Kenya": 10, "South Africa": 10,
    "Uzbekistan": 10, "Kazakhstan": 10, "Georgia": 8, "Azerbaijan": 8,
  };

  let score = 0;
  score += GEO_PRIORITY[c.country] ?? 5;  // geo: 0-20
  score += c.type === "distributor" ? 15 : c.type === "hybrid" ? 12 : c.type === "pharmacy_chain" ? 10 : c.type === "retail" ? 5 : 0; // type: 0-15
  score += c.estimatedRevenue === "10m_plus" ? 15 : c.estimatedRevenue === "2m_10m" ? 10 : c.estimatedRevenue === "under_2m" ? 3 : 0; // revenue: 0-15
  score += c.hasEcommerce ? 5 : 0;
  score += c.hasSalesTeam ? 10 : 0;
  score += c.hasMedReps ? 10 : 0;
  score += c.hasMarketingTeam ? 5 : 0;
  score += (c.pharmacyCount ?? 0) >= 300 ? 10 : (c.pharmacyCount ?? 0) >= 100 ? 5 : 0;
  score += c.activelySeekingBrands ? 5 : 0;
  score += (c.portfolioBrands?.length ?? 0) >= 10 ? 5 : (c.portfolioBrands?.length ?? 0) >= 5 ? 3 : 0;

  return Math.min(score, 100);
}

function getPriority(score) {
  if (score >= 70) return "A";
  if (score >= 40) return "B";
  return "C";
}

// ── Hunter (with rate limit protection) ──
let hunterLastCall = 0;
async function hunterDomainSearch(domain) {
  if (!HUNTER_API_KEY) return null;

  // Enforce 10s between calls
  const now = Date.now();
  const wait = Math.max(0, 10000 - (now - hunterLastCall));
  if (wait > 0) await sleep(wait);
  hunterLastCall = Date.now();

  try {
    const params = new URLSearchParams({ domain, api_key: HUNTER_API_KEY, limit: "5" });
    const res = await fetch(`https://api.hunter.io/v2/domain-search?${params}`);
    if (res.status === 429) return null; // skip, don't retry
    if (!res.ok) return null;
    return (await res.json()).data;
  } catch { return null; }
}

// ── Gravatar ──
async function getGravatarUrl(email) {
  const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  try {
    const res = await fetch(`https://gravatar.com/avatar/${hash}?d=404&s=200`, {
      method: "HEAD", signal: AbortSignal.timeout(3000),
    });
    return res.ok ? `https://gravatar.com/avatar/${hash}?s=200` : null;
  } catch { return null; }
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──
async function main() {
  const companies = await prisma.company.findMany({
    where: { status: "RAW", deletedAt: null, website: { not: null } },
    select: { id: true, name: true, website: true, country: true },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Found ${companies.length} RAW companies to enrich`);
  if (companies.length === 0) { await prisma.$disconnect(); return; }

  let enriched = 0, failed = 0, contactsAdded = 0;

  for (const company of companies) {
    const num = enriched + failed + 1;
    process.stdout.write(`[${num}/${companies.length}] ${company.name.substring(0, 40).padEnd(40)} `);

    try {
      // 1. Fetch website
      const text = await fetchWebsiteText(company.website);
      if (!text || text.length < 50) {
        console.log("⚠ no content");
        failed++;
        continue;
      }

      // 2. AI classification
      const classification = await classifyWithAI(text, company.name, company.country);
      const score = scoreCompany({ ...classification, country: company.country });
      const priority = getPriority(score);

      // 3. Update company
      const typeMap = { distributor: "DISTRIBUTOR", pharmacy_chain: "PHARMACY_CHAIN", retail: "RETAIL", hybrid: "HYBRID", unknown: "UNKNOWN" };

      await prisma.company.update({
        where: { id: company.id },
        data: {
          ...(classification.companyName && classification.companyName.length > 2 && { name: classification.companyName }),
          ...(classification.country && classification.country !== "Unknown" && { country: classification.country }),
          ...(classification.city && { city: classification.city }),
          type: typeMap[classification.type] ?? "UNKNOWN",
          categories: classification.categories ?? [],
          estimatedRevenue: classification.estimatedRevenue,
          hasEcommerce: classification.hasEcommerce ?? false,
          hasSalesTeam: classification.hasSalesTeam ?? false,
          hasMarketingTeam: classification.hasMarketingTeam ?? false,
          hasMedReps: classification.hasMedReps ?? false,
          pharmacyCount: classification.pharmacyCount ?? null,
          portfolioBrands: classification.portfolioBrands ?? [],
          portfolioBrandInfo: classification.portfolioBrandInfo ?? {},
          activelySeekingBrands: classification.activelySeekingBrands ?? false,
          score,
          priority,
          status: "ENRICHED",
        },
      });

      // 4. Hunter contacts (if we have budget)
      const domain = extractDomain(company.website);
      if (domain && HUNTER_API_KEY) {
        const hunterData = await hunterDomainSearch(domain);
        if (hunterData?.emails?.length) {
          for (const he of hunterData.emails.slice(0, 3)) {
            const name = [he.first_name, he.last_name].filter(Boolean).join(" ");
            if (!name && he.type === "generic") continue;
            try {
              await prisma.contact.create({
                data: {
                  companyId: company.id,
                  name: name || "Unknown",
                  email: he.value,
                  title: he.position || null,
                  isPrimary: contactsAdded === 0,
                },
              });
              contactsAdded++;
            } catch { /* duplicate */ }
          }
        }
      }

      console.log(`✓ ${classification.type} | score ${score} (${priority}) | ${(classification.portfolioBrands?.length ?? 0)} brands`);
      enriched++;

      // Rate limit: ~1 req/sec for Anthropic
      await sleep(1500);
    } catch (e) {
      console.log(`✗ ${e.message?.substring(0, 60)}`);
      failed++;
      await sleep(2000);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("AI ENRICHMENT COMPLETE");
  console.log(`Enriched: ${enriched}`);
  console.log(`Failed: ${failed}`);
  console.log(`Contacts added: ${contactsAdded}`);
  console.log("=".repeat(60));

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
