import { auth } from "@agency/auth";
import { prisma } from "@agency/db";
import { NextResponse } from "next/server";

/**
 * POST /api/auth/seed
 * Create the first admin user. Dev-only.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not in production" }, { status: 403 });
  }

  try {
    // Create user via better-auth
    const ctx = await auth.api.signUpEmail({
      body: {
        email: "pavel@prolife.ch",
        password: "prolife2024!",
        name: "Pavel",
      },
    });

    // Link to ProLife tenant
    const tenant = await prisma.tenant.findFirst();
    if (tenant) {
      await prisma.prolifeUser.upsert({
        where: { email: "pavel@prolife.ch" },
        create: {
          tenantId: tenant.id,
          email: "pavel@prolife.ch",
          name: "Pavel",
          role: "admin",
        },
        update: {},
      });
    }

    return NextResponse.json({ success: true, userId: ctx.user?.id ?? null });
  } catch (error: unknown) {
    console.error("Auth seed error:", error);
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json({ error: message, stack }, { status: 500 });
  }
}
