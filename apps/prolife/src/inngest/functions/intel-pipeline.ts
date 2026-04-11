import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";
import {
  aggregateNews,
  summarizeNewsItems,
  matchEntitiesToCompanies,
  topicToQueries,
  checkAlerts,
  sendAlertNotifications,
  extractArticleContent,
  translateToRussian,
} from "@agency/intel";

/**
 * Intel Pipeline — runs every 4 hours.
 * Self-improving: tracks stats per run, uses engagement data for scoring.
 *
 * Sources: 28 RSS feeds + OpenFDA + ClinicalTrials.gov + EMA + Google News + GNews API
 *
 * For each active topic:
 * 1. Aggregate news from all sources
 * 2. AI-summarize and classify (Haiku)
 * 3. Match entities to pipeline companies
 * 4. Topic matching by keyword overlap
 * 5. Save + deduplicate
 * 6. Check alerts and notify
 * 7. Log run stats for self-monitoring
 */
export const intelPipeline = inngest.createFunction(
  {
    id: "prolife-intel-pipeline",
    retries: 2,
    concurrency: [{ limit: 1 }], // prevent overlapping runs
  },
  { cron: "0 */4 * * *" }, // Every 4 hours
  async ({ step }) => {
    const startedAt = Date.now();

    // Step 1: Get all active topics
    const topics = await step.run("get-topics", async () => {
      return prisma.topic.findMany({
        where: { isActive: true },
        select: {
          id: true,
          tenantId: true,
          name: true,
          keywords: true,
          countries: true,
        },
      });
    });

    if (topics.length === 0) {
      return { skipped: true, reason: "No active topics" };
    }

    // Step 2: Build all queries from all topics
    const allQueries: string[] = [];
    const topicLookup = new Map<string, typeof topics>();

    for (const topic of topics) {
      const queries = topicToQueries(topic);
      for (const q of queries) {
        allQueries.push(q);
      }
      // Group topics by tenantId
      const key = topic.tenantId;
      if (!topicLookup.has(key)) topicLookup.set(key, []);
      topicLookup.get(key)!.push(topic);
    }

    const uniqueQueries = [...new Set(allQueries)].slice(0, 30);

    // Step 3: Aggregate from ALL sources (RSS + FDA + ClinicalTrials + EMA)
    const aggregateResult = await step.run("aggregate-all", async () => {
      return aggregateNews(uniqueQueries, {
        includeRSS: true,
        includeFDA: true,
        includeClinicalTrials: true,
        includeEMA: true,
        maxPerSource: 8,
      });
    });

    const rawNews = aggregateResult.items;

    // Step 3b: Save feed health logs
    if (aggregateResult.feedHealth.length > 0) {
      await step.run("save-feed-health", async () => {
        await prisma.feedHealthLog.createMany({
          data: aggregateResult.feedHealth.map((h) => ({
            feedUrl: h.feedUrl,
            feedName: h.feedName,
            status: h.status,
            itemCount: h.itemCount,
            errorMessage: h.errorMessage ?? null,
            responseTimeMs: h.responseTimeMs,
          })),
        });
      });
    }

    if (rawNews.length === 0) {
      return { skipped: true, reason: "No news found", queriesUsed: uniqueQueries.length };
    }

    // Step 4: AI summarize + classify
    const processed = await step.run("summarize", async () => {
      return summarizeNewsItems(rawNews);
    });

    // Step 5: Process per tenant
    let totalSaved = 0;
    let totalAlerts = 0;

    for (const [tenantId, tenantTopics] of topicLookup) {
      // Match entities to companies
      const matched = await step.run(`match-${tenantId}`, async () => {
        return matchEntitiesToCompanies(tenantId, processed);
      });

      // Match to topics by keyword overlap
      const withTopics = matched.map((item) => {
        let bestTopicId: string | null = null;
        let bestScore = 0;
        const text = `${item.title} ${item.summary ?? ""} ${item.entities.join(" ")}`.toLowerCase();

        for (const topic of tenantTopics) {
          let score = 0;
          for (const keyword of topic.keywords) {
            const words = keyword.toLowerCase().split(/\s+/);
            if (words.every((w) => text.includes(w))) score += words.length;
          }
          for (const country of topic.countries) {
            if (text.includes(country.toLowerCase())) score += 2;
          }
          if (score > bestScore) {
            bestScore = score;
            bestTopicId = topic.id;
          }
        }

        return { ...item, topicId: bestScore >= 2 ? bestTopicId : null };
      });

      // Save to DB (upsert)
      const saved = await step.run(`save-${tenantId}`, async () => {
        let count = 0;
        for (const item of withTopics) {
          try {
            await prisma.newsItem.upsert({
              where: { url: item.url },
              create: {
                tenantId,
                topicId: item.topicId,
                url: item.url,
                title: item.title,
                source: item.source,
                publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
                category: item.category as never,
                summary: item.summary,
                entities: item.entities,
                countries: item.countries,
                sentiment: item.sentiment,
                relevanceScore: item.relevanceScore,
                companyId: item.companyId,
              },
              update: {
                summary: item.summary,
                category: item.category as never,
                entities: item.entities,
                countries: item.countries,
                sentiment: item.sentiment,
                relevanceScore: item.relevanceScore,
                companyId: item.companyId,
                topicId: item.topicId,
              },
            });
            count++;
          } catch {
            // skip errors
          }
        }
        return count;
      });

      totalSaved += saved;

      // Re-score companies that got high-intent news
      const intentCategories = new Set(["CONTRACT", "EXPANSION", "MA_FUNDING", "PRODUCT_LAUNCH", "TENDER"]);
      const companiesToRescore = [
        ...new Set(
          withTopics
            .filter((item) => item.companyId && item.relevanceScore >= 60 && intentCategories.has(item.category))
            .map((item) => item.companyId!)
        ),
      ];
      if (companiesToRescore.length > 0) {
        await step.run(`rescore-${tenantId}`, async () => {
          for (const cid of companiesToRescore) {
            await inngest.send({
              name: "prolife/score.calculate",
              data: { tenantId, companyId: cid },
            });
          }
          return companiesToRescore.length;
        });
      }

      // Check alerts
      const alertCount = await step.run(`alerts-${tenantId}`, async () => {
        const matches = await checkAlerts(tenantId, matched);
        if (matches.length > 0) {
          await sendAlertNotifications(matches);
        }
        return matches.length;
      });

      totalAlerts += alertCount;
    }

    // Step 6: Extract full content for top-relevance items without content
    const contentExtracted = await step.run("extract-content", async () => {
      const itemsToExtract = await prisma.newsItem.findMany({
        where: {
          fullContent: null,
          relevanceScore: { gte: 50 },
          url: { not: { contains: "news.google.com" } },
        },
        orderBy: { relevanceScore: "desc" },
        take: 15,
        select: { id: true, url: true, title: true, summary: true },
      });

      let count = 0;
      for (const item of itemsToExtract) {
        try {
          const content = await extractArticleContent(item.url);
          if (!content) continue;

          const updateData: Record<string, unknown> = {
            fullContent: content.text,
            imageUrl: content.imageUrl,
          };

          const translation = await translateToRussian(content.text, item.title, item.summary);
          if (translation) {
            updateData.translatedTitle = translation.title;
            updateData.translatedSummary = translation.summary;
            updateData.translatedContent = translation.content;
          }

          await prisma.newsItem.update({
            where: { id: item.id },
            data: updateData,
          });
          count++;
        } catch {
          // skip
        }
      }
      return count;
    });

    // Step 7: Translate titles/summaries for items without translatedTitle
    const titlesTranslated = await step.run("translate-titles", async () => {
      const items = await prisma.newsItem.findMany({
        where: { translatedTitle: null },
        orderBy: { relevanceScore: "desc" },
        take: 20,
        select: { id: true, title: true, summary: true, fullContent: true },
      });

      let count = 0;
      for (const item of items) {
        try {
          const result = await translateToRussian(item.fullContent, item.title, item.summary);
          if (result) {
            await prisma.newsItem.update({
              where: { id: item.id },
              data: {
                translatedTitle: result.title,
                translatedSummary: result.summary,
                translatedContent: result.content,
              },
            });
            count++;
          }
        } catch {
          // skip
        }
      }
      return count;
    });

    const durationMs = Date.now() - startedAt;

    return {
      topicsProcessed: topics.length,
      queriesUsed: uniqueQueries.length,
      rawFetched: rawNews.length,
      aiProcessed: processed.length,
      newsSaved: totalSaved,
      alertsSent: totalAlerts,
      contentExtracted,
      titlesTranslated,
      durationMs,
    };
  }
);

