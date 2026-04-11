import { prisma } from "@agency/db";
import Link from "next/link";
import {
  Card,
  CardContent,
  KpiCard,
  EmptyState,
  timeAgo,
} from "@agency/ui";
import {
  Newspaper,
  TrendingUp,
  Building2,
  Globe,
  ExternalLink,
  Sparkles,
  Bell,
  Shield,
  Handshake,
  Users,
  Rocket,
  FileText,
  Calendar,
  Layers,
  AlertTriangle,
  Package,
  Bookmark,
} from "lucide-react";
import { NewsFilters } from "./news-filters";

export const dynamic = "force-dynamic";

const categoryConfig: Record<
  string,
  { label: string; icon: typeof Newspaper; color: string; gradient: string }
> = {
  CONTRACT: { label: "Контракт", icon: Handshake, color: "text-blue-400 bg-blue-500/10", gradient: "from-blue-900/60 to-blue-950/80" },
  EXPANSION: { label: "Расширение", icon: Rocket, color: "text-green-400 bg-green-500/10", gradient: "from-green-900/60 to-green-950/80" },
  REGULATORY: { label: "Регулирование", icon: Shield, color: "text-orange-400 bg-orange-500/10", gradient: "from-orange-900/50 to-orange-950/80" },
  MA_FUNDING: { label: "M&A", icon: Layers, color: "text-purple-400 bg-purple-500/10", gradient: "from-purple-900/60 to-purple-950/80" },
  LEADERSHIP: { label: "Руководство", icon: Users, color: "text-cyan-400 bg-cyan-500/10", gradient: "from-cyan-900/60 to-cyan-950/80" },
  PRODUCT_LAUNCH: { label: "Запуск", icon: Package, color: "text-emerald-400 bg-emerald-500/10", gradient: "from-emerald-900/60 to-emerald-950/80" },
  TENDER: { label: "Тендер", icon: FileText, color: "text-yellow-400 bg-yellow-500/10", gradient: "from-yellow-900/50 to-yellow-950/80" },
  EVENT: { label: "Мероприятие", icon: Calendar, color: "text-indigo-400 bg-indigo-500/10", gradient: "from-indigo-900/60 to-indigo-950/80" },
  GENERAL: { label: "Общее", icon: Newspaper, color: "text-gray-400 bg-gray-500/10", gradient: "from-gray-800/60 to-gray-900/80" },
};

type NewsItemRow = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: Date | null;
  createdAt: Date;
  category: string;
  summary: string | null;
  entities: string[];
  countries: string[];
  sentiment: string | null;
  relevanceScore: number;
  imageUrl: string | null;
  fullContent: string | null;
  translatedTitle: string | null;
  translatedSummary: string | null;
  isBookmarked: boolean;
  company: { id: string; name: string } | null;
  topic: { id: string; name: string } | null;
};

