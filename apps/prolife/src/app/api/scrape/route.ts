import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@agency/db";
import { inngest } from "@agency/queue";

/**
 * POST /api/scrape
 * Start a new scraping job.
 * Body: { sourceType, sourceUrl, sourceName?, tenantId? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sourceType, sourceUrl, sourceName } = body;

    if (!sourceType || !sourceUrl) {
      return NextResponse.json(
        { error: "sourceType and sourceUrl are required" },
        { status: 400 }
      );
    }

    // For now, use a default tenant. Later: get from auth session.
    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: "ProLife",
          slug: "prolife",
        },
      });
    }

    // Map source type to Prisma enum
    const sourceTypeMap: Record<string, string> = {
      google_search: "GOOGLE",
      google_maps: "GOOGLE_MAPS",
      directory: "DIRECTORY",
      trade_registry: "TRADE_REGISTRY",
      regulatory: "REGULATORY",
      news_intent: "NEWS_INTENT",
      apollo: "APOLLO",
      exhibition: "EXHIBITION",
      linkedin: "LINKEDIN",
      website: "WEBSITE",
      manual: "MANUAL",
    };
    const dbSourceType = sourceTypeMap[sourceType.toLowerCase()] ?? sourceType.toUpperCase();

    // Create scraping job record
    const job = await prisma.scrapingJob.create({
      data: {
        tenantId: tenant.id,
        sourceType: dbSourceType as any,
        sourceUrl,
        sourceName: sourceName || null,
        status: "pending",
      },
    });

    // Trigger Inngest event
    await inngest.send({
      name: "prolife/scrape.started",
      data: {
        tenantId: tenant.id,
        jobId: job.id,
        sourceType: sourceType.toLowerCase(),
        sourceUrl,
        sourceName,
      },
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: "Scraping job started",
    });
  } catch (error: any) {
    console.error("Scrape API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/scrape
 * List recent scraping jobs.
 */
export async function GET() {
  try {
    const jobs = await prisma.scrapingJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ jobs });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
