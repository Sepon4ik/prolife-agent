import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";
import {
  aggregateNews,
  summarizeNewsItems,
  matchEntitiesToCompanies,
  topicToQueries,
  checkAlerts,
  sendAlertNotifications,
} from "@agency/intel";

/**
 * Intel Pipeline — runs every 6 hours.
 *
 * For each active topic:
 * 1. Aggregate news from Google News RSS + GNews API + pharma RSS
 * 2. AI-summarize and classify each article (Haiku)
 * 3. Match mentioned companies to our pipeline
 * 4. Save to DB (deduplicate by URL)
 * 5. Check alert rules and send notifications
 */
export const intelPipeline = inngest.createFunction(
  {
    id: "prolife-intel-pipeline",
    retries: 2,
  },
  { cron: "0 */6 * * *" }, // Every 6 hours
  async ({ step }) => {
    // Step 1: Get all active topics across tenants
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

    let totalSaved = 0;
    let totalAlerts = 0;

    for (const topic of topics) {
      // Step 2: Aggregate news for this topic
      const rawNews = await step.run(
        `aggregate-${topic.id}`,
        async () => {
          const queries = topicToQueries(topic);
          return aggregateNews(queries, {
            includeRSS: true,
            maxPerSource: 10,
          });
        }
      );

      if (rawNews.length === 0) continue;

      // Step 3: AI summarize + classify
      const processed = await step.run(
        `summarize-${topic.id}`,
        async () => {
          return summarizeNewsItems(rawNews);
        }
      );

      // Step 4: Match entities to our companies
      const matched = await step.run(
        `match-${topic.id}`,
        async () => {
          return matchEntitiesToCompanies(topic.tenantId, processed);
        }
      );

      // Step 5: Save to DB (skip duplicates)
      const saved = await step.run(`save-${topic.id}`, async () => {
        let count = 0;
        for (const item of matched) {
          try {
            await prisma.newsItem.create({
              data: {
                tenantId: topic.tenantId,
                topicId: topic.id,
                url: item.url,
                title: item.title,
                source: item.source,
                publishedAt: item.publishedAt
                  ? new Date(item.publishedAt)
                  : null,
                category: item.category as any, // NewsCategory enum
                summary: item.summary,
                entities: item.entities,
                countries: item.countries,
                sentiment: item.sentiment,
                relevanceScore: item.relevanceScore,
                companyId: item.companyId,
              },
            });
            count++;
          } catch {
            // Duplicate URL — skip (unique constraint)
          }
        }
        return count;
      });

      totalSaved += saved;

      // Step 6: Check alerts
      const alertResults = await step.run(
        `alerts-${topic.id}`,
        async () => {
          const matches = await checkAlerts(topic.tenantId, matched);
          if (matches.length > 0) {
            await sendAlertNotifications(matches);
          }
          return matches.length;
        }
      );

      totalAlerts += alertResults;
    }

    return {
      topicsProcessed: topics.length,
      newsSaved: totalSaved,
      alertsSent: totalAlerts,
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

    const rawNews = await step.run("aggregate", async () => {
      const queries = topicToQueries(topic);
      return aggregateNews(queries, { includeRSS: true, maxPerSource: 10 });
    });

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
          await prisma.newsItem.create({
            data: {
              tenantId,
              topicId: topic.id,
              url: item.url,
              title: item.title,
              source: item.source,
              publishedAt: item.publishedAt
                ? new Date(item.publishedAt)
                : null,
              category: item.category as any,
              summary: item.summary,
              entities: item.entities,
              countries: item.countries,
              sentiment: item.sentiment,
              relevanceScore: item.relevanceScore,
              companyId: item.companyId,
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

    return { topic: topic.name, fetched: rawNews.length, saved, alerts };
  }
);
