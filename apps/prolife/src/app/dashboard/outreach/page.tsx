import { prisma } from "@agency/db";
import {
  KpiCard,
  Card,
  StatusBadge,
  EmptyState,
  timeAgo,
} from "@agency/ui";
import {
  Mail,
  Send,
  Eye,
  MessageSquare,
  BarChart3,
  Percent,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  let emails: {
    id: string;
    type: string;
    subject: string | null;
    status: string;
    sentAt: Date | null;
    openedAt: Date | null;
    repliedAt: Date | null;
    company: { name: string; country: string; priority: string };
    contact: { name: string; email: string | null } | null;
  }[] = [];
  let dbError: string | null = null;

  try {
    emails = await prisma.email.findMany({
      select: {
        id: true,
        type: true,
        subject: true,
        status: true,
        sentAt: true,
        openedAt: true,
        repliedAt: true,
        company: { select: { name: true, country: true, priority: true } },
        contact: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  } catch (error: unknown) {
    dbError = error instanceof Error ? error.message : "Unknown error";
    console.error("Outreach DB error:", error);
  }

  const stats = {
    total: emails.length,
    sent: emails.filter(
      (e) => e.status !== "QUEUED" && e.status !== "FAILED"
    ).length,
    opened: emails.filter((e) =>
      ["OPENED", "CLICKED", "REPLIED"].includes(e.status)
    ).length,
    replied: emails.filter((e) => e.status === "REPLIED").length,
  };

  const openRate =
    stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100) : 0;
  const replyRate =
    stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0;

  const outreachTypeLabels: Record<string, string> = {
    INITIAL: "Initial",
    FOLLOW_UP_1: "Follow-up 1",
    FOLLOW_UP_2: "Follow-up 2",
    FOLLOW_UP_3: "Follow-up 3",
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Рассылка</h1>
        <p className="text-gray-500 text-xs mt-0.5">
          Кампании и отслеживание фоллоу-апов
        </p>
      </div>

      {dbError && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 text-sm font-medium">Ошибка базы данных</p>
          <p className="text-red-300/70 text-xs mt-1">{dbError}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <KpiCard
          title="Всего"
          value={stats.total}
          icon={<Mail className="w-4 h-4" />}
        />
        <KpiCard
          title="Отправлено"
          value={stats.sent}
          icon={<Send className="w-4 h-4" />}
        />
        <KpiCard
          title="Прочитано"
          value={stats.opened}
          icon={<Eye className="w-4 h-4" />}
        />
        <KpiCard
          title="Ответили"
          value={stats.replied}
          icon={<MessageSquare className="w-4 h-4" />}
        />
        <KpiCard
          title="Открываемость"
          value={`${openRate}%`}
          icon={<BarChart3 className="w-4 h-4" />}
          subtitleColor={openRate >= 30 ? "text-green-400" : "text-gray-500"}
          subtitle={openRate >= 30 ? "Хорошо" : openRate >= 15 ? "Средне" : "Низко"}
        />
        <KpiCard
          title="Ответы"
          value={`${replyRate}%`}
          icon={<Percent className="w-4 h-4" />}
          subtitleColor={replyRate >= 10 ? "text-green-400" : "text-gray-500"}
          subtitle={replyRate >= 10 ? "Выше среднего" : replyRate >= 5 ? "Средне" : "Ниже среднего"}
        />
      </div>

      {/* Funnel */}
      {stats.total > 0 && (
        <Card className="mb-6">
          <div className="p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Воронка рассылки</h2>
            <div className="flex items-end gap-4 h-28">
              <FunnelBar
                label="Отправлено"
                count={stats.sent}
                total={stats.total}
                color="bg-blue-500"
              />
              <FunnelBar
                label="Прочитано"
                count={stats.opened}
                total={stats.total}
                color="bg-purple-500"
              />
              <FunnelBar
                label="Ответили"
                count={stats.replied}
                total={stats.total}
                color="bg-green-500"
              />
            </div>
          </div>
        </Card>
      )}

      {/* Table */}
      {emails.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Mail className="w-10 h-10" />}
            title="Писем пока нет"
            description="Письма будут отправлены автоматически компаниям с приоритетом A или B."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-gray-500 text-left text-xs">
                  <th className="px-5 py-3 font-medium">Компания</th>
                  <th className="px-4 py-3 font-medium">Тип</th>
                  <th className="px-4 py-3 font-medium">Тема</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium text-right">Хронология</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((email) => (
                  <tr
                    key={email.id}
                    className="border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="text-sm font-medium text-white">
                        {email.company.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {email.contact
                          ? `${email.contact.name} · ${email.contact.email}`
                          : email.company.country}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-400">
                        {outreachTypeLabels[email.type] ?? email.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs max-w-[250px] truncate">
                      {email.subject}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={email.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-[10px] text-gray-500 space-y-0.5 tabular-nums">
                        {email.sentAt && (
                          <div>Отправлено {timeAgo(new Date(email.sentAt))}</div>
                        )}
                        {email.openedAt && (
                          <div className="text-purple-400">
                            Прочитано {timeAgo(new Date(email.openedAt))}
                          </div>
                        )}
                        {email.repliedAt && (
                          <div className="text-green-400">
                            Ответ {timeAgo(new Date(email.repliedAt))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
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
    <div className="flex-1 flex flex-col items-center gap-1.5">
      <span className="text-xs font-medium text-white tabular-nums">{count}</span>
      <div
        className={`w-full ${color} rounded-t opacity-80`}
        style={{ height: `${pct}%`, minHeight: "4px" }}
      />
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}
