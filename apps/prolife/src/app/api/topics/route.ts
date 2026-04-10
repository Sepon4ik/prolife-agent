import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@agency/db";
import { inngest } from "@agency/queue";
import { z } from "zod";

const TopicInputSchema = z.object({
  name: z.string().min(1).max(100),
  keywords: z.array(z.string().min(1)).min(1).max(20),
  countries: z.array(z.string()).default([]),
});

/**
 * GET /api/topics
 * List all topics for the tenant, with news count per topic.
 */
export async function GET() {
  try {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      return NextResponse.json({ topics: [] });
    }

    const topics = await prisma.topic.findMany({
      where: { tenantId: tenant.id },
      include: {
        _count: { select: { newsItems: true, alerts: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ topics });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/topics
 * Create a new topic and optionally trigger immediate news fetch.
 * Body: { name, keywords, countries?, runNow? }
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = TopicInputSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: { name: "ProLife", slug: "prolife" },
      });
    }

    const topic = await prisma.topic.create({
      data: {
        tenantId: tenant.id,
        name: parsed.data.name,
        keywords: parsed.data.keywords,
        countries: parsed.data.countries,
      },
    });

    // Trigger immediate news fetch if requested
    if (raw.runNow) {
      await inngest.send({
        name: "prolife/intel.run",
        data: { tenantId: tenant.id, topicId: topic.id },
      });
    }

    return NextResponse.json({ success: true, topic });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
