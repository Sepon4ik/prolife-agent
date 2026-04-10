import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@agency/db";
import { z } from "zod";

const AlertInputSchema = z.object({
  name: z.string().min(1).max(100),
  topicId: z.string().optional(),
  minRelevance: z.number().int().min(0).max(100).default(70),
  categories: z.array(z.string()).default([]),
  countries: z.array(z.string()).default([]),
  channel: z.enum(["email", "telegram", "slack", "webhook"]),
  target: z.string().min(1), // email, chat ID, URL
});

/**
 * GET /api/alerts
 * List all alerts for the tenant.
 */
export async function GET() {
  try {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      return NextResponse.json({ alerts: [] });
    }

    const alerts = await prisma.alert.findMany({
      where: { tenantId: tenant.id },
      include: {
        topic: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ alerts });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/alerts
 * Create a new alert rule.
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = AlertInputSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: { name: "ProLife", slug: "prolife" },
      });
    }

    const alert = await prisma.alert.create({
      data: {
        tenantId: tenant.id,
        topicId: parsed.data.topicId ?? null,
        name: parsed.data.name,
        minRelevance: parsed.data.minRelevance,
        categories: parsed.data.categories,
        countries: parsed.data.countries,
        channel: parsed.data.channel,
        target: parsed.data.target,
      },
    });

    return NextResponse.json({ success: true, alert });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
