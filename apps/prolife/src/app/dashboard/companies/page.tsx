import {
  prisma,
  Prisma,
  type PipelineStage,
  getRegion,
  REGIONS,
  getCountriesInRegion,
} from "@agency/db";
import { Suspense } from "react";
import { AddCompanyForm } from "./add-company-form";
import { PipelineToolbar } from "./pipeline-toolbar";
import { CompaniesTable } from "./companies-table";
import { CountrySidebar } from "./country-sidebar";
import { Card, EmptyState } from "@agency/ui";
import { Search } from "lucide-react";
import type {
  PipelineCompany,
  StageCounts,
  RegionGroup,
  CountryCount,
} from "./types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: {
    stage?: string;
    country?: string;
    region?: string;
    q?: string;
  };
}

export default async function CompaniesPage({ searchParams }: PageProps) {
  const activeStage = (searchParams.stage ?? "NEW") as PipelineStage;

  // Base filter: not deleted
  const baseWhere: Prisma.CompanyWhereInput = { deletedAt: null };

  // Country/region filter for both sidebar counts and table
  let geoWhere: Prisma.CompanyWhereInput = {};
  if (searchParams.country) {
    geoWhere = { country: searchParams.country };
  } else if (searchParams.region) {
    const regionCountries = getCountriesInRegion(searchParams.region);
    if (regionCountries.length > 0) {
      geoWhere = { country: { in: regionCountries } };
    }
  }

  // Search filter
  let searchWhere: Prisma.CompanyWhereInput = {};
  if (searchParams.q) {
    searchWhere = { name: { contains: searchParams.q, mode: "insensitive" } };
  }

  let companies: PipelineCompany[] = [];
  let stageCounts: StageCounts = { NEW: 0, DEEP_RESEARCH: 0, LAST_STAGE: 0, TRASH: 0 };
  let regionGroups: RegionGroup[] = [];
  let totalCount = 0;
  let dbError: string | null = null;

  try {
    // Parallel queries: stage counts, companies, country counts
    const [stageCountsRaw, raw, countryCounts] = await Promise.all([
      // Stage counts (filtered by geo but not by stage/search)
      prisma.company.groupBy({
        by: ["stage"],
        where: { ...baseWhere, ...geoWhere },
        _count: true,
      }),
      // Companies for current stage
      prisma.company.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          country: true,
          priority: true,
          score: true,
          status: true,
          stage: true,
          salesStatus: true,
          trashReason: true,
          updatedAt: true,
          _count: { select: { emails: true } },
        },
        where: {
          ...baseWhere,
          ...geoWhere,
          ...searchWhere,
          stage: activeStage,
        },
        orderBy: [{ score: "desc" }],
        take: 200,
      }),
      // Country counts for sidebar (all stages, no search filter)
      prisma.company.groupBy({
        by: ["country"],
        where: baseWhere,
        _count: true,
        orderBy: { _count: { country: "desc" } },
      }),
    ]);

    // Map stage counts
    for (const row of stageCountsRaw) {
      stageCounts[row.stage] = row._count;
    }

    // Map companies
    companies = raw.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      country: c.country,
      priority: c.priority,
      score: c.score,
      status: c.status,
      stage: c.stage,
      salesStatus: c.salesStatus,
      trashReason: c.trashReason,
      emailCount: c._count.emails,
      updatedAt: c.updatedAt.toISOString(),
    }));

    // Build region groups for sidebar
    const regionMap = new Map<string, CountryCount[]>();
    for (const regionName of Object.keys(REGIONS)) {
      regionMap.set(regionName, []);
    }
    regionMap.set("OTHER", []);

    for (const row of countryCounts) {
      const region = getRegion(row.country);
      const list = regionMap.get(region) ?? regionMap.get("OTHER")!;
      list.push({ country: row.country, count: row._count });
      totalCount += row._count;
    }

    regionGroups = Array.from(regionMap.entries())
      .filter(([, countries]) => countries.length > 0)
      .map(([region, countries]) => ({
        region,
        countries,
        total: countries.reduce((sum, c) => sum + c.count, 0),
      }));
  } catch (error: unknown) {
    dbError = error instanceof Error ? error.message : "Unknown error";
    console.error("Companies DB error:", error);
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Pipeline</h1>
          <p className="text-gray-500 text-xs mt-0.5">
            {totalCount} companies across{" "}
            {regionGroups.reduce((s, r) => s + r.countries.length, 0)} countries
          </p>
        </div>
        <AddCompanyForm />
      </div>

      {dbError && (
        <div className="mb-5 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 text-sm font-medium">Database error</p>
          <p className="text-red-300/70 text-xs mt-1">{dbError}</p>
        </div>
      )}

      {/* Stage tabs */}
      <div className="mb-4">
        <Suspense>
          <PipelineToolbar stageCounts={stageCounts} />
        </Suspense>
      </div>

      {/* Main layout: sidebar + table */}
      <div className="flex gap-4">
        {/* Country sidebar */}
        <Suspense>
          <CountrySidebar regions={regionGroups} totalCount={totalCount} />
        </Suspense>

        {/* Table */}
        <div className="flex-1 min-w-0">
          {companies.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Search className="w-10 h-10" />}
                title="No companies in this folder"
                description="Move companies here from other stages, or adjust your filters."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <CompaniesTable
                companies={companies}
                activeStage={activeStage}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
