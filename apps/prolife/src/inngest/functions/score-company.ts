import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";

// ── Geography priorities ──
const GEO_PRIORITY: Record<string, { priority: string; points: number }> = {
  Indonesia: { priority: "P1", points: 20 },
  Pakistan: { priority: "P1", points: 20 },
  Bangladesh: { priority: "P1", points: 20 },
  Philippines: { priority: "P1", points: 20 },
  Vietnam: { priority: "P1", points: 20 },
  "United Arab Emirates": { priority: "P1", points: 20 },
  UAE: { priority: "P1", points: 20 },
  Thailand: { priority: "P2", points: 15 },
  Turkey: { priority: "P2", points: 15 },
  "South Korea": { priority: "P2", points: 15 },
  Malaysia: { priority: "P2", points: 15 },
  Singapore: { priority: "P3", points: 10 },
  "Sri Lanka": { priority: "P3", points: 10 },
  Nepal: { priority: "P3", points: 10 },
  Romania: { priority: "P3", points: 10 },
  "Czech Republic": { priority: "P3", points: 10 },
  Hungary: { priority: "P3", points: 10 },
  Austria: { priority: "P3", points: 10 },
  Netherlands: { priority: "P3", points: 10 },
  Nigeria: { priority: "P3", points: 10 },
  Kenya: { priority: "P3", points: 10 },
  "South Africa": { priority: "P3", points: 10 },
};

/**
 * Score Company
 * Calculates a priority score based on ProLife's criteria.
 * Score 0-100, mapped to Priority A/B/C.
 */
export const scoreCompany = inngest.createFunction(
  {
    id: "prolife-score-company",
    retries: 2,
  },
  { event: "prolife/score.calculate" },
  async ({ event, step }) => {
    const { tenantId, companyId } = event.data;

    const scored = await step.run("calculate-score", async () => {
      const company = await prisma.company.findUniqueOrThrow({
        where: { id: companyId },
      });

      let score = 0;

      // 1. Geography (0-20 points)
      const geo = GEO_PRIORITY[company.country];
      if (geo) score += geo.points;

      // 2. Company type (0-15 points)
      if (company.type === "DISTRIBUTOR") score += 15;
      else if (company.type === "HYBRID") score += 12;
      else if (company.type === "PHARMACY_CHAIN") score += 10;
      else if (company.type === "RETAIL") score += 5;

      // 3. Revenue (0-15 points)
      if (company.estimatedRevenue === "10m_plus") score += 15;
      else if (company.estimatedRevenue === "2m_10m") score += 10;
      else if (company.estimatedRevenue === "under_2m") score += 3;

      // 4. E-commerce (0-5 points)
      if (company.hasEcommerce) score += 5;

      // 5. Sales team (0-10 points)
      if (company.hasSalesTeam) score += 10;

      // 6. Med reps (0-10 points)
      if (company.hasMedReps) score += 10;

      // 7. Marketing function (0-5 points)
      if (company.hasMarketingTeam) score += 5;

      // 8. Pharmacy network size (0-10 points)
      if (company.pharmacyCount && company.pharmacyCount >= 300) score += 10;
      else if (company.pharmacyCount && company.pharmacyCount >= 100) score += 5;

      // 9. Actively seeking brands (0-5 points)
      if (company.activelySeekingBrands) score += 5;

      // 10. Portfolio breadth (0-5 points)
      if (company.portfolioBrands.length >= 10) score += 5;
      else if (company.portfolioBrands.length >= 5) score += 3;

      // Calculate priority
      let priority: "A" | "B" | "C";
      if (score >= 70) priority = "A";
      else if (score >= 40) priority = "B";
      else priority = "C";

      return { score, priority, geoPriority: geo?.priority ?? null };
    });

    // Update company
    await step.run("update-score", async () => {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          score: scored.score,
          priority: scored.priority,
          geoPriority: scored.geoPriority as any,
          status: "SCORED",
        },
      });
    });

    // If priority A or B, trigger outreach prep
    if (scored.priority !== "C") {
      await step.sendEvent("trigger-outreach-prep", {
        name: "prolife/outreach.send",
        data: {
          tenantId,
          companyId,
          contactId: "", // Will be resolved in outreach function
          type: "initial",
        },
      });
    }

    return scored;
  }
);
