import { prisma } from "@agency/db";
import { AddCompanyForm } from "./add-company-form";
import Link from "next/link";
import {
  KpiCard,
  Card,
  ScoreBadge,
  StatusBadge,
  PriorityBadge,
  EmptyState,
  timeAgo,
} from "@agency/ui";
import {
  Building2,
  Sparkles,
  Star,
  ThumbsUp,
  Search,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  let companies: {
    id: string;
    name: string;
    website: string | null;
    country: string;
    type: string;
    priority: string;
    score: number;
    status: string;
    geoPriority: string | null;
    updatedAt: Date;
    contacts: { name: string; title: string | null; email: string | null }[];
    _count: { emails: number };
  }[] = [];
  let dbError: string | null = null;

  try {
    companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        website: true,
        country: true,
        type: true,
        priority: true,
        score: true,
        status: true,
        geoPriority: true,
        updatedAt: true,
        contacts: {
          where: { isPrimary: true },
          take: 1,
          select: { name: true, title: true, email: true },
        },
        _count: { select: { emails: true } },
      },
      where: { deletedAt: null },
      orderBy: [{ priority: "asc" }, { score: "desc" }],
      take: 100,
    });
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Пайплайн</h1>
          <p className="text-gray-500 text-xs mt-0.5">
            {stats.total} дистрибьюторов и потенциальных партнеров
          </p>
        </div>
        <AddCompanyForm />
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
          title="Всего"
          value={stats.total}
          icon={<Building2 className="w-4 h-4" />}
        />
        <KpiCard
          title="Обогащено"
          value={stats.enriched}
          icon={<Sparkles className="w-4 h-4" />}
        />
        <KpiCard
          title="Приоритет A"
          value={stats.priorityA}
          icon={<Star className="w-4 h-4" />}
        />
        <KpiCard
          title="Заинтересованы"
          value={stats.interested}
          icon={<ThumbsUp className="w-4 h-4" />}
        />
      </div>

      {/* Table — Layer 1: 5 key columns */}
      {companies.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search className="w-10 h-10" />}
            title="Компаний пока нет"
            description="Запустите скрейпинг из раздела Источники для поиска компаний."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-gray-500 text-left text-xs">
                  <th className="px-5 py-3 font-medium">Компания</th>
                  <th className="px-4 py-3 font-medium w-16 text-center">Балл</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium">Контакт</th>
                  <th className="px-4 py-3 font-medium text-right">Активность</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => {
                  const contact = company.contacts[0];
                  let hostname: string | null = null;
                  try {
                    if (company.website)
                      hostname = new URL(company.website).hostname;
                  } catch {
                    /* skip */
                  }

                  return (
                    <tr
                      key={company.id}
                      className="border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors group"
                    >
                      {/* Company — name, type, country, priority */}
                      <td className="px-5 py-3">
                        <Link
                          href={`/dashboard/companies/${company.id}`}
                          className="block"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-white group-hover:text-primary-400 transition-colors truncate">
                                  {company.name}
                                </span>
                                <PriorityBadge priority={company.priority} />
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                                <span>{company.type.replace(/_/g, " ")}</span>
                                <span className="text-gray-700">·</span>
                                <span>{company.country}</span>
                                {hostname && (
                                  <>
                                    <span className="text-gray-700">·</span>
                                    <span className="text-gray-600 truncate max-w-[120px]">
                                      {hostname}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </Link>
                      </td>

                      {/* Score */}
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <ScoreBadge score={company.score} size="sm" />
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={company.status} />
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3">
                        {contact ? (
                          <div className="text-xs">
                            <div className="text-gray-300">{contact.name}</div>
                            {contact.title && (
                              <div className="text-gray-600 truncate max-w-[160px]">
                                {contact.title}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-600">
                            Нет контакта
                          </span>
                        )}
                      </td>

                      {/* Activity — emails + recency */}
                      <td className="px-4 py-3 text-right">
                        <div className="text-xs">
                          {company._count.emails > 0 && (
                            <div className="text-gray-400 tabular-nums">
                              {company._count.emails} email
                              {company._count.emails !== 1 ? "s" : ""}
                            </div>
                          )}
                          <div className="text-gray-600 tabular-nums">
                            {timeAgo(new Date(company.updatedAt))}
                          </div>
                        </div>
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
