import { NextResponse } from "next/server";
import { prisma } from "@agency/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, any> = {
    timestamp: new Date().toISOString(),
    env: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    },
  };

  try {
    // Test raw query
    const result = await prisma.$queryRaw`SELECT 1 as ok`;
    checks.database = { connected: true, result };
  } catch (error: any) {
    checks.database = {
      connected: false,
      error: error.message,
      code: error.code,
    };
  }

  try {
    // Test model query
    const companyCount = await prisma.company.count();
    const jobCount = await prisma.scrapingJob.count();
    checks.tables = {
      ok: true,
      companies: companyCount,
      scrapingJobs: jobCount,
    };
  } catch (error: any) {
    checks.tables = {
      ok: false,
      error: error.message,
      code: error.code,
    };
  }

  const allOk = checks.database?.connected && checks.tables?.ok;
  return NextResponse.json(checks, { status: allOk ? 200 : 500 });
}