export default async function NewsPage({
  searchParams,
}: {
  searchParams: { category?: string; topic?: string; country?: string; q?: string; period?: string; pcat?: string };
}) {
  let dbError: string | null = null;
  let newsItems: NewsItemRow[] = [];
  let topics: {
    id: string;
    name: string;
    isActive: boolean;
    _count: { newsItems: number };
  }[] = [];
  let alertCount = 0;

  // Build date filter
  const periodFilter = (() => {
    const now = new Date();
    switch (searchParams.period) {
      case "today": {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        return { gte: start };
      }
      case "week": {
        const start = new Date(now);
        start.setDate(start.getDate() - 7);
        return { gte: start };
      }
      case "month": {
        const start = new Date(now);
        start.setMonth(start.getMonth() - 1);
        return { gte: start };
      }
      default:
        return undefined;
    }
  })();

  // ProLife product category → search keywords
  const pcatKeywords: Record<string, string[]> = {
    vitamins: ["vitamin", "supplement", "nutraceutical"],
    medtech: ["medical device", "monitor", "tonometer", "nebulizer", "thermometer", "oximeter", "510(k)", "device recall"],
    dermo: ["dermo-cosmetic", "skincare", "dermatology", "cosmetic"],
    baby: ["baby", "infant", "pediatric", "children", "nutrition"],
    homecare: ["home health", "home care", "home medical", "equipment"],
  };

  // Build base where (shared across main query and sidebar counts)
  const baseWhere: Record<string, unknown> = {};

  // Collect all OR conditions
  const orConditions: Record<string, unknown>[] = [];

  // Free-text search
  if (searchParams.q) {
    const words = searchParams.q.split(/\s+/).filter((w) => w.length >= 3);
    for (const word of words) {
      orConditions.push(
        { title: { contains: word, mode: "insensitive" } },
        { summary: { contains: word, mode: "insensitive" } }
      );
    }
  }

  // ProLife product category
  if (searchParams.pcat && pcatKeywords[searchParams.pcat]) {
    for (const kw of pcatKeywords[searchParams.pcat]) {
      orConditions.push(
        { title: { contains: kw, mode: "insensitive" } },
        { summary: { contains: kw, mode: "insensitive" } },
        { entities: { has: kw } }
      );
    }
  }

  if (orConditions.length > 0) baseWhere.OR = orConditions;
  if (periodFilter) baseWhere.createdAt = periodFilter;

  try {
    // Full where including all filters
    const where: Record<string, unknown> = { ...baseWhere };
    if (searchParams.category) where.category = searchParams.category;
    if (searchParams.topic) where.topicId = searchParams.topic;
    if (searchParams.country) where.countries = { has: searchParams.country };

    // Sidebar counts: count per topic WITH other filters except topic
    const topicCountWhere: Record<string, unknown> = { ...baseWhere };
    if (searchParams.category) topicCountWhere.category = searchParams.category;
    if (searchParams.country) topicCountWhere.countries = { has: searchParams.country };

    [newsItems, topics, alertCount] = await Promise.all([
      prisma.newsItem.findMany({
        where: where as never,
        orderBy: [{ relevanceScore: "desc" }, { publishedAt: "desc" }],
        take: 100,
        select: {
          id: true,
          title: true,
          url: true,
          source: true,
          publishedAt: true,
          createdAt: true,
          category: true,
          summary: true,
          entities: true,
          countries: true,
          sentiment: true,
          relevanceScore: true,
          imageUrl: true,
          fullContent: true,
          translatedTitle: true,
          translatedSummary: true,
          isBookmarked: true,
          company: { select: { id: true, name: true } },
          topic: { select: { id: true, name: true } },
        },
      }),
      // Get topics with counts filtered by active filters (except topic itself)
      prisma.topic.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          isActive: true,
          _count: {
            select: {
              newsItems: {
                where: topicCountWhere as never,
              },
            },
          },
        },
      }),
      prisma.alert.count({ where: { isActive: true } }),
    ]);
  } catch (error: unknown) {
    dbError = error instanceof Error ? error.message : "Unknown error";
    console.error("News DB error:", error);
  }

  // Get all items (unfiltered) for sidebar category counts
  // Uses all filters EXCEPT category to show "how many if I click this category"
  let allForCategoryCounts: { category: string }[] = [];
  try {
    const catCountWhere: Record<string, unknown> = { ...baseWhere };
    if (searchParams.topic) catCountWhere.topicId = searchParams.topic;
    if (searchParams.country) catCountWhere.countries = { has: searchParams.country };
    allForCategoryCounts = await prisma.newsItem.findMany({
      where: catCountWhere as never,
      select: { category: true },
    });
  } catch { /* ignore */ }

  const stats = {
    total: newsItems.length,
    highRelevance: newsItems.filter((n) => n.relevanceScore >= 70).length,
    linkedCompanies: newsItems.filter((n) => n.company !== null).length,
    uniqueCountries: new Set(newsItems.flatMap((n) => n.countries)).size,
  };

  // Collect unique values for filters
  const allCategories = [...new Set(newsItems.map((n) => n.category))].sort();
  const allCountries = [...new Set(newsItems.flatMap((n) => n.countries))].sort();
  const allSources = [...new Set(newsItems.map((n) => n.source))].sort();

  // Category counts for sidebar (uses all items matching OTHER filters, not category)
  const categoryCounts = allForCategoryCounts.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1;
    return acc;
  }, {});

  // Top stories: relevance >= 70, not filtered
  const hasFilters = searchParams.category || searchParams.topic || searchParams.country || searchParams.q || searchParams.period || searchParams.pcat;
  const topStories = hasFilters
    ? []
    : newsItems.filter((n) => n.relevanceScore >= 70).slice(0, 4);
  const topIds = new Set(topStories.map((s) => s.id));

  // Group rest by date
  const restItems = newsItems.filter((n) => !topIds.has(n.id));
  const dateGroups = groupByDate(restItems);

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Аналитика</h1>
          <p className="text-gray-500 text-xs mt-0.5">
            {stats.total} статей из 30+ источников
          </p>
        </div>
        <div className="flex items-center gap-3">
          {alertCount > 0 && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Bell className="w-3 h-3" />
              {alertCount} оповещ.
            </span>
          )}
        </div>
      </div>

      {dbError && (
        <div className="mb-5 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 text-sm font-medium">Ошибка базы данных</p>
          <p className="text-red-300/70 text-xs mt-1">{dbError}</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <KpiCard title="Статьи" value={stats.total} icon={<Newspaper className="w-4 h-4" />} />
        <KpiCard
          title="Важные"
          value={stats.highRelevance}
          icon={<TrendingUp className="w-4 h-4" />}
          subtitle={stats.total > 0 ? `${Math.round((stats.highRelevance / stats.total) * 100)}%` : undefined}
          subtitleColor="text-green-400"
        />
        <KpiCard title="Компании" value={stats.linkedCompanies} icon={<Building2 className="w-4 h-4" />} />
        <KpiCard title="Страны" value={stats.uniqueCountries} icon={<Globe className="w-4 h-4" />} />
      </div>

      {/* Filters bar */}
      <NewsFilters
        categories={allCategories.map((c) => ({
          value: c,
          label: categoryConfig[c]?.label ?? c,
          count: categoryCounts[c] ?? 0,
        }))}
        topics={topics.map((t) => ({
          value: t.id,
          label: t.name,
          count: t._count.newsItems,
        }))}
        countries={allCountries}
        currentCategory={searchParams.category}
        currentTopic={searchParams.topic}
        currentCountry={searchParams.country}
        currentQuery={searchParams.q}
        currentPeriod={searchParams.period}
        currentPcat={searchParams.pcat}
      />

      {/* Main content */}
      <div className="flex flex-col lg:flex-row gap-6 mt-5">
        {/* Sidebar */}
        <div className="w-full lg:w-64 shrink-0 space-y-4 order-2 lg:order-1 lg:sticky lg:top-0 lg:self-start lg:max-h-screen lg:overflow-y-auto">
          {/* Topics */}
          <Card>
            <CardContent className="py-4">
              <h2 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Темы</h2>
              <div className="space-y-0.5">
                {topics.map((topic) => (
                  <Link
                    key={topic.id}
                    href={buildFilterUrl(searchParams, "topic", searchParams.topic === topic.id ? undefined : topic.id)}
                    className={`flex items-center justify-between py-1.5 px-2 rounded transition-colors ${
                      searchParams.topic === topic.id
                        ? "bg-primary-600/10 text-primary-400"
                        : "hover:bg-white/[0.03] text-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${topic.isActive ? "bg-green-500" : "bg-gray-600"}`} />
                      <span className="text-xs truncate">{topic.name}</span>
                    </div>
                    <span className="text-[10px] text-gray-600 tabular-nums shrink-0 ml-2">{topic._count.newsItems}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Categories */}
          {Object.keys(categoryCounts).length > 0 && (
            <Card>
              <CardContent className="py-4">
                <h2 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Категории</h2>
                <div className="space-y-0.5">
                  {Object.entries(categoryCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, count]) => {
                      const cfg = categoryConfig[cat] ?? categoryConfig.GENERAL;
                      const Icon = cfg.icon;
                      const isActive = searchParams.category === cat;
                      return (
                        <Link
                          key={cat}
                          href={buildFilterUrl(searchParams, "category", isActive ? undefined : cat)}
                          className={`flex items-center justify-between py-1.5 px-2 rounded transition-colors ${
                            isActive ? "bg-primary-600/10 text-primary-400" : "hover:bg-white/[0.03]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={`w-3 h-3 ${isActive ? "text-primary-400" : cfg.color.split(" ")[0]}`} />
                            <span className={`text-xs ${isActive ? "text-primary-400" : "text-gray-300"}`}>{cfg.label}</span>
                          </div>
                          <span className="text-[10px] text-gray-600 tabular-nums">{count}</span>
                        </Link>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sources */}
          <Card>
            <CardContent className="py-4">
              <h2 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Источники</h2>
              <div className="space-y-0.5">
                {Object.entries(
                  newsItems.reduce<Record<string, number>>((acc, item) => {
                    acc[item.source] = (acc[item.source] ?? 0) + 1;
                    return acc;
                  }, {})
                )
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([source, count]) => (
                    <div key={source} className="flex items-center justify-between py-1 px-2">
                      <span className="text-xs text-gray-400 truncate">{source}</span>
                      <span className="text-[10px] text-gray-600 tabular-nums">{count}</span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feed */}
        <div className="flex-1 min-w-0 space-y-6 order-1 lg:order-2">
          {newsItems.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Newspaper className="w-10 h-10" />}
                title={hasFilters ? "Ничего не найдено" : "Новостей пока нет"}
                description={hasFilters ? "Попробуйте другие фильтры." : "Запустите POST /api/news/collect для сбора."}
              />
            </Card>
          ) : (
            <>
              {/* Top Stories */}
              {topStories.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-3.5 h-3.5 text-primary-400" />
                    <h2 className="text-sm font-semibold text-white">Важное</h2>
                    <span className="text-[10px] text-gray-600">релевантность 70+</span>
                  </div>
                  <div className="space-y-2">
                    {topStories.map((item) => (
                      <NewsCard key={item.id} item={item} highlight categoryConfig={categoryConfig} />
                    ))}
                  </div>
                </div>
              )}

              {/* Date groups */}
              {dateGroups.map((group) => (
                <div key={group.date}>
                  <div className="sticky top-0 z-10 bg-dark py-2 mb-2">
                    <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                      {group.label}
                      <span className="text-gray-700 ml-2 normal-case">{group.items.length}</span>
                    </h3>
                  </div>
                  <div className="space-y-1.5">
                    {group.items
                      .sort((a, b) => b.relevanceScore - a.relevanceScore)
                      .map((item) => (
                        <NewsCard key={item.id} item={item} categoryConfig={categoryConfig} />
                      ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──

/** Build a filter URL preserving other active params */
function buildFilterUrl(
  current: Record<string, string | undefined>,
  key: string,
  value: string | undefined
): string {
  const params = new URLSearchParams();
  const keys = ["category", "topic", "country", "q", "period", "pcat"];
  for (const k of keys) {
    const v = k === key ? value : current[k];
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return `/dashboard/news${qs ? `?${qs}` : ""}`;
}

function groupByDate(items: NewsItemRow[]) {
  const groups = new Map<string, NewsItemRow[]>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const item of items) {
    const d = item.publishedAt ? new Date(item.publishedAt) : new Date(item.createdAt);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dateKey, items]) => {
      const d = new Date(dateKey);
      let label: string;
      if (d.getTime() === today.getTime()) label = "Сегодня";
      else if (d.getTime() === yesterday.getTime()) label = "Вчера";
      else label = d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
      return { label, date: dateKey, items };
    });
}

// ── News Card ──

function NewsCard({
  item,
  highlight,
  categoryConfig: cfg,
}: {
  item: NewsItemRow;
  highlight?: boolean;
  categoryConfig: typeof categoryConfig;
}) {
  const cat = cfg[item.category] ?? cfg.GENERAL;
  const Icon = cat.icon;
  const isHighRelevance = item.relevanceScore >= 70;
  const hasInternalContent = !!item.fullContent;

  return (
    <div
      className={`group rounded-lg border transition-colors ${
        highlight
          ? "bg-primary-600/5 border-primary-600/15 hover:border-primary-600/25"
          : "bg-dark-secondary border-white/5 hover:border-white/10"
      }`}
    >
      <div className="flex">
        {/* Preview image or category fallback */}
        <Link
          href={`/dashboard/news/${item.id}`}
          className="shrink-0 w-28 h-20 lg:w-40 lg:h-24 overflow-hidden rounded-l-lg relative"
        >
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt=""
              className="w-full h-full object-cover object-center opacity-80 group-hover:opacity-100 transition-opacity"
              loading="lazy"
            />
          ) : (
            <div className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br ${cat.gradient} relative overflow-hidden`}>
              <Icon className={`w-10 h-10 ${cat.color.split(" ")[0]} opacity-15 absolute -bottom-1 -right-1`} />
              <Icon className={`w-5 h-5 ${cat.color.split(" ")[0]} opacity-50 mb-1`} />
              <span className={`text-[9px] font-medium ${cat.color.split(" ")[0]} opacity-40`}>{cat.label}</span>
            </div>
          )}
        </Link>

        <div className="px-4 py-3 min-w-0 flex-1">
          {/* Meta row */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${cat.color}`}>
              <Icon className="w-2.5 h-2.5" />
              {cat.label}
            </span>
            <span className="text-[10px] text-gray-600">{item.source}</span>
            {item.topic && (
              <Link
                href={`/dashboard/news?topic=${item.topic.id}`}
                className="text-[10px] text-gray-600 hover:text-primary-400"
              >
                #{item.topic.name}
              </Link>
            )}
            {item.countries.slice(0, 2).map((country) => (
              <Link
                key={country}
                href={`/dashboard/news?country=${country}`}
                className="text-[10px] text-gray-600 hover:text-primary-400 flex items-center gap-0.5"
              >
                <Globe className="w-2.5 h-2.5" />
                {country}
              </Link>
            ))}
            {item.isBookmarked && (
              <span className="text-[10px] text-primary-400">
                <Bookmark className="w-2.5 h-2.5 fill-current" />
              </span>
            )}
            <span className="ml-auto text-[10px] text-gray-600 tabular-nums">
              {item.publishedAt ? timeAgo(new Date(item.publishedAt)) : ""}
            </span>
            {isHighRelevance && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-medium tabular-nums">
                {item.relevanceScore}
              </span>
            )}
            {item.sentiment === "negative" && (
              <AlertTriangle className="w-3 h-3 text-red-400" />
            )}
          </div>

          {/* Title — links to internal page, prefer Russian */}
          <Link
            href={`/dashboard/news/${item.id}`}
            className="text-sm text-white font-medium leading-snug hover:text-primary-400 transition-colors inline-flex items-start gap-1.5"
          >
            {item.translatedTitle ?? item.title}
            {!hasInternalContent && (
              <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 text-gray-700 group-hover:text-gray-500" />
            )}
          </Link>

          {/* Summary — prefer Russian */}
          {(item.translatedSummary ?? item.summary) && (
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed line-clamp-2">
              {item.translatedSummary ?? item.summary}
            </p>
          )}

          {/* Entities */}
          {(item.company || item.entities.length > 0) && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {item.company && (
                <Link
                  href={`/dashboard/companies/${item.company.id}`}
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 transition-colors"
                >
                  <Building2 className="w-2.5 h-2.5" />
                  {item.company.name}
                </Link>
              )}
              {item.entities
                .filter((e) => e !== item.company?.name)
                .slice(0, 3)
                .map((entity) => (
                  <span key={entity} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500">
                    {entity}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
