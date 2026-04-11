import { prisma } from "@agency/db";
import Link from "next/link";
import {
  KpiCard,
  Card,
  CardHeader,
  CardContent,
  StatusBadge,
  ScoreBadge,
  PriorityBadge,
  EmptyState,
  priorityStyles,
  timeAgo,
} from "@agency/ui";
import {
  Users,
  Mail,
  MessageSquare,
  TrendingUp,
  ChevronRight,
  AlertCircle,
  Clock,
  Zap,
  Globe,
  MailOpen,
  MailWarning,
  Loader2,
  Eye,
  Reply,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let dbError: string | null = null;
  let data = {
    pipeline: 0,
    emailsSent: 0,
    replyRate: 0,
    conversionRate: 0,
    pipelineNew: 0,
    emailsNew: 0,
    repliesWaiting: 0,
    readyForOutreach: 0,
    bouncedEmails: 0,
    runningJobs: 0,
    priorityA: 0,
    priorityB: 0,
    priorityC: 0,
    funnel: { sent: 0, delivered: 0, opened: 0, replied: 0 },
    scoreDistribution: [] as { range: string; count: number; color: string }[],
    hotLeads: [] as {
      id: string;
      name: string;
      score: number;
      status: string;
      country: string;
      priority: string;
      type: string;
      contacts: { name: string; title: string | null }[];
    }[],
    recentEmails: [] as {
      id: string;
      status: string;
      updatedAt: Date;
      company: { name: string };
    }[],
    recentJobs: [] as {
      id: string;
      sourceType: string;
      sourceName: string | null;
      status: string;
      totalFound: number;
      totalNew: number;
      createdAt: Date;
    }[],
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
      prisma.company.count({ where: { deletedAt: null } }),
      prisma.company.count({
        where: { deletedAt: null, createdAt: { gte: oneWeekAgo } },
      }),
      prisma.email.count({
        where: { status: { notIn: ["QUEUED", "FAILED"] } },
      }),
      prisma.email.count({
        where: {
          createdAt: { gte: oneWeekAgo },
          status: { notIn: ["QUEUED", "FAILED"] },
        },
      }),
      prisma.email.count({ where: { status: "REPLIED" } }),
      prisma.company.count({
        where: {
          status: { in: ["INTERESTED", "HANDED_OFF"] },
          deletedAt: null,
        },
      }),
      prisma.company.count({
        where: { status: "REPLIED", deletedAt: null },
      }),
      prisma.company.count({
        where: { status: "SCORED", deletedAt: null },
      }),
      prisma.email.count({ where: { status: "BOUNCED" } }),
      prisma.scrapingJob.count({ where: { status: "running" } }),
      prisma.company.groupBy({
        by: ["priority"],
        _count: { _all: true },
        where: { deletedAt: null },
      }),
      prisma.email.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
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
      prisma.company.groupBy({
        by: ["country"],
        _count: { _all: true },
        where: { deletedAt: null },
        orderBy: { _count: { country: "desc" } },
        take: 5,
      }),
    ]);

    const emailMap = Object.fromEntries(
      emailStatusGroups.map((g) => [g.status, g._count._all])
    );
    const totalEmailsSent =
      (emailMap.SENT ?? 0) +
      (emailMap.DELIVERED ?? 0) +
      (emailMap.OPENED ?? 0) +
      (emailMap.CLICKED ?? 0) +
      (emailMap.REPLIED ?? 0) +
      (emailMap.BOUNCED ?? 0);

    const priorityMap = Object.fromEntries(
      priorityGroups.map((g) => [g.priority, g._count._all])
    );

    const scoreColors: Record<string, string> = {
      "80-100": "bg-green-500",
      "60-79": "bg-emerald-500",
      "40-59": "bg-yellow-500",
      "0-39": "bg-gray-500",
    };

    data = {
      pipeline: totalCompanies,
      emailsSent,
      replyRate:
        emailsSent > 0
          ? Math.round((repliesCount / emailsSent) * 100)
          : 0,
      conversionRate:
        emailsSent > 0
          ? Math.round((interestedCount / emailsSent) * 100)
          : 0,
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
        delivered:
          (emailMap.DELIVERED ?? 0) +
          (emailMap.OPENED ?? 0) +
          (emailMap.CLICKED ?? 0) +
          (emailMap.REPLIED ?? 0),
        opened:
          (emailMap.OPENED ?? 0) +
          (emailMap.CLICKED ?? 0) +
          (emailMap.REPLIED ?? 0),
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
      topCountries: countryGroups.map((g) => ({
        country: g.country,
        count: g._count._all,
      })),
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    dbError = message;
    console.error("Dashboard DB error:", error);
  }

  const totalActions =
    data.repliesWaiting +
    data.readyForOutreach +
    data.bouncedEmails +
    data.runningJobs;
  const maxScore = Math.max(
    ...data.scoreDistribution.map((s) => s.count),
    1
  );
  const totalPriority =
    data.priorityA + data.priorityB + data.priorityC || 1;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Центр управления</h1>
          <p className="text-gray-500 text-xs mt-0.5">
            Пайплайн привлечения дистрибьюторов
          </p>
        </div>
        <div className="text-xs text-gray-600 tabular-nums">
          {new Date().toLocaleDateString("ru-RU", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </div>
      </div>

      {dbError && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 text-sm font-medium">Ошибка базы данных</p>
            <p className="text-red-300/70 text-xs mt-1">{dbError}</p>
          </div>
        </div>
      )}

      {/* Action Panel */}
      {totalActions > 0 && (
        <div className="mb-6 bg-primary-600/5 border border-primary-600/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
            <h2 className="text-sm font-semibold text-primary-400">
              Требует внимания
            </h2>
            <span className="ml-auto text-xs text-gray-500 tabular-nums">
              {totalActions} действи{totalActions === 1 ? "е" : totalActions < 5 ? "я" : "й"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {data.repliesWaiting > 0 && (
              <ActionItem
                count={data.repliesWaiting}
                label="ответов ждут проверки"
                href="/dashboard/companies?status=REPLIED"
                icon={<Reply className="w-3.5 h-3.5" />}
                urgency="high"
              />
            )}
            {data.readyForOutreach > 0 && (
              <ActionItem
                count={data.readyForOutreach}
                label="готовы к рассылке"
                href="/dashboard/companies?status=SCORED"
                icon={<Mail className="w-3.5 h-3.5" />}
                urgency="medium"
              />
            )}
            {data.bouncedEmails > 0 && (
              <ActionItem
                count={data.bouncedEmails}
                label="отскочивших писем"
                href="/dashboard/outreach"
                icon={<MailWarning className="w-3.5 h-3.5" />}
                urgency="high"
              />
            )}
            {data.runningJobs > 0 && (
              <ActionItem
                count={data.runningJobs}
                label={data.runningJobs === 1 ? "задача запущена" : "задач запущено"}
                href="/dashboard/sources"
                icon={<Loader2 className="w-3.5 h-3.5 animate-spin" />}
                urgency="low"
              />
            )}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Пайплайн"
          value={data.pipeline}
          delta={data.pipelineNew}
          deltaLabel="за неделю"
          icon={<Users className="w-4 h-4" />}
        />
        <KpiCard
          title="Отправлено"
          value={data.emailsSent}
          delta={data.emailsNew}
          deltaLabel="за неделю"
          icon={<Mail className="w-4 h-4" />}
        />
        <KpiCard
          title="Ответы"
          value={`${data.replyRate}%`}
          subtitle={
            data.replyRate >= 10
              ? "Выше среднего"
              : data.replyRate >= 5
                ? "Средне"
                : "Ниже среднего"
          }
          subtitleColor={
            data.replyRate >= 10
              ? "text-green-400"
              : data.replyRate >= 5
                ? "text-yellow-400"
                : "text-gray-500"
          }
          icon={<MessageSquare className="w-4 h-4" />}
        />
        <KpiCard
          title="Конверсия"
          value={`${data.conversionRate}%`}
          subtitle={`${interestedTotal(data)} заинтересованы`}
          subtitleColor="text-green-400"
          icon={<TrendingUp className="w-4 h-4" />}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Pipeline Quality */}
        <Card className="lg:col-span-2">
          <CardContent>
            <h2 className="text-sm font-semibold text-white mb-4">
              Качество пайплайна
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Priority breakdown */}
              <div>
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider">
                  Температура лидов
                </p>
                <div className="space-y-3">
                  {(["A", "B", "C"] as const).map((p) => {
                    const cfg = priorityStyles[p];
                    const count =
                      p === "A"
                        ? data.priorityA
                        : p === "B"
                          ? data.priorityB
                          : data.priorityC;
                    const pct = Math.round((count / totalPriority) * 100);
                    return (
                      <div key={p} className="flex items-center gap-3">
                        <PriorityBadge priority={p} className="w-14 justify-center" />
                        <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${cfg.bar} rounded-full transition-all`}
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-white w-8 text-right tabular-nums">
                          {count}
                        </span>
                        <span className="text-xs text-gray-500 w-10 tabular-nums">
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Top Markets */}
                {data.topCountries.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-white/5">
                    <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                      <Globe className="w-3 h-3" />
                      Топ рынки
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.topCountries.map((c) => (
                        <span
                          key={c.country}
                          className="text-xs px-2 py-1 rounded bg-white/5 text-gray-300"
                        >
                          {c.country}{" "}
                          <span className="text-gray-500 tabular-nums">
                            {c.count}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Score distribution */}
              <div>
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider">
                  Распределение баллов
                </p>
                {data.scoreDistribution.length === 0 ? (
                  <p className="text-gray-600 text-xs">
                    Нет оцененных компаний
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {data.scoreDistribution.map((s) => (
                      <div key={s.range} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-14 font-mono tabular-nums">
                          {s.range}
                        </span>
                        <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${s.color} rounded-full opacity-80`}
                            style={{
                              width: `${Math.max((s.count / maxScore) * 100, 3)}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium text-white w-8 text-right tabular-nums">
                          {s.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Outreach Funnel */}
        <Card>
          <CardContent>
            <h2 className="text-sm font-semibold text-white mb-4">
              Воронка рассылки
            </h2>
            {data.funnel.sent === 0 ? (
              <EmptyState
                icon={<Mail className="w-8 h-8" />}
                title="Писем пока нет"
                description="Компании с приоритетом A/B будут автоматически контактированы"
              />
            ) : (
              <div className="space-y-2.5">
                <FunnelStep
                  label="Отправлено"
                  count={data.funnel.sent}
                  total={data.funnel.sent}
                  color="bg-blue-500"
                />
                <FunnelStep
                  label="Доставлено"
                  count={data.funnel.delivered}
                  total={data.funnel.sent}
                  color="bg-cyan-500"
                />
                <FunnelStep
                  label="Прочитано"
                  count={data.funnel.opened}
                  total={data.funnel.sent}
                  color="bg-purple-500"
                />
                <FunnelStep
                  label="Ответили"
                  count={data.funnel.replied}
                  total={data.funnel.sent}
                  color="bg-green-500"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hot Leads */}
        <Card>
          <CardHeader
            action={
              <Link
                href="/dashboard/companies"
                className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
              >
                Все <ChevronRight className="w-3 h-3" />
              </Link>
            }
          >
            Горячие лиды
          </CardHeader>
          <CardContent className="pt-3">
            {data.hotLeads.length === 0 ? (
              <EmptyState
                icon={<Zap className="w-8 h-8" />}
                title="Горячих лидов пока нет"
                description="Здесь появятся лиды, которые ответили на рассылку"
              />
            ) : (
              <div className="space-y-1.5">
                {data.hotLeads.map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/dashboard/companies/${lead.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.04] transition-colors group"
                  >
                    <ScoreBadge score={lead.score} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate group-hover:text-primary-400 transition-colors">
                          {lead.name}
                        </span>
                        <PriorityBadge priority={lead.priority} />
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {lead.country}
                        {lead.contacts?.[0] &&
                          ` · ${lead.contacts[0].name}${lead.contacts[0].title ? `, ${lead.contacts[0].title}` : ""}`}
                      </div>
                    </div>
                    <StatusBadge status={lead.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card>
          <CardHeader>Последняя активность</CardHeader>
          <CardContent className="pt-3">
            {data.recentEmails.length === 0 &&
            data.recentJobs.length === 0 ? (
              <EmptyState
                icon={<Clock className="w-8 h-8" />}
                title="Активности пока нет"
                description="Добавьте источники для поиска компаний"
              />
            ) : (
              <div className="space-y-0.5">
                {mergeActivity(data.recentEmails, data.recentJobs)
                  .slice(0, 10)
                  .map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 py-2 border-b border-white/[0.03] last:border-0"
                    >
                      <ActivityIcon type={item.type} status={item.status} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-300">
                          {item.type === "email" ? (
                            <>
                              <span className="text-white font-medium">
                                {item.company}
                              </span>{" "}
                              {item.status === "REPLIED"
                                ? "ответил на рассылку"
                                : item.status === "OPENED"
                                  ? "прочитал письмо"
                                  : "письмо отскочило"}
                            </>
                          ) : (
                            <>
                              Скрейпинг{" "}
                              <span className="text-white font-medium">
                                {item.source}
                              </span>{" "}
                              {item.status === "completed"
                                ? `завершен — ${item.found} найдено, ${item.newCount} новых`
                                : item.status === "running" ? "запущен" : item.status}
                            </>
                          )}
                        </p>
                      </div>
                      <span className="text-[10px] text-gray-600 whitespace-nowrap tabular-nums">
                        {timeAgo(item.time)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// --- Helper components ---

function interestedTotal(data: {
  priorityA: number;
  hotLeads: { id: string }[];
}) {
  return data.priorityA + (data.hotLeads?.length ?? 0);
}

function ActionItem({
  count,
  label,
  href,
  icon,
  urgency,
}: {
  count: number;
  label: string;
  href: string;
  icon: React.ReactNode;
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
      <span className={countColors[urgency]}>{icon}</span>
      <span className={`text-lg font-bold tabular-nums ${countColors[urgency]}`}>
        {count}
      </span>
      <span className="text-xs text-gray-300">{label}</span>
      <ChevronRight className="w-3 h-3 text-gray-600 ml-auto" />
    </Link>
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
          <span className="text-xs font-medium text-white tabular-nums">
            {count}
          </span>
          <span className="text-[10px] text-gray-600 tabular-nums">
            {pct}%
          </span>
        </div>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full opacity-80 transition-all`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

function ActivityIcon({
  type,
  status,
}: {
  type: "email" | "job";
  status: string;
}) {
  if (type === "email") {
    if (status === "REPLIED")
      return <Reply className="w-3.5 h-3.5 text-green-400 shrink-0" />;
    if (status === "OPENED")
      return <Eye className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
    return <MailWarning className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  }
  if (status === "completed")
    return <Zap className="w-3.5 h-3.5 text-green-400 shrink-0" />;
  if (status === "running")
    return <Loader2 className="w-3.5 h-3.5 text-blue-400 shrink-0 animate-spin" />;
  if (status === "failed")
    return <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  return <Clock className="w-3.5 h-3.5 text-gray-500 shrink-0" />;
}

type ActivityItem =
  | {
      time: Date;
      type: "email";
      status: string;
      company: string;
      source?: undefined;
      found?: undefined;
      newCount?: undefined;
    }
  | {
      time: Date;
      type: "job";
      status: string;
      source: string;
      found: number;
      newCount: number;
      company?: undefined;
    };

function mergeActivity(
  emails: { status: string; updatedAt: Date; company: { name: string } }[],
  jobs: {
    sourceType: string;
    sourceName: string | null;
    status: string;
    totalFound: number;
    totalNew: number;
    createdAt: Date;
  }[]
): ActivityItem[] {
  const items: ActivityItem[] = [
    ...emails.map((e) => ({
      time: new Date(e.updatedAt),
      type: "email" as const,
      status: e.status,
      company: e.company.name,
    })),
    ...jobs.map((j) => ({
      time: new Date(j.createdAt),
      type: "job" as const,
      status: j.status,
      source: j.sourceName || j.sourceType,
      found: j.totalFound,
      newCount: j.totalNew,
    })),
  ];
  return items.sort((a, b) => b.time.getTime() - a.time.getTime());
}
