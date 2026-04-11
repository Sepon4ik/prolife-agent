import { prisma } from "@agency/db";
import { StartScrapeForm } from "./start-scrape-form";
import {
  KpiCard,
  Card,
  StatusBadge,
  EmptyState,
  timeAgo,
} from "@agency/ui";
import {
  Search,
  Loader2,
  CheckCircle2,
  Database,
} from "lucide-react";

const sourceTypeLabels: Record<string, string> = {
  EXHIBITION: "Exhibition",
  LINKEDIN: "LinkedIn",
  GOOGLE: "Google",
  GOOGLE_SEARCH: "Google Search",
  WEBSITE: "Website",
  MANUAL: "Manual",
};

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  let jobs: {
    id: string;
    sourceType: string;
    sourceName: string | null;
    sourceUrl: string;
    status: string;
    totalFound: number;
    totalNew: number;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
  }[] = [];
  let dbError: string | null = null;

  try {
    jobs = await prisma.scrapingJob.findMany({
      select: {
        id: true,
        sourceType: true,
        sourceName: true,
        sourceUrl: true,
        status: true,
        totalFound: true,
        totalNew: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  } catch (error: unknown) {
    dbError = error instanceof Error ? error.message : "Unknown error";
    console.error("Sources DB error:", error);
  }

  const stats = {
    total: jobs.length,
    running: jobs.filter((j) => j.status === "running").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    totalFound: jobs.reduce((sum, j) => sum + j.totalFound, 0),
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Источники</h1>
        <p className="text-gray-500 text-xs mt-0.5">
          Скрейпинг-задачи и источники данных
        </p>
      </div>

      {dbError && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 text-sm font-medium">Ошибка базы данных</p>
          <p className="text-red-300/70 text-xs mt-1">{dbError}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Всего задач"
          value={stats.total}
          icon={<Search className="w-4 h-4" />}
        />
        <KpiCard
          title="Запущено"
          value={stats.running}
          icon={<Loader2 className={`w-4 h-4 ${stats.running > 0 ? "animate-spin" : ""}`} />}
        />
        <KpiCard
          title="Завершено"
          value={stats.completed}
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <KpiCard
          title="Найдено компаний"
          value={stats.totalFound.toLocaleString()}
          icon={<Database className="w-4 h-4" />}
        />
      </div>

      {/* Start scraping form */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-white mb-3">
          Запустить скрейпинг
        </h2>
        <StartScrapeForm />
      </div>

      {/* Jobs table */}
      <h2 className="text-sm font-semibold text-white mb-3">Последние задачи</h2>
      {jobs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search className="w-10 h-10" />}
            title="Задач пока нет"
            description="Используйте форму выше для запуска первого скрейпинга."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-gray-500 text-left text-xs">
                  <th className="px-5 py-3 font-medium">Источник</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium text-right">Найдено</th>
                  <th className="px-4 py-3 font-medium text-right">Новых</th>
                  <th className="px-4 py-3 font-medium text-right">Время</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const duration =
                    job.startedAt && job.finishedAt
                      ? Math.round(
                          (new Date(job.finishedAt).getTime() -
                            new Date(job.startedAt).getTime()) /
                            1000
                        )
                      : null;

                  let hostname: string | null = null;
                  try {
                    hostname = new URL(job.sourceUrl).hostname;
                  } catch {
                    /* skip */
                  }

                  return (
                    <tr
                      key={job.id}
                      className="border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="text-sm text-white font-medium">
                          {sourceTypeLabels[job.sourceType] ?? job.sourceType}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {job.sourceName && (
                            <span className="text-gray-400">
                              {job.sourceName} ·{" "}
                            </span>
                          )}
                          {hostname && (
                            <a
                              href={job.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-600 hover:text-primary-400 truncate"
                            >
                              {hostname}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-white font-mono tabular-nums">
                        {job.totalFound}
                      </td>
                      <td className="px-4 py-3 text-right text-green-400 font-mono tabular-nums">
                        {job.totalNew > 0 ? `+${job.totalNew}` : "0"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="text-xs text-gray-500 tabular-nums">
                          {timeAgo(new Date(job.createdAt))}
                        </div>
                        {duration !== null && (
                          <div className="text-[10px] text-gray-600 tabular-nums">
                            {duration}s
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
