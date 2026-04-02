import { prisma } from "@agency/db";

const statusColors: Record<string, string> = {
  RAW: "bg-gray-500",
  ENRICHED: "bg-blue-500",
  SCORED: "bg-purple-500",
  OUTREACH_SENT: "bg-yellow-500",
  REPLIED: "bg-cyan-500",
  INTERESTED: "bg-green-500",
  NOT_INTERESTED: "bg-red-500",
  HANDED_OFF: "bg-emerald-500",
  DISQUALIFIED: "bg-rose-500",
};

const statusLabels: Record<string, string> = {
  RAW: "Raw",
  ENRICHED: "Enriched",
  SCORED: "Scored",
  OUTREACH_SENT: "Outreach Sent",
  REPLIED: "Replied",
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not Interested",
  HANDED_OFF: "Handed Off",
  DISQUALIFIED: "Disqualified",
};

const jobStatusColors: Record<string, string> = {
  pending: "bg-gray-500/20 text-gray-300",
  running: "bg-blue-500/20 text-blue-300",
  completed: "bg-green-500/20 text-green-300",
  failed: "bg-red-500/20 text-red-300",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let dbError: string | null = null;
  let kpi = { total: 0, enriched: 0, emailsSent: 0, replies: 0 };
  let companyByStatus: { status: string; _count: number }[] = [];
  let emailFunnel = { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0 };
  let topCountries: { country: string; _count: number }[] = [];
  let recentJobs: any[] = [];
  let conversionRate = 0;
  let responseRate = 0;

  try {
    // Run all queries in parallel
    const [
      totalCompanies,
      enrichedCompanies,
      emailsSent,
      repliesCount,
      statusGroups,
      emailStatusGroups,
      countryGroups,
      jobs,
      interestedCount,
    ] = await Promise.all([
      prisma.company.count({ where: { deletedAt: null } }),
      prisma.company.count({
        where: { status: { not: "RAW" }, deletedAt: null },
      }),
      prisma.email.count({
        where: { status: { notIn: ["QUEUED", "FAILED"] } },
      }),
      prisma.email.count({ where: { status: "REPLIED" } }),
      prisma.company.groupBy({
        by: ["status"],
        _count: { _all: true },
        where: { deletedAt: null },
      }),
      prisma.email.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.company.groupBy({
        by: ["country"],
        _count: { _all: true },
        where: { deletedAt: null },
        orderBy: { _count: { country: "desc" } },
        take: 10,
      }),
      prisma.scrapingJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.company.count({
        where: {
          status: { in: ["INTERESTED", "HANDED_OFF"] },
          deletedAt: null,
        },
      }),
    ]);

    kpi = {
      total: totalCompanies,
      enriched: enrichedCompanies,
      emailsSent,
      replies: repliesCount,
    };

    companyByStatus = statusGroups.map((g) => ({
      status: g.status,
      _count: g._count._all,
    }));

    // Build email funnel from grouped statuses
    const emailMap = Object.fromEntries(
      emailStatusGroups.map((g) => [g.status, g._count._all])
    );
    const totalEmails =
      (emailMap.SENT ?? 0) +
      (emailMap.DELIVERED ?? 0) +
      (emailMap.OPENED ?? 0) +
      (emailMap.CLICKED ?? 0) +
      (emailMap.REPLIED ?? 0) +
      (emailMap.BOUNCED ?? 0);

    emailFunnel = {
      sent: totalEmails,
      delivered:
        (emailMap.DELIVERED ?? 0) +
        (emailMap.OPENED ?? 0) +
        (emailMap.CLICKED ?? 0) +
        (emailMap.REPLIED ?? 0),
      opened:
        (emailMap.OPENED ?? 0) +
        (emailMap.CLICKED ?? 0) +
        (emailMap.REPLIED ?? 0),
      clicked: (emailMap.CLICKED ?? 0) + (emailMap.REPLIED ?? 0),
      replied: emailMap.REPLIED ?? 0,
    };

    topCountries = countryGroups.map((g) => ({
      country: g.country,
      _count: g._count._all,
    }));

    recentJobs = jobs;

    conversionRate =
      emailsSent > 0 ? Math.round((interestedCount / emailsSent) * 100) : 0;
    responseRate =
      emailsSent > 0 ? Math.round((repliesCount / emailsSent) * 100) : 0;
  } catch (error: any) {
    dbError = error.message;
    console.error("Dashboard DB error:", error);
  }

  const maxCompanyCount = Math.max(
    ...companyByStatus.map((s) => s._count),
    1
  );

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">
          Pipeline overview and key metrics
        </p>
      </div>

      {dbError && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 text-sm font-medium">Database Error</p>
          <p className="text-red-300/70 text-xs mt-1">{dbError}</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
        <StatCard title="Companies Found" value={kpi.total} />
        <StatCard title="Enriched" value={kpi.enriched} />
        <StatCard title="Emails Sent" value={kpi.emailsSent} />
        <StatCard title="Replies" value={kpi.replies} />
        <StatCard title="Conversion" value={`${conversionRate}%`} highlight />
        <StatCard title="Response Rate" value={`${responseRate}%`} highlight />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Companies by Status */}
        <div className="bg-dark-secondary rounded-lg p-6 border border-white/10">
          <h2 className="text-lg font-semibold mb-4">Companies by Status</h2>
          {companyByStatus.length === 0 ? (
            <p className="text-gray-400 text-sm">No companies yet.</p>
          ) : (
            <div className="space-y-3">
              {companyByStatus
                .sort((a, b) => b._count - a._count)
                .map((item) => (
                  <div key={item.status} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-28 truncate">
                      {statusLabels[item.status] ?? item.status}
                    </span>
                    <div className="flex-1 h-6 bg-white/5 rounded overflow-hidden">
                      <div
                        className={`h-full ${statusColors[item.status] ?? "bg-gray-500"} rounded opacity-70`}
                        style={{
                          width: `${Math.max((item._count / maxCompanyCount) * 100, 2)}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-10 text-right">
                      {item._count}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Outreach Funnel */}
        <div className="bg-dark-secondary rounded-lg p-6 border border-white/10">
          <h2 className="text-lg font-semibold mb-4">Outreach Funnel</h2>
          {emailFunnel.sent === 0 ? (
            <p className="text-gray-400 text-sm">
              No emails sent yet. Funnel will appear once outreach starts.
            </p>
          ) : (
            <div className="flex items-end gap-3 h-32">
              <FunnelBar
                label="Sent"
                count={emailFunnel.sent}
                total={emailFunnel.sent}
                color="bg-blue-500"
              />
              <FunnelBar
                label="Delivered"
                count={emailFunnel.delivered}
                total={emailFunnel.sent}
                color="bg-cyan-500"
              />
              <FunnelBar
                label="Opened"
                count={emailFunnel.opened}
                total={emailFunnel.sent}
                color="bg-purple-500"
              />
              <FunnelBar
                label="Clicked"
                count={emailFunnel.clicked}
                total={emailFunnel.sent}
                color="bg-indigo-500"
              />
              <FunnelBar
                label="Replied"
                count={emailFunnel.replied}
                total={emailFunnel.sent}
                color="bg-green-500"
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Countries */}
        <div className="bg-dark-secondary rounded-lg p-6 border border-white/10">
          <h2 className="text-lg font-semibold mb-4">Top Countries</h2>
          {topCountries.length === 0 ? (
            <p className="text-gray-400 text-sm">No data yet.</p>
          ) : (
            <div className="space-y-2">
              {topCountries.map((item, i) => (
                <div
                  key={item.country}
                  className="flex items-center justify-between py-1"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-5">{i + 1}.</span>
                    <span className="text-sm text-gray-200">
                      {item.country}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-400">
                    {item._count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Scraping Jobs */}
        <div className="bg-dark-secondary rounded-lg p-6 border border-white/10">
          <h2 className="text-lg font-semibold mb-4">Recent Scraping Jobs</h2>
          {recentJobs.length === 0 ? (
            <p className="text-gray-400 text-sm">
              No scraping jobs yet. Start one from the Sources page.
            </p>
          ) : (
            <div className="space-y-3">
              {recentJobs.map((job: any) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium text-white">
                      {job.sourceName || job.sourceUrl}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {job.sourceType} &middot;{" "}
                      {new Date(job.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {job.totalFound} found / {job.totalNew} new
                    </span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs ${
                        jobStatusColors[job.status] ??
                        "bg-gray-500/20 text-gray-300"
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  highlight,
}: {
  title: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="bg-dark-secondary rounded-lg px-4 py-3 border border-white/10">
      <p className="text-xs text-gray-400">{title}</p>
      <p
        className={`text-2xl font-bold mt-0.5 ${
          highlight ? "text-primary-400" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function FunnelBar({
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
  const pct = total > 0 ? Math.max((count / total) * 100, 4) : 4;
  return (
    <div className="flex-1 flex flex-col items-center gap-1">
      <span className="text-xs text-gray-400">{count}</span>
      <div
        className={`w-full ${color} rounded-t`}
        style={{ height: `${pct}%`, minHeight: "4px" }}
      />
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}
