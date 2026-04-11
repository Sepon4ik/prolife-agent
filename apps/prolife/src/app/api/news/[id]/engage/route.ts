import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@agency/db";
import { z } from "zod";

const EngageSchema = z.object({
  action: z.enum(["like", "bookmark", "dismiss", "click", "unbookmark"]),
});

/**
 * POST /api/news/[id]/engage
 * Track user engagement with a news item.
 * Used by the self-learning system to improve future relevance scoring.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = EngageSchema.parse(await req.json());

    const scoreDeltas: Record<string, number> = {
      like: 10,
      bookmark: 5,
      click: 1,
      dismiss: -5,
      unbookmark: -5,
    };

    const delta = scoreDeltas[body.action] ?? 0;

    const updates: Record<string, unknown> = {
      engagementScore: { increment: delta },
    };

    if (body.action === "bookmark") updates.isBookmarked = true;
    if (body.action === "unbookmark") updates.isBookmarked = false;
    if (body.action === "dismiss") updates.isDismissed = true;
    if (body.action === "click") updates.clickCount = { increment: 1 };

    const updated = await prisma.newsItem.update({
      where: { id: params.id },
      data: updates as never,
      select: { id: true, engagementScore: true, isBookmarked: true, isDismissed: true },
    });

    return NextResponse.json({ success: true, item: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
