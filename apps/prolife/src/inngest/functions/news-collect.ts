import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";
import {
  aggregateNews,
  summarizeNewsItems,
  matchEntitiesToCompanies,
  topicToQueries,
} from "@agency/intel";

/**
 * Automated news collection cron — runs every 6 hours.
 *
 * 1. Reads active topics → generates queries
 * 2. Aggregates from all sources (RSS, FDA, ClinicalTrials, EMA)
 * 3. AI summarize + categorize
 * 4. Match entities to companies
 * 5. Upsert to database (deduplicated by URL)
 * 6. Triggers content backfill for new items
 */
export const newsCollect = inngest.createFunction(
  {
    id: "prolife-news-collect",
    retries: 2,
  },
  { cron: "0 */6 * * *" }, // Every 6 hours: 00:00, 06:00, 12:00, 18:00
  async ({ step }) => {
    // Step 1: Get tenant + active topics
    const { tenant, topics } = await step.run("load-topics", async () => {
      const t = await prisma.tenant.findFirst();
      if (!t) throw new Error("No tenant found");

      const tp = await prisma.topic.findMany({
        where: { tenantId: t.id, isActive: true },
      });

      return { tenant: t, topics: tp };
    });

    if (topics.length === 0) {
      return { skipped: true, reason: "No active topics" };
    }

    // Step 2: Build queries from topics
    const allQueries: string[] = [];
    const topicMap = new Map<string, string>();

    for (const topic of topics) {
      const queries = topicToQueries({
        keywords: topic.keywords,
        countries: topic.countries,
      });
      for (const q of queries) {
        allQueries.push(q);
        topicMap.set(q, topic.id);
      }
    }

    const uniqueQueries = [...new Set(allQueries)].slice(0, 30);

    // Step 3: Aggregate news from all sources
    const rawItems = await step.run("aggregate-news", async () => {
      return aggregateNews(uniqueQueries, {
        includeRSS: true,
        includeFDA: true,
        includeClinicalTrials: true,
        includeEMA: true,
        maxPerSource: 8,
      });
    });

    if (rawItems.length === 0) {
      return { success: true, stats: { raw: 0, saved: 0 } };
    }

    // Step 4: AI summarize + categorize (batches of 5)
    const processed = await step.run("summarize", async () => {
      return summarizeNewsItems(rawItems);
    });

    // Step 5: Match entities to companies
    const matched = await step.run("match-entities", async () => {
      return matchEntitiesToCompanies(tenant.id, processed);
    });

    // Step 6: Save to database
    const saveResult = await step.run("save-to-db", async () => {
      let saved = 0;
      let skipped = 0;
      const newItemIds: string[] = [];

      for (const item of matched) {
        // Match topic by keyword overlap
        const topicId = matchTopicId(item, topics);

        try {
          const result = await prisma.newsItem.upsert({
            where: { url: item.url },
            create: {
              tenantId: tenant.id,
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
              topicId,
            },
            update: {
              summary: item.summary,
              category: item.category as never,
              entities: item.entities,
              countries: item.countries,
              sentiment: item.sentiment,
              relevanceScore: item.relevanceScore,
              companyId: item.companyId,
              topicId,
            },
            select: { id: true, createdAt: true, updatedAt: true },
          });

          // Track genuinely new items (created === updated means just created)
          if (result.createdAt.getTime() === result.updatedAt.getTime()) {
            newItemIds.push(result.id);
          }
          saved++;
        } catch {
          skipped++;
        }
      }

      return { saved, skipped, newItemIds };
    });

    // Step 7: Trigger content backfill for new items
    if (saveResult.newItemIds.length > 0) {
      await step.sendEvent("trigger-backfill", {
        name: "prolife/news.backfill-content",
        data: {},
      });
    }

    // Step 8: Trigger company enrichment for matched items
    const matchedNewIds = saveResult.newItemIds;
    if (matchedNewIds.length > 0) {
      await step.sendEvent("trigger-news-enrich", {
        name: "prolife/news.enrich-companies",
        data: {
          tenantId: tenant.id,
          newsItemIds: matchedNewIds,
        },
      });
    }

    return {
      success: true,
      stats: {
        queriesUsed: uniqueQueries.length,
        topicsActive: topics.length,
        raw: rawItems.length,
        processed: processed.length,
        saved: saveResult.saved,
        skipped: saveResult.skipped,
        newItems: saveResult.newItemIds.length,
      },
    };
  }
);

/** Match a news item to the best topic by keyword overlap */
function matchTopicId(
  item: { title: string; summary: string | null; entities: string[] },
  topics: Array<{ id: string; keywords: string[]; countries: string[] }>
): string | null {
  const text =
    `${item.title} ${item.summary ?? ""} ${item.entities.join(" ")}`.toLowerCase();
  let bestTopicId: string | null = null;
  let bestScore = 0;

  for (const topic of topics) {
    let score = 0;
    for (const keyword of topic.keywords) {
      const words = keyword.toLowerCase().split(/\s+/);
      if (words.every((w) => text.includes(w))) {
        score += words.length;
      }
    }
    for (const country of topic.countries) {
      if (text.includes(country.toLowerCase())) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTopicId = topic.id;
    }
  }

  return bestScore >= 2 ? bestTopicId : null;
}
