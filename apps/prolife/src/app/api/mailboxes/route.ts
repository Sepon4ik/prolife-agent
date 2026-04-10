import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@agency/db";

/**
 * GET /api/mailboxes
 * List all configured mailboxes for the tenant.
 */
export async function GET() {
  try {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      return NextResponse.json({ mailboxes: [] });
    }

    const mailboxes = await prisma.mailbox.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        email: true,
        name: true,
        domain: true,
        provider: true,
        isActive: true,
        isWarmedUp: true,
        dailyLimit: true,
        sentToday: true,
        totalSent: true,
        totalDelivered: true,
        totalBounced: true,
        totalReplied: true,
        hasSPF: true,
        hasDKIM: true,
        hasDMARC: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ mailboxes });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/mailboxes
 * Add a new mailbox for outreach rotation.
 * Body: { email, name, domain, provider?, apiKey?, dailyLimit?, isWarmedUp? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, domain, provider, apiKey, dailyLimit, isWarmedUp } =
      body;

    if (!email || !name || !domain) {
      return NextResponse.json(
        { error: "email, name, and domain are required" },
        { status: 400 }
      );
    }

    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: { name: "ProLife", slug: "prolife" },
      });
    }

    const mailbox = await prisma.mailbox.create({
      data: {
        tenantId: tenant.id,
        email,
        name,
        domain,
        provider: provider ?? "resend",
        apiKey: apiKey ?? null,
        dailyLimit: dailyLimit ?? 40,
        isWarmedUp: isWarmedUp ?? false,
      },
    });

    return NextResponse.json({ success: true, mailbox });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
