import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@agency/db";

/**
 * GET /api/emails?id=xxx — get single email with full body
 * GET /api/emails — list recent emails
 */
export async function GET(req: NextRequest) {
  try {
    const emailId = req.nextUrl.searchParams.get("id");

    if (emailId) {
      const email = await prisma.email.findUniqueOrThrow({
        where: { id: emailId },
        include: {
          company: { select: { name: true, country: true, website: true } },
          contact: { select: { name: true, email: true, title: true } },
        },
      });
      return NextResponse.json({ email });
    }

    const emails = await prisma.email.findMany({
      include: {
        company: { select: { name: true, country: true } },
        contact: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ emails, count: emails.length });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
