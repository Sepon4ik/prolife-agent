import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@agency/db";
import { translateToRussian } from "@agency/intel";

/**
 * POST /api/news/translate
 * Translate title + summary for articles that don't have translatedTitle yet.
 * Works for ALL articles (including Google News ones without fullContent).
 */
export async function POST(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

    const items = await prisma.newsItem.findMany({
      where: { translatedTitle: null },
      orderBy: { relevanceScore: "desc" },
      take: limit,
      select: { id: true, title: true, summary: true, fullContent: true },
    });

    if (items.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All articles already translated",
        processed: 0,
      });
    }

    let translated = 0;

    for (const item of items) {
      const result = await translateToRussian(
        item.fullContent,
        item.title,
        item.summary
      );

      if (result) {
        await prisma.newsItem.update({
          where: { id: item.id },
          data: {
            translatedTitle: result.title,
            translatedSummary: result.summary,
            translatedContent: result.content,
          },
        });
        translated++;
      }
    }

    return NextResponse.json({
      success: true,
      total: items.length,
      translated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Translate error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
