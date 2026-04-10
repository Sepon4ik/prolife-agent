import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@agency/db";
import { z } from "zod";

const MailboxInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  domain: z.string().min(3).max(255),
  provider: z.enum(["resend", "ses"]).default("resend"),
  apiKey: z.string().optional(),
  dailyLimit: z.number().int().min(1).max(100).default(40),
  isWarmedUp: z.boolean().default(false),
});

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
    const raw = await req.json();
    const parsed = MailboxInputSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { email, name, domain, provider, apiKey, dailyLimit, isWarmedUp } = parsed.data;

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
