import { prisma, Prisma, type CompanyStatus, type Priority, type CompanyType } from "@agency/db";
import { Suspense } from "react";
import { AddCompanyForm } from "./add-company-form";
import { PipelineToolbar } from "./pipeline-toolbar";
import { CompaniesTable } from "./companies-table";
import { CompaniesBoard } from "./companies-board";
import {
  KpiCard,
  Card,
  EmptyState,
} from "@agency/ui";
import {
  Building2,
  Sparkles,
  Star,
  ThumbsUp,
  Search,
} from "lucide-react";
import type { PipelineCompany } from "./types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: {
    view?: string;
    status?: string;
    priority?: string;
    type?: string;
    country?: string;
    q?: string;
  };
}

export default async function CompaniesPage({ searchParams }: PageProps) {
  const view = searchParams.view ?? "table";

  // Build Prisma where clause from filters
  const where: Prisma.CompanyWhereInput = { deletedAt: null };

  if (searchParams.status) {
    where.status = searchParams.status as CompanyStatus;
  }
  if (searchParams.priority) {
    where.priority = searchParams.priority as Priority;
  }
  if (searchParams.type) {
    where.type = searchParams.type as CompanyType;
  }
  if (searchParams.country) {
    where.country = { contains: searchParams.country, mode: "insensitive" };
  }
  if (searchParams.q) {
    where.name = { contains: searchParams.q, mode: "insensitive" };
  }

  let companies: PipelineCompany[] = [];
  let dbError: string | null = null;

  try {
    const raw = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        country: true,
        priority: true,
        score: true,
        status: true,
        updatedAt: true,
        _count: { select: { emails: true } },
      },
      where,
      orderBy: [{ priority: "asc" }, { score: "desc" }],
      take: 200,
    });

    companies = raw.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      country: c.country,
      priority: c.priority,
      score: c.score,
      status: c.status,
      emailCount: c._count.emails,
      updatedAt: c.updatedAt.toISOString(),
    }));
  } catch (error: unknown) {
    dbError = error instanceof Error ? error.message : "Unknown error";
    console.error("Companies DB error:", error);
  }

  const stats = {
    total: companies.length,
    enriched: companies.filter((c) => c.status !== "RAW").length,
    priorityA: companies.filter((c) => c.priority === "A").length,
    interested: companies.filter((c) => c.status === "INTERESTED").length,
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Pipeline</h1>
          <p className="text-gray-500 text-xs mt-0.5">
            {stats.total} companies
          </p>
        </div>
        <AddCompanyForm />
      </div>

      {dbError && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 text-sm font-medium">Database error</p>
          <p className="text-red-300/70 text-xs mt-1">{dbError}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Total"
          value={stats.total}
          icon={<Building2 className="w-4 h-4" />}
        />
        <KpiCard
          title="Enriched"
          value={stats.enriched}
          icon={<Sparkles className="w-4 h-4" />}
        />
        <KpiCard
          title="Priority A"
          value={stats.priorityA}
          icon={<Star className="w-4 h-4" />}
        />
        <KpiCard
          title="Interested"
          value={stats.interested}
          icon={<ThumbsUp className="w-4 h-4" />}
        />
      </div>

      {/* Toolbar — filters + view toggle */}
      <div className="mb-4">
        <Suspense>
          <PipelineToolbar />
        </Suspense>
      </div>

      {/* Content */}
      {companies.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search className="w-10 h-10" />}
            title="No companies found"
            description="Try adjusting filters or add companies from the Sources page."
          />
        </Card>
      ) : view === "board" ? (
        <CompaniesBoard companies={companies} />
      ) : (
        <Card className="overflow-hidden">
          <CompaniesTable companies={companies} />
        </Card>
      )}
    </div>
  );
}
