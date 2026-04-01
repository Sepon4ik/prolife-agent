import { prisma } from "@agency/db";
import { StartScrapeForm } from "./start-scrape-form";

const statusColors: Record<string, string> = {
  pending: "bg-gray-500/20 text-gray-300",
  running: "bg-blue-500/20 text-blue-300 animate-pulse",
  completed: "bg-green-500/20 text-green-300",
  failed: "bg-red-500/20 text-red-300",
};

const sourceTypeLabels: Record<string, string> = {
  EXHIBITION: "Exhibition",
  LINKEDIN: "LinkedIn",
  GOOGLE: "Google",
  WEBSITE: "Website",
  MANUAL: "Manual",
};

const sourceTypeIcons: Record<string, string> = {
  EXHIBITION: "\uD83C\uDFAA",
  LINKEDIN: "\uD83D\uDD17",
  GOOGLE: "\uD83D\uDD0D",
  WEBSITE: "\uD83C\uDF10",
  MANUAL: "\u270D\uFE0F",
};

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const jobs = await prisma.scrapingJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const stats = {
    total: jobs.length,
    running: jobs.filter((j) => j.status === "running").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    totalFound: jobs.reduce((sum, j) => sum + j.totalFound, 0),
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Sources</h1>
          <p className="text-gray-400 text-sm mt-1">
            Scraping jobs and data sources for company discovery
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MiniStat label="Total Jobs" value={stats.total} />
        <MiniStat label="Running" value={stats.running} />
        <MiniStat label="Completed" value={stats.completed} />
        <MiniStat label="Companies Found" value={stats.totalFound} />
      </div>

      {/* Start scraping form */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Start New Scraping Job</h2>
        <StartScrapeForm />
      </div>

      {/* Jobs table */}
      <h2 className="text-lg font-semibold mb-3">Scraping Jobs</h2>
      {jobs.length === 0 ? (
        <div className="bg-dark-secondary rounded-lg p-12 border border-white/10 text-center">
          <p className="text-gray-400 text-lg mb-2">No scraping jobs yet</p>
          <p className="text-gray-500 text-sm">
            Use the form above to start your first scraping job.
          </p>
        </div>
      ) : (
        <div className="bg-dark-secondary rounded-lg border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-gray-400 text-left">
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">URL</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Found</th>
                  <th className="px-4 py-3 font-medium">New</th>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const duration =
                    job.startedAt && job.finishedAt
                      ? Math.round(
                          (job.finishedAt.getTime() -
                            job.startedAt.getTime()) /
                            1000
                        )
                      : null;

                  return (
                    <tr
                      key={job.id}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm">
                          {sourceTypeIcons[job.sourceType]}{" "}
                          {sourceTypeLabels[job.sourceType]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {job.sourceName || "--"}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={job.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-400 hover:underline text-xs truncate block max-w-[200px]"
                        >
                          {job.sourceUrl}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs ${
                            statusColors[job.status] ||
                            "bg-gray-500/20 text-gray-300"
                          }`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white font-mono">
                        {job.totalFound}
                      </td>
                      <td className="px-4 py-3 text-green-400 font-mono">
                        {job.totalNew}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {job.startedAt
                          ? new Date(job.startedAt).toLocaleString()
                          : "--"}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {duration !== null ? `${duration}s` : "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-dark-secondary rounded-lg px-4 py-3 border border-white/10">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
    </div>
  );
}
