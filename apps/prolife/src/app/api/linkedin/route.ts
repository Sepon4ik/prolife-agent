import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@agency/db";
import { getLinkedInUsageStats, LINKEDIN_DAILY_LIMITS } from "@agency/linkedin";

/**
 * GET /api/linkedin
 * Returns LinkedIn accounts and their usage stats.
 * Shows remaining daily capacity for each action type.
 */
export async function GET() {
  try {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      return NextResponse.json({ accounts: [], limits: LINKEDIN_DAILY_LIMITS });
    }

    const accounts = await prisma.linkedInAccount.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        email: true,
        name: true,
        profileUrl: true,
        isActive: true,
        isWarmedUp: true,
        createdAt: true,
      },
    });

    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        const stats = await getLinkedInUsageStats(account.id);
        return { ...account, usage: stats };
      })
    );

    return NextResponse.json({
      accounts: accountsWithStats,
      limits: LINKEDIN_DAILY_LIMITS,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/linkedin
 * Add a LinkedIn account for outreach.
 * Body: { email, name, profileUrl?, isWarmedUp? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, profileUrl, isWarmedUp } = body;

    if (!email || !name) {
      return NextResponse.json(
        { error: "email and name are required" },
        { status: 400 }
      );
    }

    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: { name: "ProLife", slug: "prolife" },
      });
    }

    const account = await prisma.linkedInAccount.create({
      data: {
        tenantId: tenant.id,
        email,
        name,
        profileUrl: profileUrl ?? null,
        isWarmedUp: isWarmedUp ?? false,
      },
    });

    return NextResponse.json({ success: true, account });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
