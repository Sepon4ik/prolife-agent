import { prisma } from "@agency/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const priorityConfig = {
  A: { label: "Hot", color: "bg-green-500", text: "text-green-400", border: "border-green-500/30", bg: "bg-green-500/10" },
  B: { label: "Warm", color: "bg-yellow-500", text: "text-yellow-400", border: "border-yellow-500/30", bg: "bg-yellow-500/10" },
  C: { label: "Cold", color: "bg-gray-500", text: "text-gray-400", border: "border-gray-500/30", bg: "bg-gray-500/10" },
};

export default async function DashboardPage() {
  let dbError: string | null = null;
  let data = {
    pipeline: 0,
    emailsSent: 0,
    replyRate: 0,
    conversionRate: 0,
    // Week deltas
    pipelineNew: 0,
    emailsNew: 0,
    // Action items
    repliesWaiting: 0,
    readyForOutreach: 0,
    bouncedEmails: 0,
    runningJobs: 0,
    // Priority breakdown
    priorityA: 0,
    priorityB: 0,
    priorityC: 0,
    // Funnel
    funnel: { sent: 0, delivered: 0, opened: 0, replied: 0 },
    // Score distribution
    scoreDistribution: [] as { range: string; count: number; color: string }[],
    // Hot leads
    hotLeads: [] as { id: string; name: string; score: number; status: string; country: string }[],
    // Activity feed
    recentEmails: [] as { id: string; status: string; updatedAt: Date; company: { name: string } }[],
    recentJobs: [] as { id: string; sourceType: string; status: string; totalFound: number; totalNew: number; createdAt: Date }[],
    // Geographic reach
    countryCount: 0,
    topCountries: [] as { country: string; count: number }[],
  };

  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const [
      totalCompanies,
      newThisWeek,
      emailsSent,
      emailsThisWeek,
      repliesCount,
      interestedCount,
      repliesWaiting,
      readyForOutreach,
      bouncedEmails,
      runningJobs,
      priorityGroups,
      emailStatusGroups,
      scoreRanges,
      hotLeads,
      recentEmails,
      recentJobs,
      countryGroups,
    ] = await Promise.all([
      // Pipeline total
      prisma.company.count({ where: { deletedAt: null } }),
      // New this week
      prisma.company.count({
        where: { deletedAt: null, createdAt: { gte: oneWeekAgo } },
      }),
      // Emails sent
      prisma.email.count({
        where: { status: { notIn: ["QUEUED", "FAILED"] } },
      }),
      // Emails this week
      prisma.email.count({
        where: { createdAt: { gte: oneWeekAgo }, status: { notIn: ["QUEUED", "FAILED"] } },
      }),
      // Replies
      prisma.email.count({ where: { status: "REPLIED" } }),
      // Interested + handed off
      prisma.company.count({
        where: { status: { in: ["INTERESTED", "HANDED_OFF"] }, deletedAt: null },
      }),
      // ACTION: Replies waiting for review
      prisma.company.count({
        where: { status: "REPLIED", deletedAt: null },
      }),
      // ACTION: Scored but not yet contacted
      prisma.company.count({
        where: { status: "SCORED", deletedAt: null },
      }),
      // ACTION: Bounced emails
      prisma.email.count({ where: { status: "BOUNCED" } }),
      // ACTION: Running scraping jobs
      prisma.scrapingJob.count({ where: { status: "running" } }),
      // Priority breakdown
      prisma.company.groupBy({
        by: ["priority"],
        _count: { _all: true },
        where: { deletedAt: null },
      }),
      // Email funnel
      prisma.email.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      // Score distribution (4 buckets via raw query)
      prisma.$queryRaw`
        SELECT
          CASE
            WHEN score >= 80 THEN '80-100'
            WHEN score >= 60 THEN '60-79'
            WHEN score >= 40 THEN '40-59'
            ELSE '0-39'
          END as range,
          COUNT(*)::int as count
        FROM "Company"
        WHERE "deletedAt" IS NULL AND score > 0
        GROUP BY range
        ORDER BY range DESC
      ` as Promise<{ range: string; count: number }[]>,
      // Hot leads: top 5 by score, that are REPLIED or INTERESTED
      prisma.company.findMany({
        where: {
          status: { in: ["REPLIED", "INTERESTED"] },
          deletedAt: null,
        },
        orderBy: { score: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          country: true,
          score: true,
          priority: true,
          status: true,
          type: true,
          contacts: {
            where: { isPrimary: true },
            take: 1,
            select: { name: true, title: true },
          },
        },
      }),
      // Recent email activity
      prisma.email.findMany({
        where: { status: { in: ["REPLIED", "OPENED", "BOUNCED"] } },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          id: true,
          status: true,
          updatedAt: true,
          company: { select: { name: true } },
        },
      }),
      // Recent scraping jobs
      prisma.scrapingJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          sourceName: true,
          sourceType: true,
          status: true,
          totalFound: true,
          totalNew: true,
          createdAt: true,
        },
      }),
      // Countries
      prisma.company.groupBy({
        by: ["country"],
        _count: { _all: true },
        where: { deletedAt: null },
        orderBy: { _count: { country: "desc" } },
        take: 5,
      }),
    ]);

    // Build email funnel
    const emailMap = Object.fromEntries(
      emailStatusGroups.map((g) => [g.status, g._count._all])
    );
    const totalEmailsSent =
      (emailMap.SENT ?? 0) + (emailMap.DELIVERED ?? 0) + (emailMap.OPENED ?? 0) +
      (emailMap.CLICKED ?? 0) + (emailMap.REPLIED ?? 0) + (emailMap.BOUNCED ?? 0);

    // Priority map
    const priorityMap = Object.fromEntries(
      priorityGroups.map((g) => [g.priority, g._count._all])
    );

    // Score colors
    const scoreColors: Record<string, string> = {
      "80-100": "bg-green-500",
      "60-79": "bg-emerald-500",
      "40-59": "bg-yellow-500",
      "0-39": "bg-gray-500",
    };

    data = {
      pipeline: totalCompanies,
      emailsSent,
      replyRate: emailsSent > 0 ? Math.round((repliesCount / emailsSent) * 100) : 0,
      conversionRate: emailsSent > 0 ? Math.round((interestedCount / emailsSent) * 100) : 0,
      pipelineNew: newThisWeek,
      emailsNew: emailsThisWeek,
      repliesWaiting,
      readyForOutreach,
      bouncedEmails,
      runningJobs,
      priorityA: priorityMap.A ?? 0,
      priorityB: priorityMap.B ?? 0,
      priorityC: priorityMap.C ?? 0,
      funnel: {
        sent: totalEmailsSent,
        delivered: (emailMap.DELIVERED ?? 0) + (emailMap.OPENED ?? 0) + (emailMap.CLICKED ?? 0) + (emailMap.REPLIED ?? 0),
        opened: (emailMap.OPENED ?? 0) + (emailMap.CLICKED ?? 0) + (emailMap.REPLIED ?? 0),
        replied: emailMap.REPLIED ?? 0,
      },
      scoreDistribution: (scoreRanges || []).map((r) => ({
        range: r.range,
        count: r.count,
        color: scoreColors[r.range] ?? "bg-gray-500",
      })),
      hotLeads,
      recentEmails,
      recentJobs,
      countryCount: countryGroups.length,
      topCountries: countryGroups.map((g) => ({
        country: g.country,
        count: g._count._all,
      })),
    };
  } catch (error: any) {
    dbError = error.message;
    console.error("Dashboard DB error:", error);
  }

  const totalActions = data.repliesWaiting + data.readyForOutreach + data.bouncedEmails + data.runningJobs;
  const maxScore = Math.max(...data.scoreDistribution.map((s) => s.count), 1);
  const totalPriority = data.priorityA + data.priorityB + data.priorityC || 1;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Command Center</h1>
          <p className="text-gray-500 text-xs mt-0.5">
            Global distributor acquisition pipeline
          </p>
        </div>
        <div className="text-xs text-gray-600">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </div>
      </div>

      {dbError && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 text-sm font-medium">Database Error</p>
          <p className="text-red-300/70 text-xs mt-1">{dbError}</p>
        </div>
      )}

      {/* === ACTION PANEL === */}
      {totalActions > 0 && (
        <div className="mb-6 bg-primary-600/5 border border-primary-600/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
            <h2 className="text-sm font-semibold text-primary-400">
              Needs Your Attention
            </h2>
            <span className="ml-auto text-xs text-gray-500">
              {totalActions} action{totalActions !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {data.repliesWaiting > 0 && (
              <ActionItem
                count={data.repliesWaiting}
                label="replies waiting for review"
                href="/dashboard/companies?status=REPLIED"
                urgency="high"
              />
            )}
            {data.readyForOutreach > 0 && (
              <ActionItem
                count={data.readyForOutreach}
                label="companies ready for outreach"
                href="/dashboard/companies?status=SCORED"
                urgency="medium"
              />
            )}
            {data.bouncedEmails > 0 && (
              <ActionItem
                count={data.bouncedEmails}
                label="bounced emails"
                href="/dashboard/outreach"
                urgency="high"
              />
            )}
            {data.runningJobs > 0 && (
              <ActionItem
                count={data.runningJobs}
                label={data.runningJobs === 1 ? "scraping job running" : "scraping jobs running"}
                href="/dashboard/sources"
                urgency="low"
              />
            )}
          </div>
        </div>
      )}

      {/* === KPI CARDS === */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Pipeline"
          value={data.pipeline}
          delta={data.pipelineNew}
          deltaLabel="this week"
        />
        <KpiCard
          title="Emails Sent"
          value={data.emailsSent}
          delta={data.emailsNew}
          deltaLabel="this week"
        />
        <KpiCard
          title="Reply Rate"
          value={`${data.replyRate}%`}
          subtitle={data.replyRate >= 10 ? "Above avg" : data.replyRate >= 5 ? "Average" : "Below avg"}
          subtitleColor={data.replyRate >= 10 ? "text-green-400" : data.replyRate >= 5 ? "text-yellow-400" : "text-gray-500"}
        />
        <KpiCard
          title="Conversion"
          value={`${data.conversionRate}%`}
          subtitle={`${data.priorityA + (data.hotLeads?.length ?? 0)} interested`}
          subtitleColor="text-green-400"
        />
      </div>

      {/* === MAIN GRID === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Pipeline Quality — 2 columns */}
        <div className="lg:col-span-2 bg-dark-secondary rounded-xl border border-white/5 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">
            Pipeline Quality
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Priority breakdown */}
            <div>
              <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider">
                Lead Temperature
              </p>
              <div className="space-y-3">
                {(["A", "B", "C"] as const).map((p) => {
                  const cfg = priorityConfig[p];
                  const count = p === "A" ? data.priorityA : p === "B" ? data.priorityB : data.priorityC;
                  const pct = Math.round((count / totalPriority) * 100);
                  return (
                    <div key={p} className="flex items-center gap-3">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${cfg.bg} ${cfg.text} ${cfg.border} border`}
                      >
                        {cfg.label}
                      </span>
                      <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${cfg.color} rounded-full transition-all`}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-white w-8 text-right">
                        {count}
                      </span>
                      <span className="text-xs text-gray-500 w-10">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Geographic reach */}
              {data.topCountries.length > 0 && (
                <div className="mt-5 pt-4 border-t border-white/5">
                  <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                    Top Markets
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.topCountries.map((c) => (
                      <span
                        key={c.country}
                        className="text-xs px-2 py-1 rounded bg-white/5 text-gray-300"
                      >
                        {c.country}{" "}
                        <span className="text-gray-500">{c.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Score distribution */}
            <div>
              <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider">
                Score Distribution
              </p>
              {data.scoreDistribution.length === 0 ? (
                <p className="text-gray-600 text-xs">
                  No scored companies yet.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {data.scoreDistribution.map((s) => (
                    <div key={s.range} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-14 font-mono">
                        {s.range}
                      </span>
                      <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${s.color} rounded-full opacity-80`}
                          style={{
                            width: `${Math.max((s.count / maxScore) * 100, 3)}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium text-white w-8 text-right">
                        {s.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick score legend */}
              <div className="mt-4 pt-3 border-t border-white/5">
                <p className="text-[10px] text-gray-600 leading-relaxed">
                  Score weights: Geography (20) + Type (15) + Revenue (15) +
                  Sales Team (10) + Med Reps (10) + Pharmacy Network (10) +
                  E-commerce (5) + Marketing (5) + Seeking Brands (5) +
                  Portfolio (5)
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Outreach Funnel — 1 column */}
        <div className="bg-dark-secondary rounded-xl border border-white/5 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">
            Outreach Funnel
          </h2>
          {data.funnel.sent === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <p className="text-gray-500 text-sm">No emails sent yet</p>
              <p className="text-gray-600 text-xs mt-1">
                Pipeline companies with Priority A/B will be contacted automatically
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <FunnelStep
                label="Sent"
                count={data.funnel.sent}
                total={data.funnel.sent}
                color="bg-blue-500"
              />
              <FunnelStep
                label="Delivered"
                count={data.funnel.delivered}
                total={data.funnel.sent}
                color="bg-cyan-500"
              />
              <FunnelStep
                label="Opened"
                count={data.funnel.opened}
                total={data.funnel.sent}
                color="bg-purple-500"
              />
              <FunnelStep
                label="Replied"
                count={data.funnel.replied}
                total={data.funnel.sent}
                color="bg-green-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* === BOTTOM GRID === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hot Leads */}
        <div className="bg-dark-secondary rounded-xl border border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Hot Leads</h2>
            <Link
              href="/dashboard/companies"
              className="text-xs text-primary-400 hover:text-primary-300"
            >
              View all
            </Link>
          </div>
          {data.hotLeads.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">No hot leads yet</p>
              <p className="text-gray-600 text-xs mt-1">
                Leads appear here when they reply to outreach
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.hotLeads.map((lead: any) => {
                const pcfg = priorityConfig[lead.priority as keyof typeof priorityConfig];
                return (
                  <div
                    key={lead.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                  >
                    {/* Score circle */}
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border ${
                        lead.score >= 70
                          ? "border-green-500/40 text-green-400 bg-green-500/10"
                          : lead.score >= 40
                            ? "border-yellow-500/40 text-yellow-400 bg-yellow-500/10"
                            : "border-gray-500/40 text-gray-400 bg-gray-500/10"
                      }`}
                    >
                      {lead.score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">
                          {lead.name}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${pcfg.bg} ${pcfg.text}`}
                        >
                          {pcfg.label}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {lead.country}
                        {lead.contacts?.[0] &&
                          ` · ${lead.contacts[0].name}${lead.contacts[0].title ? `, ${lead.contacts[0].title}` : ""}`}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded ${
                        lead.status === "INTERESTED"
                          ? "bg-green-500/20 text-green-300"
                          : "bg-cyan-500/20 text-cyan-300"
                      }`}
                    >
                      {lead.status === "INTERESTED" ? "Interested" : "Replied"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="bg-dark-secondary rounded-xl border border-white/5 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">
            Recent Activity
          </h2>
          {data.recentEmails.length === 0 && data.recentJobs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">No activity yet</p>
              <p className="text-gray-600 text-xs mt-1">
                Start by adding sources to discover companies
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Merge and sort by time */}
              {[
                ...data.recentEmails.map((e: any) => ({
                  time: new Date(e.updatedAt),
                  type: "email" as const,
                  status: e.status,
                  company: e.company.name,
                })),
                ...data.recentJobs.map((j: any) => ({
                  time: new Date(j.createdAt),
                  type: "job" as const,
                  status: j.status,
                  source: j.sourceName || j.sourceType,
                  found: j.totalFound,
                  newCount: j.totalNew,
                })),
              ]
                .sort((a, b) => b.time.getTime() - a.time.getTime())
                .slice(0, 10)
                .map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-2 border-b border-white/[0.03] last:border-0"
                  >
                    <ActivityDot
                      type={
                        item.type === "email"
                          ? item.status === "REPLIED"
                            ? "success"
                            : item.status === "BOUNCED"
                              ? "error"
                              : "info"
                          : item.status === "completed"
                            ? "success"
                            : item.status === "running"
                              ? "info"
                              : item.status === "failed"
                                ? "error"
                                : "neutral"
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-300">
                        {item.type === "email" ? (
                          <>
                            <span className="text-white font-medium">
                              {item.company}
                            </span>{" "}
                            {item.status === "REPLIED"
                              ? "replied to outreach"
                              : item.status === "OPENED"
                                ? "opened email"
                                : "email bounced"}
                          </>
                        ) : (
                          <>
                            Scrape{" "}
                            <span className="text-white font-medium">
                              {item.source}
                            </span>{" "}
                            {item.status === "completed"
                              ? `done — ${item.found} found, ${item.newCount} new`
                              : item.status}
                          </>
                        )}
                      </p>
                    </div>
                    <span className="text-[10px] text-gray-600 whitespace-nowrap">
                      {timeAgo(item.time)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// === COMPONENTS ===

function ActionItem({
  count,
  label,
  href,
  urgency,
}: {
  count: number;
  label: string;
  href: string;
  urgency: "high" | "medium" | "low";
}) {
  const colors = {
    high: "border-red-500/20 bg-red-500/5 hover:bg-red-500/10",
    medium: "border-yellow-500/20 bg-yellow-500/5 hover:bg-yellow-500/10",
    low: "border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10",
  };
  const countColors = {
    high: "text-red-400",
    medium: "text-yellow-400",
    low: "text-blue-400",
  };

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-colors ${colors[urgency]}`}
    >
      <span className={`text-lg font-bold ${countColors[urgency]}`}>
        {count}
      </span>
      <span className="text-xs text-gray-300">{label}</span>
      <svg
        className="w-3 h-3 text-gray-600 ml-auto"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
    </Link>
  );
}

function KpiCard({
  title,
  value,
  delta,
  deltaLabel,
  subtitle,
  subtitleColor,
}: {
  title: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  subtitle?: string;
  subtitleColor?: string;
}) {
  return (
    <div className="bg-dark-secondary rounded-xl border border-white/5 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{title}</p>
      <p className="text-3xl font-bold text-white mt-1">{value}</p>
      {delta !== undefined && delta > 0 && (
        <p className="text-xs text-green-400 mt-1">
          +{delta} {deltaLabel}
        </p>
      )}
      {delta !== undefined && delta === 0 && (
        <p className="text-xs text-gray-600 mt-1">
          No change {deltaLabel}
        </p>
      )}
      {subtitle && (
        <p className={`text-xs mt-1 ${subtitleColor ?? "text-gray-500"}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function FunnelStep({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barWidth = total > 0 ? Math.max((count / total) * 100, 3) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white">{count}</span>
          <span className="text-[10px] text-gray-600">{pct}%</span>
        </div>
      </div>
      <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full opacity-80 transition-all`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

function ActivityDot({ type }: { type: "success" | "error" | "info" | "neutral" }) {
  const colors = {
    success: "bg-green-500",
    error: "bg-red-500",
    info: "bg-blue-500",
    neutral: "bg-gray-500",
  };
  return <div className={`w-1.5 h-1.5 rounded-full ${colors[type]} shrink-0`} />;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
