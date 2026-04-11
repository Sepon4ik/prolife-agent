import { prisma } from "@agency/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  timeAgo,
} from "@agency/ui";
import {
  ArrowLeft,
  ExternalLink,
  Globe,
  Building2,
  Bookmark,
  Share2,
  Newspaper,
  Handshake,
  Rocket,
  Shield,
  Layers,
  Users,
  Package,
  FileText,
  Calendar,
  Clock,
  Languages,
} from "lucide-react";
import { EngageButton } from "./engage-button";

export const dynamic = "force-dynamic";

const categoryConfig: Record<
  string,
  { label: string; icon: typeof Newspaper; color: string }
> = {
  CONTRACT: { label: "Контракт", icon: Handshake, color: "text-blue-400 bg-blue-500/10" },
  EXPANSION: { label: "Расширение", icon: Rocket, color: "text-green-400 bg-green-500/10" },
  REGULATORY: { label: "Регулирование", icon: Shield, color: "text-orange-400 bg-orange-500/10" },
  MA_FUNDING: { label: "M&A", icon: Layers, color: "text-purple-400 bg-purple-500/10" },
  LEADERSHIP: { label: "Руководство", icon: Users, color: "text-cyan-400 bg-cyan-500/10" },
  PRODUCT_LAUNCH: { label: "Запуск", icon: Package, color: "text-emerald-400 bg-emerald-500/10" },
  TENDER: { label: "Тендер", icon: FileText, color: "text-yellow-400 bg-yellow-500/10" },
  EVENT: { label: "Мероприятие", icon: Calendar, color: "text-indigo-400 bg-indigo-500/10" },
  GENERAL: { label: "Общее", icon: Newspaper, color: "text-gray-400 bg-gray-500/10" },
};

