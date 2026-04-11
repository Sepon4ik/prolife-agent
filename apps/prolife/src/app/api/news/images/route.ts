import { NextResponse } from "next/server";
import { prisma } from "@agency/db";
import { extractImageOnly, findStockImage } from "@agency/intel";

/**
 * POST /api/news/images?limit=N&mode=extract|stock
 *
 * Backfill images for articles missing them.
 * mode=extract (default): re-scrape URLs with metascraper (JSON-LD, Twitter Cards, etc.)
 * mode=stock: search Pexels for stock photos based on article keywords
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30"), 100);
  const mode = searchParams.get("mode") ?? "extract";

  // Find articles without images
  const items = await prisma.newsItem.findMany({
    where: { imageUrl: null },
    select: {
      id: true,
      url: true,
      title: true,
      category: true,
    },
    orderBy: { relevanceScore: "desc" },
    take: limit,
  });

  if (items.length === 0) {
    return NextResponse.json({ success: true, total: 0, updated: 0, message: "All articles have images" });
  }

  let updated = 0;
  const errors: string[] = [];

  for (const item of items) {
    let imageUrl: string | null = null;

    if (mode === "extract") {
      // Try metascraper extraction (OG + Twitter + JSON-LD + logo + favicon)
      imageUrl = await extractImageOnly(item.url);
    } else if (mode === "stock") {
      // Search Pexels for stock photo
      imageUrl = await findStockImage(item.title, item.category);
    }

    if (imageUrl) {
      try {
        await prisma.newsItem.update({
          where: { id: item.id },
          data: { imageUrl },
        });
        updated++;
      } catch (e) {
        errors.push(`${item.id}: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    mode,
    total: items.length,
    updated,
    remaining: items.length - updated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
