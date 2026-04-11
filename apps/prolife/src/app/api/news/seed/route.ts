import { NextResponse } from "next/server";
import { prisma } from "@agency/db";
import { seedDefaultTopics } from "@agency/intel/src/seed-topics";

/**
 * POST /api/news/seed
 * Creates default topics and triggers initial news aggregation.
 */
export async function POST() {
  try {
    // Ensure tenant exists
    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: { name: "ProLife AG", slug: "prolife" },
      });
    }

    // Seed topics
    const created = await seedDefaultTopics(tenant.id);

    // Get all active topics
    const topics = await prisma.topic.findMany({
      where: { tenantId: tenant.id, isActive: true },
    });

    return NextResponse.json({
      success: true,
      topicsCreated: created,
      totalTopics: topics.length,
      topics: topics.map((t) => ({ name: t.name, keywords: t.keywords.length })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Seed error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
