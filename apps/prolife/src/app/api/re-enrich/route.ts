import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@agency/db";
import { inngest } from "@agency/queue";

/**
 * POST /api/re-enrich
 * Re-trigger enrichment for companies missing contacts/email.
 * Body: { companyIds?: string[] } — if empty, re-enriches all that need it.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      return NextResponse.json({ error: "No tenant" }, { status: 400 });
    }

    let companyIds: string[] = body.companyIds ?? [];

    if (companyIds.length === 0) {
      // Find all companies that need re-enrichment:
      // scored/enriched but no contacts with email
      const companies = await prisma.company.findMany({
        where: {
          tenantId: tenant.id,
          deletedAt: null,
          status: { in: ["ENRICHED", "SCORED"] },
        },
        include: {
          contacts: { where: { email: { not: null } }, take: 1 },
        },
      });

      companyIds = companies
        .filter((c) => c.contacts.length === 0)
        .map((c) => c.id);
    }

    // Reset status to RAW so enrichment runs again
    await prisma.company.updateMany({
      where: { id: { in: companyIds } },
      data: { status: "RAW" },
    });

    // Trigger enrichment for each
    for (const companyId of companyIds) {
      await inngest.send({
        name: "prolife/enrich.started",
        data: { tenantId: tenant.id, companyId },
      });
    }

    return NextResponse.json({
      success: true,
      count: companyIds.length,
      message: `Re-enrichment triggered for ${companyIds.length} companies`,
    });
  } catch (error: any) {
    console.error("Re-enrich error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
