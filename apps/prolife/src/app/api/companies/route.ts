import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@agency/db";
import { inngest } from "@agency/queue";

/**
 * GET /api/companies
 * List companies with optional filters.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const country = searchParams.get("country");
    const limit = parseInt(searchParams.get("limit") || "50");

    const where: any = { deletedAt: null };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (country) where.country = country;

    const companies = await prisma.company.findMany({
      where,
      include: {
        contacts: { where: { isPrimary: true }, take: 1 },
        _count: { select: { emails: true } },
      },
      orderBy: [{ priority: "asc" }, { score: "desc" }],
      take: limit,
    });

    return NextResponse.json({ companies, count: companies.length });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/companies
 * Add a company manually.
 * Body: { name, country, website?, type?, description? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, country, website, type, description } = body;

    if (!name || !country) {
      return NextResponse.json(
        { error: "name and country are required" },
        { status: 400 }
      );
    }

    // Get or create default tenant
    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: { name: "ProLife", slug: "prolife" },
      });
    }

    const company = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name,
        country,
        website: website || null,
        type: type || "UNKNOWN",
        description: description || null,
        source: "MANUAL",
        status: "RAW",
      },
    });

    // Trigger enrichment
    await inngest.send({
      name: "prolife/enrich.started",
      data: { tenantId: tenant.id, companyId: company.id },
    });

    return NextResponse.json({
      success: true,
      company,
      message: "Company added and enrichment started",
    });
  } catch (error: any) {
    console.error("Companies API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
