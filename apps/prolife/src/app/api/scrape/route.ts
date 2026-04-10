import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@agency/db";
import { inngest } from "@agency/queue";
import { z } from "zod";

const ScrapeInputSchema = z.object({
  sourceType: z.enum([
    "google_search", "google_maps", "directory", "trade_registry",
    "regulatory", "news_intent", "apollo", "exhibition",
    "linkedin", "website", "manual",
  ]),
  sourceUrl: z.string().min(1),
  sourceName: z.string().optional(),
});

/**
 * POST /api/scrape
 * Start a new scraping job.
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = ScrapeInputSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { sourceType, sourceUrl, sourceName } = parsed.data;

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
        sourceType: dbSourceType as "GOOGLE" | "GOOGLE_MAPS" | "DIRECTORY" | "TRADE_REGISTRY" | "REGULATORY" | "NEWS_INTENT" | "APOLLO" | "EXHIBITION" | "LINKEDIN" | "WEBSITE" | "MANUAL",
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Scrape API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
