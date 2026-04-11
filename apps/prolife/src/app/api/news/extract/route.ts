import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@agency/db";
import { extractArticleContent, translateToRussian } from "@agency/intel";

/**
 * POST /api/news/extract
 * Extract full content + translate for news items that don't have content yet.
 * Query params:
 *   limit=N — how many items to process (default 10)
 *   id=X — process a specific item
 */
export async function POST(req: NextRequest) {
  try {
    const specificId = req.nextUrl.searchParams.get("id");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10);

    const retranslate = req.nextUrl.searchParams.get("retranslate") === "1";

    // Find items to process
    const items = specificId
      ? await prisma.newsItem.findMany({
          where: { id: specificId },
          select: { id: true, url: true, title: true, summary: true, fullContent: true },
        })
      : retranslate
        ? await prisma.newsItem.findMany({
            where: {
              translatedTitle: null,
              fullContent: { not: null },
            },
            orderBy: { relevanceScore: "desc" },
            take: limit,
            select: { id: true, url: true, title: true, summary: true, fullContent: true },
          })
        : await prisma.newsItem.findMany({
            where: {
              fullContent: null,
              url: { not: { contains: "news.google.com" } },
            },
            orderBy: { relevanceScore: "desc" },
            take: limit,
            select: { id: true, url: true, title: true, summary: true, fullContent: true },
          });

    if (items.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No items to process",
        processed: 0,
      });
    }

    let extracted = 0;
    let translated = 0;
    let failed = 0;

    for (const item of items) {
      console.log(`[extract] Processing: ${item.url}`);

      const updateData: Record<string, unknown> = {};

      // Extract content if not already present
      if (!item.fullContent) {
        const content = await extractArticleContent(item.url);
        if (!content) {
          console.log(`[extract] FAILED: ${item.url}`);
          failed++;
          continue;
        }
        updateData.fullContent = content.text;
        updateData.imageUrl = content.imageUrl;
        item.fullContent = content.text;
      }

      // Translate title, summary and content to Russian
      const translation = await translateToRussian(
        item.fullContent,
        item.title,
        item.summary
      );
      if (translation) {
        updateData.translatedTitle = translation.title;
        updateData.translatedSummary = translation.summary;
        updateData.translatedContent = translation.content;
        translated++;
      }

      await prisma.newsItem.update({
        where: { id: item.id },
        data: updateData,
      });

      extracted++;
    }

    return NextResponse.json({
      success: true,
      total: items.length,
      extracted,
      translated,
      failed,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Extract error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
