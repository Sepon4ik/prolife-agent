/**
 * ProLife seed script — creates demo data for local development.
 *
 * Usage:
 *   npx tsx prisma/seed.ts
 *   pnpm --filter @agency/db seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding ProLife database...");

  // ── Tenant ──
  const tenant = await prisma.tenant.upsert({
    where: { slug: "prolife" },
    update: {},
    create: {
      name: "ProLife AG",
      slug: "prolife",
      outreachEnabled: false,
      dailyRevealLimit: 30,
    },
  });
  console.log(`  Tenant: ${tenant.name} (${tenant.id})`);

  // ── User ──
  const user = await prisma.prolifeUser.upsert({
    where: { email: "pavel@prolife-global.net" },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "pavel@prolife-global.net",
      name: "Pavel Dranchuk",
      role: "admin",
    },
  });
  console.log(`  User: ${user.email}`);

  // ── Topics ──
  const topics = [
    {
      name: "Pharma Distribution",
      keywords: ["pharma distributor", "drug distribution", "pharmaceutical supply chain"],
      countries: ["DE", "PL", "CZ", "AT"],
    },
    {
      name: "Medtech Expansion",
      keywords: ["medical device expansion", "medtech market entry", "health technology"],
      countries: [],
    },
    {
      name: "Supplement Trends",
      keywords: ["dietary supplement", "nutraceutical", "vitamin market"],
      countries: [],
    },
  ];

  for (const t of topics) {
    await prisma.topic.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: t.name } },
      update: {},
      create: { tenantId: tenant.id, ...t },
    });
  }
  console.log(`  Topics: ${topics.length}`);

  // ── Companies (12 demo) ──
  const companies = [
    { name: "PharmaPoint GmbH", country: "DE", city: "Berlin", type: "DISTRIBUTOR" as const, status: "SCORED" as const, score: 82, priority: "A" as const, website: "https://pharmapoint.de", geoPriority: "P1" as const },
    { name: "MedSupply Polska", country: "PL", city: "Warsaw", type: "DISTRIBUTOR" as const, status: "SCORED" as const, score: 75, priority: "A" as const, website: "https://medsupply.pl", geoPriority: "P1" as const },
    { name: "HealthNet CZ", country: "CZ", city: "Prague", type: "PHARMACY_CHAIN" as const, status: "ENRICHED" as const, score: 65, priority: "B" as const, website: "https://healthnet.cz", geoPriority: "P1" as const },
    { name: "Alpine Pharma AG", country: "AT", city: "Vienna", type: "DISTRIBUTOR" as const, status: "OUTREACH_SENT" as const, score: 70, priority: "B" as const, website: "https://alpine-pharma.at", geoPriority: "P2" as const },
    { name: "NovaMed Distribution", country: "DE", city: "Munich", type: "DISTRIBUTOR" as const, status: "REPLIED" as const, score: 88, priority: "A" as const, website: "https://novamed.de", geoPriority: "P1" as const },
    { name: "Zdrowie24", country: "PL", city: "Krakow", type: "RETAIL" as const, status: "RAW" as const, score: 30, priority: "C" as const, website: "https://zdrowie24.pl", geoPriority: "P2" as const },
    { name: "BioVita Kft", country: "HU", city: "Budapest", type: "DISTRIBUTOR" as const, status: "INTERESTED" as const, score: 91, priority: "A" as const, website: "https://biovita.hu", geoPriority: "P2" as const },
    { name: "EuroMedics SRL", country: "RO", city: "Bucharest", type: "HYBRID" as const, status: "SCORED" as const, score: 55, priority: "B" as const, website: "https://euromedics.ro", geoPriority: "P3" as const },
    { name: "BalticMed OÜ", country: "EE", city: "Tallinn", type: "DISTRIBUTOR" as const, status: "RAW" as const, score: 20, priority: "C" as const, website: "https://balticmed.ee", geoPriority: "P3" as const },
    { name: "Pharma Adriatic", country: "HR", city: "Zagreb", type: "DISTRIBUTOR" as const, status: "ENRICHED" as const, score: 60, priority: "B" as const, website: null, geoPriority: "P2" as const },
    { name: "MedDist SK", country: "SK", city: "Bratislava", type: "DISTRIBUTOR" as const, status: "HANDED_OFF" as const, score: 78, priority: "A" as const, website: "https://meddist.sk", geoPriority: "P1" as const },
    { name: "SanaPharm BG", country: "BG", city: "Sofia", type: "PHARMACY_CHAIN" as const, status: "NOT_INTERESTED" as const, score: 45, priority: "C" as const, website: "https://sanapharm.bg", geoPriority: "P3" as const },
  ];

  for (const c of companies) {
    await prisma.company.upsert({
      where: {
        tenantId_name_country: { tenantId: tenant.id, name: c.name, country: c.country },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        ...c,
        source: "MANUAL",
        categories: ["pharma", "distribution"],
      },
    });
  }
  console.log(`  Companies: ${companies.length}`);

  // ── Contacts (2 per top company) ──
  const topCompanies = await prisma.company.findMany({
    where: { tenantId: tenant.id, priority: "A" },
    take: 4,
  });

  let contactCount = 0;
  for (const company of topCompanies) {
    const contacts = [
      { name: `CEO at ${company.name}`, title: "CEO", email: `ceo@${company.name.toLowerCase().replace(/\s+/g, "")}.com`, isPrimary: true },
      { name: `Sales Dir at ${company.name}`, title: "Sales Director", email: `sales@${company.name.toLowerCase().replace(/\s+/g, "")}.com`, isPrimary: false },
    ];
    for (const contact of contacts) {
      await prisma.contact.upsert({
        where: { email: contact.email },
        update: {},
        create: { companyId: company.id, ...contact },
      });
      contactCount++;
    }
  }
  console.log(`  Contacts: ${contactCount}`);

  // ── News items (5 demo) ──
  const pharmaDistTopic = await prisma.topic.findFirst({
    where: { tenantId: tenant.id, name: "Pharma Distribution" },
  });

  const newsItems = [
    { title: "PharmaPoint expands to 3 new German states", source: "PharmaBoard", category: "EXPANSION" as const, relevanceScore: 85, summary: "PharmaPoint GmbH announced expansion into Bavaria, Saxony, and Brandenburg." },
    { title: "New EU MDR regulations impact distributor margins", source: "MedTech Europe", category: "REGULATORY" as const, relevanceScore: 70, summary: "Updated MDR compliance requirements add 5-8% cost overhead for distributors." },
    { title: "NovaMed raises EUR 12M Series B", source: "TechCrunch", category: "MA_FUNDING" as const, relevanceScore: 90, summary: "Munich-based NovaMed closes Series B to expand pharmaceutical distribution network." },
    { title: "Poland pharma market grows 15% YoY", source: "Google News", category: "GENERAL" as const, relevanceScore: 60, summary: "Polish pharmaceutical market continues strong growth driven by OTC and supplements." },
    { title: "BioVita appointed exclusive Prolife distributor in Hungary", source: "Company Website", category: "CONTRACT" as const, relevanceScore: 95, summary: "BioVita Kft signs exclusive agreement with ProLife AG for Hungarian market." },
  ];

  for (const n of newsItems) {
    const url = `https://demo.prolife.local/news/${n.title.toLowerCase().replace(/\s+/g, "-").slice(0, 60)}`;
    await prisma.newsItem.upsert({
      where: { url },
      update: {},
      create: {
        tenantId: tenant.id,
        topicId: pharmaDistTopic?.id,
        url,
        ...n,
        publishedAt: new Date(Date.now() - Math.random() * 7 * 86400000),
      },
    });
  }
  console.log(`  News items: ${newsItems.length}`);

  // ── Mailbox (demo, not active) ──
  await prisma.mailbox.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "partnerships@prolife-global.net" } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "partnerships@prolife-global.net",
      name: "ProLife Partnerships",
      domain: "prolife-global.net",
      provider: "resend",
      isActive: false,
      isWarmedUp: false,
      dailyLimit: 40,
      hasSPF: true,
      hasDKIM: true,
      hasDMARC: true,
    },
  });
  console.log("  Mailbox: partnerships@prolife-global.net (inactive)");

  console.log("\nSeed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
