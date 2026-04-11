/**
 * Seed default topics for ProLife Intel.
 * Run via API route or directly.
 */

import { prisma } from "@agency/db";

const DEFAULT_TOPICS = [
  {
    name: "Pharma Distribution APAC",
    keywords: [
      "pharmaceutical distribution Asia",
      "pharma distributor Indonesia",
      "drug distribution Vietnam",
      "pharmaceutical supply chain APAC",
      "pharmacy wholesale Asia Pacific",
    ],
    countries: ["Indonesia", "Vietnam", "Philippines", "Thailand", "Malaysia"],
  },
  {
    name: "Pharma Distribution MENA",
    keywords: [
      "pharmaceutical distribution Middle East",
      "pharma distributor UAE",
      "drug distribution Turkey",
      "pharmaceutical market Pakistan",
      "pharmacy wholesale Middle East",
    ],
    countries: ["UAE", "Turkey", "Pakistan", "Bangladesh"],
  },
  {
    name: "Pharma Distribution Europe",
    keywords: [
      "pharmaceutical distribution Europe",
      "pharma distributor Eastern Europe",
      "drug distribution Romania",
      "pharmacy wholesale Czech Republic",
    ],
    countries: ["Romania", "Czech Republic", "Hungary", "Austria", "Netherlands"],
  },
  {
    name: "Pharma Distribution Africa",
    keywords: [
      "pharmaceutical distribution Africa",
      "pharma distributor Nigeria",
      "drug distribution Kenya",
      "pharmacy wholesale South Africa",
    ],
    countries: ["Nigeria", "Kenya", "South Africa"],
  },
  {
    name: "FDA & Regulatory",
    keywords: [
      "FDA drug approval",
      "FDA recall pharmaceutical",
      "drug shortage FDA",
      "new drug approval NDA",
      "EMA marketing authorization",
    ],
    countries: [],
  },
  {
    name: "Vitamins & Supplements",
    keywords: [
      "vitamin supplement market",
      "dietary supplement regulation",
      "nutraceutical distribution",
      "vitamin brand launch",
      "supplement industry trends",
    ],
    countries: [],
  },
  {
    name: "Medical Devices & Home Health",
    keywords: [
      "medical device distribution",
      "home medical equipment market",
      "blood pressure monitor market",
      "glucose meter distributor",
      "home diagnostics market",
      "OMRON healthcare",
      "tonometer market",
      "nebulizer distributor",
      "thermometer medical device",
      "pulse oximeter market",
    ],
    countries: [],
  },
  {
    name: "MedTech Industry",
    keywords: [
      "medtech innovation",
      "medical device regulation",
      "510k clearance",
      "CE marking medical device",
      "point of care diagnostics",
      "wearable health device",
      "remote patient monitoring",
      "medical device startup",
    ],
    countries: [],
  },
  {
    name: "Dermo-Cosmetics & Baby Care",
    keywords: [
      "dermo-cosmetics market",
      "baby care pharmaceutical",
      "pediatric skincare brand",
      "children health products",
      "baby nutrition distribution",
    ],
    countries: [],
  },
  {
    name: "M&A & Funding",
    keywords: [
      "pharmaceutical acquisition",
      "pharma distributor merger",
      "drug company funding round",
      "pharma startup investment",
      "healthcare distribution consolidation",
    ],
    countries: [],
  },
  {
    name: "Pharma Exhibitions & Events",
    keywords: [
      "CPhI exhibition",
      "Arab Health conference",
      "AIME exhibition",
      "Medica trade show",
      "pharmaceutical conference 2026",
    ],
    countries: [],
  },
];

export async function seedDefaultTopics(tenantId: string): Promise<number> {
  let created = 0;

  for (const topic of DEFAULT_TOPICS) {
    const existing = await prisma.topic.findFirst({
      where: { tenantId, name: topic.name },
    });

    if (!existing) {
      await prisma.topic.create({
        data: {
          tenantId,
          name: topic.name,
          keywords: topic.keywords,
          countries: topic.countries,
          isActive: true,
        },
      });
      created++;
    }
  }

  return created;
}

export { DEFAULT_TOPICS };
