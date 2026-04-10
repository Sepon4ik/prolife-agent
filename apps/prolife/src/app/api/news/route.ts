import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@agency/db";

/**
 * GET /api/news
 * Returns news feed with filters.
 * Query params: category, country, companyId, topicId, minRelevance, limit
 */
export async function GET(req: NextRequest) {
  try {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      return NextResponse.json({ news: [] });
    }

    const { searchParams } = req.nextUrl;
    const category = searchParams.get("category");
    const country = searchParams.get("country");
    const companyId = searchParams.get("companyId");
    const topicId = searchParams.get("topicId");
    const minRelevance = Number(searchParams.get("minRelevance") || "0");
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 100);

    const news = await prisma.newsItem.findMany({
      where: {
        tenantId: tenant.id,
        ...(category ? { category: category as any } : {}),
        ...(country ? { countries: { has: country } } : {}),
        ...(companyId ? { companyId } : {}),
        ...(topicId ? { topicId } : {}),
        ...(minRelevance > 0 ? { relevanceScore: { gte: minRelevance } } : {}),
      },
      include: {
        company: { select: { id: true, name: true, country: true } },
        topic: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ news, total: news.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
