import { prisma } from "@agency/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  ScoreBadge,
  StatusBadge,
  PriorityBadge,
  timeAgo,
  formatDateTime,
} from "@agency/ui";
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  Calendar,
  Globe,
  Building2,
  Package,
  Users,
  ShoppingCart,
  Megaphone,
  Stethoscope,
  Sparkles,
  ChevronDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Reply,
  Clock,
  Phone,
  Linkedin,
} from "lucide-react";

export const dynamic = "force-dynamic";

// Scoring factors
function calculateScoreBreakdown(company: Record<string, unknown>) {
  const GEO_PRIORITY: Record<string, number> = {
    Indonesia: 20, Pakistan: 20, Bangladesh: 20, Philippines: 20,
    Vietnam: 20, "United Arab Emirates": 20, UAE: 20,
    Thailand: 15, Turkey: 15, "South Korea": 15, Malaysia: 15,
    Singapore: 10, "Sri Lanka": 10, Nepal: 10, Romania: 10,
    "Czech Republic": 10, Hungary: 10, Austria: 10, Netherlands: 10,
    Nigeria: 10, Kenya: 10, "South Africa": 10,
  };

  const country = company.country as string || "";
  const type = company.type as string || "";
  const estimatedRevenue = company.estimatedRevenue as string | null;
  const pharmacyCount = company.pharmacyCount as number | null;
  const portfolioBrands = company.portfolioBrands as string[] || [];

  return [
    { label: "География", max: 20, value: GEO_PRIORITY[country] ?? 0, detail: country || "Неизвестно" },
    { label: "Тип компании", max: 15, value: type === "DISTRIBUTOR" ? 15 : type === "HYBRID" ? 12 : type === "PHARMACY_CHAIN" ? 10 : type === "RETAIL" ? 5 : 0, detail: type },
    { label: "Выручка", max: 15, value: estimatedRevenue === "10m_plus" ? 15 : estimatedRevenue === "2m_10m" ? 10 : estimatedRevenue === "under_2m" ? 3 : 0, detail: estimatedRevenue ?? "Неизвестно" },
    { label: "E-commerce", max: 5, value: company.hasEcommerce ? 5 : 0, detail: company.hasEcommerce ? "Да" : "Нет" },
    { label: "Отдел продаж", max: 10, value: company.hasSalesTeam ? 10 : 0, detail: company.hasSalesTeam ? "Да" : "Нет" },
    { label: "Мед. представители", max: 10, value: company.hasMedReps ? 10 : 0, detail: company.hasMedReps ? "Да" : "Нет" },
    { label: "Маркетинг", max: 5, value: company.hasMarketingTeam ? 5 : 0, detail: company.hasMarketingTeam ? "Да" : "Нет" },
    { label: "Аптеки", max: 10, value: (pharmacyCount ?? 0) >= 300 ? 10 : (pharmacyCount ?? 0) >= 100 ? 5 : 0, detail: pharmacyCount ? `${pharmacyCount} точек` : "Неизвестно" },
    { label: "Ищет бренды", max: 5, value: company.activelySeekingBrands ? 5 : 0, detail: company.activelySeekingBrands ? "Да" : "Нет" },
    { label: "Портфель", max: 5, value: portfolioBrands.length >= 10 ? 5 : portfolioBrands.length >= 5 ? 3 : 0, detail: `${portfolioBrands.length} брендов` },
  ];
}