export default async function NewsDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const item = await prisma.newsItem.findUnique({
    where: { id: params.id },
    include: {
      company: { select: { id: true, name: true, country: true } },
      topic: { select: { id: true, name: true } },
    },
  });

  if (!item) notFound();

  const cat = categoryConfig[item.category] ?? categoryConfig.GENERAL;
  const CatIcon = cat.icon;

  // Content to display: prefer translated, fallback to original
  const hasContent = !!(item.fullContent || item.translatedContent);
  const displayContent = item.translatedContent ?? item.fullContent;
  const showingTranslation = !!item.translatedContent;

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      {/* Back link */}
      <Link
        href="/dashboard/news"
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Назад к ленте
      </Link>

      {/* Hero image */}
      {item.imageUrl && (
        <div className="rounded-lg overflow-hidden mb-6 border border-white/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt={item.title}
            className="w-full h-48 lg:h-64 object-cover"
          />
        </div>
      )}

      {/* Meta */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span
          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${cat.color}`}
        >
          <CatIcon className="w-3 h-3" />
          {cat.label}
        </span>

        <span className="text-xs text-gray-500">{item.source}</span>

        {item.topic && (
          <Link
            href={`/dashboard/news?topic=${item.topic.id}`}
            className="text-xs text-gray-500 hover:text-primary-400"
          >
            #{item.topic.name}
          </Link>
        )}

        {item.countries.map((c) => (
          <Link
            key={c}
            href={`/dashboard/news?country=${c}`}
            className="text-xs text-gray-500 hover:text-primary-400 flex items-center gap-0.5"
          >
            <Globe className="w-3 h-3" />
            {c}
          </Link>
        ))}

        {item.relevanceScore >= 70 && (
          <span className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-400 font-medium tabular-nums">
            {item.relevanceScore}
          </span>
        )}
      </div>

      {/* Title — prefer Russian */}
      <h1 className="text-xl lg:text-2xl font-bold text-white leading-snug mb-3">
        {item.translatedTitle ?? item.title}
      </h1>
      {item.translatedTitle && (
        <p className="text-xs text-gray-600 mb-3">{item.title}</p>
      )}

      {/* Time + source link */}
      <div className="flex items-center gap-4 mb-6 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {item.publishedAt
            ? new Date(item.publishedAt).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : timeAgo(new Date(item.createdAt))}
        </span>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-primary-400 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Читать оригинал
        </a>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-6 pb-6 border-b border-white/5">
        <EngageButton
          newsId={item.id}
          action="bookmark"
          isActive={item.isBookmarked}
          icon="bookmark"
          label={item.isBookmarked ? "В закладках" : "Закладка"}
        />
        <EngageButton
          newsId={item.id}
          action="like"
          icon="thumbsup"
          label="Полезно"
        />
        <EngageButton
          newsId={item.id}
          action="dismiss"
          icon="eyeoff"
          label="Не интересно"
        />
      </div>

      {/* Linked company */}
      {item.company && (
        <Link
          href={`/dashboard/companies/${item.company.id}`}
          className="inline-flex items-center gap-2 mb-6 px-3 py-2 rounded-lg bg-primary-500/5 border border-primary-500/10 hover:border-primary-500/20 transition-colors"
        >
          <Building2 className="w-4 h-4 text-primary-400" />
          <div>
            <span className="text-sm text-primary-400 font-medium">{item.company.name}</span>
            {item.company.country && (
              <span className="text-xs text-gray-500 ml-2">{item.company.country}</span>
            )}
          </div>
        </Link>
      )}

      {/* Summary — prefer Russian */}
      {(item.translatedSummary ?? item.summary) && (
        <div className="mb-6 p-4 rounded-lg bg-white/[0.02] border border-white/5">
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">
            AI-резюме
          </h3>
          <p className="text-sm text-gray-300 leading-relaxed">{item.translatedSummary ?? item.summary}</p>
        </div>
      )}

      {/* Full content */}
      {hasContent ? (
        <div className="mb-8">
          {showingTranslation && (
            <div className="flex items-center gap-1.5 mb-3 text-xs text-gray-500">
              <Languages className="w-3.5 h-3.5" />
              Автоматический перевод
            </div>
          )}
          <div className="prose prose-invert prose-sm max-w-none">
            {displayContent!.split("\n\n").map((paragraph, i) => (
              <p
                key={i}
                className="text-sm text-gray-300 leading-relaxed mb-4"
              >
                {paragraph}
              </p>
            ))}
          </div>

          {/* Original text toggle if translated */}
          {item.translatedContent && item.fullContent && (
            <details className="mt-6">
              <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400 transition-colors">
                Показать оригинал (English)
              </summary>
              <div className="mt-3 p-4 rounded-lg bg-white/[0.02] border border-white/5">
                {item.fullContent.split("\n\n").map((paragraph, i) => (
                  <p
                    key={i}
                    className="text-xs text-gray-500 leading-relaxed mb-3"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </details>
          )}
        </div>
      ) : (
        <div className="mb-8 p-6 rounded-lg border border-white/5 bg-white/[0.01] text-center">
          <Newspaper className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-sm text-gray-500 mb-3">
            Контент еще не загружен
          </p>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary-400 hover:text-primary-300 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Читать на сайте источника
          </a>
        </div>
      )}

      {/* Entities */}
      {item.entities.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">
            Упоминания
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {item.entities.map((entity) => (
              <span
                key={entity}
                className="text-xs px-2 py-1 rounded bg-white/5 text-gray-400"
              >
                {entity}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Engagement stats */}
      <div className="mt-8 pt-6 border-t border-white/5 flex items-center gap-4 text-xs text-gray-600">
        <span>Рейтинг: {item.engagementScore}</span>
        <span>Просмотры: {item.clickCount}</span>
        {item.sentiment && <span>Тональность: {item.sentiment === "positive" ? "позитивная" : item.sentiment === "negative" ? "негативная" : "нейтральная"}</span>}
      </div>
    </div>
  );
}