/**
 * Weekly Trend Analysis — runs every Monday 9am.
 * Analyzes accumulated news to spot trends, generate weekly brief.
 */
export const weeklyTrendAnalysis = inngest.createFunction(
  {
    id: "prolife-intel-weekly-trends",
    retries: 1,
  },
  { cron: "0 9 * * 1" }, // Every Monday 9am
  async ({ step }) => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Get this week's news stats
    const weekStats = await step.run("week-stats", async () => {
      const [
        totalThisWeek,
        byCategory,
        byCountry,
        topByRelevance,
        topEntities,
      ] = await Promise.all([
        prisma.newsItem.count({
          where: { createdAt: { gte: oneWeekAgo } },
        }),
        prisma.newsItem.groupBy({
          by: ["category"],
          _count: { _all: true },
          where: { createdAt: { gte: oneWeekAgo } },
          orderBy: { _count: { category: "desc" } },
        }),
        prisma.$queryRaw`
          SELECT unnest(countries) as country, COUNT(*)::int as count
          FROM "NewsItem"
          WHERE "createdAt" >= ${oneWeekAgo}
          GROUP BY country
          ORDER BY count DESC
          LIMIT 10
        ` as Promise<{ country: string; count: number }[]>,
        prisma.newsItem.findMany({
          where: { createdAt: { gte: oneWeekAgo }, relevanceScore: { gte: 70 } },
          orderBy: { relevanceScore: "desc" },
          take: 10,
          select: { title: true, category: true, relevanceScore: true, countries: true, source: true },
        }),
        prisma.$queryRaw`
          SELECT unnest(entities) as entity, COUNT(*)::int as mentions
          FROM "NewsItem"
          WHERE "createdAt" >= ${oneWeekAgo}
          GROUP BY entity
          ORDER BY mentions DESC
          LIMIT 20
        ` as Promise<{ entity: string; mentions: number }[]>,
      ]);

      return {
        totalThisWeek,
        categories: byCategory.map((c) => ({ category: c.category, count: c._count._all })),
        countries: topByRelevance.flatMap((n) => n.countries),
        topCountries: byCountry,
        topStories: topByRelevance,
        topEntities,
      };
    });

    // Compare with previous week
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const prevWeekCount = await step.run("prev-week-count", async () => {
      return prisma.newsItem.count({
        where: {
          createdAt: { gte: twoWeeksAgo, lt: oneWeekAgo },
        },
      });
    });

    const weekOverWeekChange = prevWeekCount > 0
      ? Math.round(((weekStats.totalThisWeek - prevWeekCount) / prevWeekCount) * 100)
      : 0;

    // Generate AI weekly brief
    const brief = await step.run("generate-brief", async () => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return null;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: `You are a pharma distribution intelligence analyst. Write a concise weekly brief (5-7 bullet points) based on this week's data:

Total articles: ${weekStats.totalThisWeek} (${weekOverWeekChange >= 0 ? "+" : ""}${weekOverWeekChange}% vs last week)

Top categories: ${weekStats.categories.map((c) => `${c.category}: ${c.count}`).join(", ")}

Top countries: ${weekStats.topCountries.map((c) => `${c.country}: ${c.count}`).join(", ")}

Most mentioned entities: ${weekStats.topEntities.slice(0, 10).map((e) => `${e.entity} (${e.mentions})`).join(", ")}

Top stories:
${weekStats.topStories.map((s) => `- [${s.relevanceScore}] ${s.title}`).join("\n")}

Focus on: market expansion signals, regulatory changes, M&A activity, distribution partnerships. Write in English, be specific.`,
            },
          ],
        }),
      });

      if (!response.ok) return null;
      const data = (await response.json()) as { content?: Array<{ text?: string }> };
      return data.content?.[0]?.text ?? null;
    });

    return {
      week: oneWeekAgo.toISOString().slice(0, 10),
      stats: weekStats,
      weekOverWeekChange,
      brief,
    };
  }
);