function generateAISummary(company: Record<string, unknown>): string {
  const strengths: string[] = [];
  const type = company.type as string;
  const country = company.country as string;
  const pharmacyCount = company.pharmacyCount as number | null;
  const portfolioBrands = company.portfolioBrands as string[];
  const categories = company.categories as string[];
  const estimatedRevenue = company.estimatedRevenue as string | null;

  if (type === "DISTRIBUTOR") strengths.push("развитая дистрибьюторская сеть");
  if (type === "PHARMACY_CHAIN") strengths.push("прямой доступ к аптекам");
  if (company.hasEcommerce) strengths.push("наличие e-commerce");
  if (company.hasSalesTeam) strengths.push("выделенный отдел продаж");
  if (company.hasMedReps) strengths.push("медицинские представители");
  if (company.activelySeekingBrands) strengths.push("активно ищет новых бренд-партнеров");
  if (pharmacyCount && pharmacyCount >= 100) strengths.push(`${pharmacyCount} аптечных точек`);
  if (portfolioBrands.length >= 5) strengths.push(`широкий портфель (${portfolioBrands.length} брендов)`);

  const prolifeCategories = ["vitamins", "supplements", "dermo-cosmetics", "baby", "children", "medical devices", "home medical"];
  const overlap = categories.filter((c: string) =>
    prolifeCategories.some(pc => c.toLowerCase().includes(pc))
  );
  if (overlap.length > 0) strengths.push(`работает с категориями ProLife (${overlap.join(", ")})`);

  let summary = `${company.name} — ${type.toLowerCase().replace("_", " ")} на рынке ${country || "неопределенном рынке"}`;

  if (strengths.length > 0) {
    summary += `. Преимущества: ${strengths.slice(0, 3).join(", ")}`;
    if (strengths.length > 3) summary += `, и ещё ${strengths.length - 3} преимуществ`;
    summary += ".";
  } else {
    summary += ".";
  }

  if (overlap.length > 0) {
    summary += ` Их продуктовый фокус совпадает с портфелем ProLife.`;
  }

  const concerns: string[] = [];
  if (!company.hasEcommerce) concerns.push("нет e-commerce канала");
  if (!company.hasSalesTeam) concerns.push("выделенный отдел продаж не обнаружен");
  if (estimatedRevenue === "unknown") concerns.push("данные о выручке недоступны");
  if (portfolioBrands.length === 0) concerns.push("портфель брендов неизвестен");

  if (concerns.length > 0 && concerns.length <= 2) {
    summary += ` Примечание: ${concerns.join(", ")}.`;
  }

  return summary;
}

function getNextActions(
  company: Record<string, unknown>,
  emailCount: number,
  hasContacts: boolean
): { action: string; urgency: "high" | "medium" | "low"; icon: React.ReactNode }[] {
  const actions: { action: string; urgency: "high" | "medium" | "low"; icon: React.ReactNode }[] = [];
  const status = company.status as string;

  if (!hasContacts) {
    actions.push({ action: "Найти контакты ЛПР", urgency: "high", icon: <Users className="w-3.5 h-3.5" /> });
  } else if (emailCount === 0 && status === "SCORED") {
    actions.push({ action: "Отправить первое письмо", urgency: "high", icon: <Mail className="w-3.5 h-3.5" /> });
  }

  if (status === "REPLIED") {
    actions.push({ action: "Проверить ответ и классифицировать", urgency: "high", icon: <Reply className="w-3.5 h-3.5" /> });
  }

  if (status === "INTERESTED") {
    actions.push({ action: "Запланировать звонок с отделом продаж", urgency: "high", icon: <Calendar className="w-3.5 h-3.5" /> });
  }

  if (status === "OUTREACH_SENT") {
    actions.push({ action: "Ждать ответа или отправить фоллоу-ап", urgency: "medium", icon: <Clock className="w-3.5 h-3.5" /> });
  }

  if (actions.length === 0) {
    actions.push({ action: "Изучить сайт компании", urgency: "low", icon: <Globe className="w-3.5 h-3.5" /> });
  }

  return actions.slice(0, 3);
}

