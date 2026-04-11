import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@agency/auth/server";
import { prisma } from "@agency/db";
import {
  getDailyRevealCount,
  getDailyRevealLimit,
  createReveal,
  hasRevealedCompany,
} from "@agency/db/dal/reveals";
import { getCompanyContacts } from "@agency/db/dal/companies";

const RevealSchema = z.object({
  companyId: z.string().min(1),
});

/**
 * POST /api/reveals
 * Reveal contacts for a company. Checks daily limit.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = RevealSchema.parse(await req.json());

    // Look up ProLife User by email to get tenantId
    const user = await prisma.prolifeUser.findUnique({
      where: { email: session.user.email },
      select: { id: true, tenantId: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not linked to tenant" }, { status: 403 });
    }

    const { tenantId } = user;

    // If already revealed, return contacts without spending a reveal
    const alreadyRevealed = await hasRevealedCompany(tenantId, user.id, body.companyId);
    if (alreadyRevealed) {
      const contacts = await getCompanyContacts(tenantId, body.companyId);
      return NextResponse.json({ contacts, alreadyRevealed: true });
    }

    // Check daily limit
    const [usedToday, limit] = await Promise.all([
      getDailyRevealCount(tenantId, user.id),
      getDailyRevealLimit(tenantId),
    ]);

    if (usedToday >= limit) {
      return NextResponse.json(
        {
          error: "Дневной лимит просмотров исчерпан",
          used: usedToday,
          limit,
        },
        { status: 429 }
      );
    }

    // Create reveal log
    await createReveal({
      tenantId,
      userId: user.id,
      companyId: body.companyId,
    });

    // Return contacts
    const contacts = await getCompanyContacts(tenantId, body.companyId);

    return NextResponse.json({
      contacts,
      revealsUsed: usedToday + 1,
      revealsLimit: limit,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