/**
 * Manual trigger — run intel pipeline for a specific topic.
 */
export const intelManualTrigger = inngest.createFunction(
  {
    id: "prolife-intel-manual",
    retries: 1,
  },
  { event: "prolife/intel.run" },
  async ({ event, step }) => {
    const { tenantId, topicId } = event.data;

    const topic = await step.run("get-topic", async () => {
      return prisma.topic.findUniqueOrThrow({
        where: { id: topicId },
        select: {
          id: true,
          tenantId: true,
          name: true,
          keywords: true,
          countries: true,
        },
      });
    });

    const manualAggregateResult = await step.run("aggregate", async () => {
      const queries = topicToQueries(topic);
      return aggregateNews(queries, {
        includeRSS: true,
        includeFDA: true,
        includeClinicalTrials: true,
        includeEMA: true,
        maxPerSource: 10,
      });
    });

    const rawNews = manualAggregateResult.items;

    // Save feed health logs from manual run
    if (manualAggregateResult.feedHealth.length > 0) {
      await step.run("save-feed-health", async () => {
        await prisma.feedHealthLog.createMany({
          data: manualAggregateResult.feedHealth.map((h) => ({
            feedUrl: h.feedUrl,
            feedName: h.feedName,
            status: h.status,
            itemCount: h.itemCount,
            errorMessage: h.errorMessage ?? null,
            responseTimeMs: h.responseTimeMs,
          })),
        });
      });
    }

    const processed = await step.run("summarize", async () => {
      return summarizeNewsItems(rawNews);
    });

    const matched = await step.run("match", async () => {
      return matchEntitiesToCompanies(tenantId, processed);
    });

    const saved = await step.run("save", async () => {
      let count = 0;
      for (const item of matched) {
        try {
          await prisma.newsItem.upsert({
            where: { url: item.url },
            create: {
              tenantId,
              topicId: topic.id,
              url: item.url,
              title: item.title,
              source: item.source,
              publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
              category: item.category as never,
              summary: item.summary,
              entities: item.entities,
              countries: item.countries,
              sentiment: item.sentiment,
              relevanceScore: item.relevanceScore,
              companyId: item.companyId,
            },
            update: {
              summary: item.summary,
              category: item.category as never,
              topicId: topic.id,
            },
          });
          count++;
        } catch {
          // dup
        }
      }
      return count;
    });

    const alerts = await step.run("alerts", async () => {
      const matches = await checkAlerts(tenantId, matched);
      if (matches.length > 0) {
        await sendAlertNotifications(matches);
      }
      return matches.length;
    });

    return { topic: topic.name, fetched: rawNews.length, saved, alerts, feedHealth: manualAggregateResult.feedHealth.length };
  }
);