export default async function CompanyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const company = await prisma.company.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { contacts: true } },
      contacts: {
        orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          title: true,
          email: true,
          phone: true,
          linkedin: true,
          photoUrl: true,
          bio: true,
          languages: true,
          isPrimary: true,
          linkedinHeadline: true,
          linkedinSeniority: true,
          linkedinDepartment: true,
        },
      },
      emails: {
        orderBy: { createdAt: "desc" },
        include: {
          contact: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!company) return notFound();

  const scoreBreakdown = calculateScoreBreakdown(company as unknown as Record<string, unknown>);
  const aiSummary = generateAISummary(company as unknown as Record<string, unknown>);
  const hasContacts = company._count.contacts > 0;
  const nextActions = getNextActions(
    company as unknown as Record<string, unknown>,
    company.emails.length,
    hasContacts
  );

  let hostname: string | null = null;
  try {
    if (company.website) hostname = new URL(company.website).hostname;
  } catch {
    /* skip */
  }

  const capabilities = [
    { label: "E-commerce", active: company.hasEcommerce, icon: <ShoppingCart className="w-3.5 h-3.5" /> },
    { label: "Отдел продаж", active: company.hasSalesTeam, icon: <Users className="w-3.5 h-3.5" /> },
    { label: "Маркетинг", active: company.hasMarketingTeam, icon: <Megaphone className="w-3.5 h-3.5" /> },
    { label: "Мед. представители", active: company.hasMedReps, icon: <Stethoscope className="w-3.5 h-3.5" /> },
    { label: "Ищет бренды", active: company.activelySeekingBrands, icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-[1200px]">
      {/* Back */}
      <Link
        href="/dashboard/companies"
        className="text-xs text-gray-500 hover:text-gray-300 mb-4 inline-flex items-center gap-1"
      >
        <ArrowLeft className="w-3 h-3" />
        Пайплайн
      </Link>

      {/* === LAYER 2: Hero === */}
      <Card className="mb-6">
        <CardContent>
          {/* Identity row */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-white">{company.name}</h1>
                <PriorityBadge priority={company.priority} />
                <StatusBadge status={company.status} />
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1.5">
                <span>{company.type.replace(/_/g, " ")}</span>
                {company.country && (
                  <>
                    <span className="text-gray-700">·</span>
                    <span>{company.country}{company.city ? `, ${company.city}` : ""}</span>
                  </>
                )}
                {hostname && (
                  <>
                    <span className="text-gray-700">·</span>
                    <a
                      href={company.website!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-400 hover:text-primary-300 inline-flex items-center gap-1"
                    >
                      {hostname}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </>
                )}
              </div>
            </div>
            <ScoreBadge score={company.score} size="lg" />
          </div>

          {/* Status grid — 4 key metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <MiniMetric label="Приоритет" value={company.priority === "A" ? "Горячий" : company.priority === "B" ? "Теплый" : "Холодный"} />
            <MiniMetric label="Писем отправлено" value={String(company.emails.length)} />
            <MiniMetric label="Контакты" value={String(company._count.contacts)} />
            <MiniMetric label="Обновлено" value={timeAgo(new Date(company.updatedAt))} />
          </div>

          {/* AI Summary — "Why this matters" */}
          <div className="mt-5 p-3 rounded-lg bg-primary-600/5 border border-primary-600/10">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-3 h-3 text-primary-400" />
              <span className="text-[10px] text-primary-400 uppercase tracking-wider font-medium">
                AI Анализ
              </span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{aiSummary}</p>
          </div>

          {/* Recommended Actions */}
          {nextActions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {nextActions.map((action, i) => {
                const colors = {
                  high: "border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/10",
                  medium: "border-yellow-500/20 bg-yellow-500/5 text-yellow-400 hover:bg-yellow-500/10",
                  low: "border-gray-500/20 bg-gray-500/5 text-gray-400 hover:bg-gray-500/10",
                };
                return (
                  <button
                    key={i}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${colors[action.urgency]}`}
                  >
                    {action.icon}
                    {action.action}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* === LAYER 3: Content sections === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — company intel */}
        <div className="space-y-5">
          {/* Portfolio Brands — most important for sales */}
          {company.portfolioBrands.length > 0 && (
            <Card>
              <CardContent>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white">
                    Портфель брендов
                  </h2>
                  <span className="text-[10px] text-gray-500">
                    {company.portfolioBrands.length} брендов
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {company.portfolioBrands.map((brand) => {
                    const brandInfo = (company.portfolioBrandInfo as Record<string, string> | null)?.[brand];
                    return (
                      <span
                        key={brand}
                        className="text-xs px-2 py-1 rounded-md bg-primary-500/10 text-primary-400 relative group cursor-help"
                      >
                        {brand}
                        {brandInfo && (
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-dark text-gray-200 text-[11px] leading-relaxed border border-white/10 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 max-w-[250px]">
                            {brandInfo}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
                {/* Categories */}
                {company.categories.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <span className="text-gray-500 text-[10px] uppercase tracking-wider">Категории</span>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {company.categories.map((cat) => (
                        <span
                          key={cat}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Score Breakdown */}
          <Card>
            <CardContent>
              <h2 className="text-sm font-semibold text-white mb-3">Разбивка баллов</h2>
              <div className="space-y-2">
                {scoreBreakdown.map((factor) => (
                  <div key={factor.label}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-400">{factor.label}</span>
                      <span className="text-gray-500 tabular-nums">
                        {factor.value}/{factor.max}
                        <span className="text-gray-600 ml-1">· {factor.detail}</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          factor.value === factor.max
                            ? "bg-green-500"
                            : factor.value > 0
                              ? "bg-yellow-500"
                              : "bg-gray-700"
                        }`}
                        style={{ width: `${(factor.value / factor.max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-white/5 flex justify-between">
                <span className="text-xs text-gray-400">Итого</span>
                <span className="text-sm font-bold text-white tabular-nums">
                  {company.score}/100
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Capabilities */}
          <Card>
            <CardContent>
              <h2 className="text-sm font-semibold text-white mb-3">Возможности</h2>
              <div className="space-y-1.5">
                {capabilities.map((cap) => (
                  <div
                    key={cap.label}
                    className="flex items-center gap-2.5 py-1"
                  >
                    <span className={cap.active ? "text-green-400" : "text-gray-600"}>
                      {cap.icon}
                    </span>
                    <span className={`text-xs ${cap.active ? "text-gray-300" : "text-gray-600"}`}>
                      {cap.label}
                    </span>
                    <span className="ml-auto">
                      {cap.active ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-gray-700" />
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Company Profile */}
          <Card>
            <CardContent>
              <h2 className="text-sm font-semibold text-white mb-3">Детали</h2>
              <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-xs">
                <dt className="text-gray-500">Тип</dt>
                <dd className="text-gray-300">{company.type.replace(/_/g, " ")}</dd>
                <dt className="text-gray-500">Выручка</dt>
                <dd className="text-gray-300">{company.estimatedRevenue ?? "Неизвестно"}</dd>
                <dt className="text-gray-500">Источник</dt>
                <dd className="text-gray-300">
                  {company.source}
                  {company.sourceExhibition ? ` · ${company.sourceExhibition}` : ""}
                </dd>
                <dt className="text-gray-500">Гео-приоритет</dt>
                <dd className="text-gray-300">{company.geoPriority ?? "Не задано"}</dd>
                {company.pharmacyCount && (
                  <>
                    <dt className="text-gray-500">Аптеки</dt>
                    <dd className="text-gray-300 tabular-nums">{company.pharmacyCount.toLocaleString()}</dd>
                  </>
                )}
              </div>

            </CardContent>
          </Card>
        </div>

        {/* Right — contacts + emails (2 cols) */}
        <div className="lg:col-span-2 space-y-5">
          {/* Contacts */}
          <Card>
            <CardContent>
              <h2 className="text-sm font-semibold text-white mb-3">
                Контакты ({company.contacts.length})
              </h2>
              {company.contacts.length === 0 ? (
                <div className="py-6 text-center">
                  <Users className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-600 text-xs">Контактов пока нет</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {company.contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="p-3 rounded-lg bg-white/[0.02] border border-white/5"
                    >
                      <div className="flex items-start gap-3">
                        {contact.photoUrl ? (
                          <img
                            src={contact.photoUrl}
                            alt={contact.name}
                            className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-dark-tertiary flex items-center justify-center shrink-0 border border-white/10">
                            <span className="text-[10px] text-gray-500 font-medium">
                              {contact.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white truncate">{contact.name}</span>
                            {contact.isPrimary && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-primary-500/20 text-primary-400 shrink-0">PRIMARY</span>
                            )}
                          </div>
                          {contact.title && (
                            <div className="text-xs text-gray-500 mt-0.5 truncate">{contact.title}</div>
                          )}
                          {contact.email && (
                            <div className="text-xs text-gray-400 mt-1">{contact.email}</div>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            {contact.email && (
                              <a href={`mailto:${contact.email}`} className="text-gray-500 hover:text-primary-400 transition-colors" title={contact.email}>
                                <Mail className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {contact.phone && (
                              <a href={`tel:${contact.phone}`} className="text-gray-500 hover:text-primary-400 transition-colors" title={contact.phone}>
                                <Phone className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {contact.linkedin && (
                              <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-blue-400 transition-colors">
                                <Linkedin className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Email History — Activity timeline */}
          <Card>
            <CardContent>
              <h2 className="text-sm font-semibold text-white mb-4">
                Коммуникации ({company.emails.length})
              </h2>
              {company.emails.length === 0 ? (
                <div className="py-10 text-center">
                  <Mail className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Писем пока нет</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {company.status === "SCORED"
                      ? "Компания оценена и готова к рассылке"
                      : "Сначала завершите обогащение и оценку"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {company.emails.map((email) => (
                    <details
                      key={email.id}
                      className="group border border-white/5 rounded-lg overflow-hidden"
                    >
                      <summary className="bg-white/[0.02] px-4 py-3 cursor-pointer hover:bg-white/[0.04] transition-colors list-none">
                        <div className="flex items-center gap-2.5">
                          <EmailIcon status={email.status} />
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-[10px] font-medium text-gray-500 shrink-0 uppercase">
                              {email.type.replace(/_/g, " ")}
                            </span>
                            <StatusBadge status={email.status} />
                            <span className="text-sm text-white truncate">
                              {email.subject}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-[10px] text-gray-600 tabular-nums">
                              {email.sentAt
                                ? timeAgo(new Date(email.sentAt))
                                : ""}
                            </span>
                            <ChevronDown className="w-3 h-3 text-gray-600 group-open:rotate-180 transition-transform" />
                          </div>
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5 ml-6">
                          Кому: {email.contact?.name ?? "Неизвестно"} &lt;
                          {email.contact?.email ?? "N/A"}&gt;
                        </div>
                      </summary>

                      <div className="px-4 py-3 border-t border-white/5">
                        <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                          {email.body}
                        </pre>
                      </div>

                      {email.replyBody && (
                        <div className="border-t border-white/5 bg-green-500/5 px-4 py-3">
                          <div className="text-xs text-green-400 font-medium mb-1 flex items-center gap-1.5">
                            <Reply className="w-3 h-3" />
                            Ответ
                            {email.repliedAt &&
                              ` · ${formatDateTime(new Date(email.repliedAt))}`}
                          </div>
                          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">
                            {email.replyBody}
                          </pre>
                        </div>
                      )}

                      <div className="px-4 py-2 bg-white/[0.01] flex gap-4 text-[10px] text-gray-600 border-t border-white/5 tabular-nums">
                        {email.sentAt && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-2.5 h-2.5" />
                            {formatDateTime(new Date(email.sentAt))}
                          </span>
                        )}
                        {email.openedAt && (
                          <span className="flex items-center gap-1 text-purple-400">
                            <Eye className="w-2.5 h-2.5" />
                            {formatDateTime(new Date(email.openedAt))}
                          </span>
                        )}
                        {email.repliedAt && (
                          <span className="flex items-center gap-1 text-green-400">
                            <Reply className="w-2.5 h-2.5" />
                            {formatDateTime(new Date(email.repliedAt))}
                          </span>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Description */}
          {company.description && (
            <Card>
              <CardContent>
                <h2 className="text-sm font-semibold text-white mb-2">Описание</h2>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {company.description}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Helper components ---

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-white/[0.03]">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
    </div>
  );
}

function EmailIcon({ status }: { status: string }) {
  if (status === "REPLIED")
    return <Reply className="w-4 h-4 text-green-400 shrink-0" />;
  if (status === "OPENED" || status === "CLICKED")
    return <Eye className="w-4 h-4 text-purple-400 shrink-0" />;
  if (status === "BOUNCED")
    return <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />;
  return <Mail className="w-4 h-4 text-gray-500 shrink-0" />;
}
