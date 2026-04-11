import { NextResponse } from "next/server";
import { prisma } from "@agency/db";
import {
  aggregateNews,
  summarizeNewsItems,
  matchEntitiesToCompanies,
  topicToQueries,
  extractImageOnly,
  findStockImage,
} from "@agency/intel";

/**
 * POST /api/news/collect
 * Runs the full news aggregation pipeline:
 * 1. Get active topics → generate queries
 * 2. Aggregate from all sources (RSS, FDA, ClinicalTrials, EMA)
 * 3. AI summarize + categorize
 * 4. Match entities to companies
 * 5. Save to database
 */
export async function POST() {
  try {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      return NextResponse.json(
        { error: "No tenant found. Run POST /api/news/seed first." },
        { status: 400 }
      );
    }

    // 1. Get topics and build queries
    const topics = await prisma.topic.findMany({
      where: { tenantId: tenant.id, isActive: true },
    });

    if (topics.length === 0) {
      return NextResponse.json(
        { error: "No active topics. Run POST /api/news/seed first." },
        { status: 400 }
      );
    }

    const allQueries: string[] = [];
    const topicMap = new Map<string, string>(); // query → topicId

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

    // Deduplicate queries
    const uniqueQueries = [...new Set(allQueries)].slice(0, 30);

    // 2. Aggregate news from all sources
    const aggregateResult = await aggregateNews(uniqueQueries, {
      includeRSS: true,
      includeFDA: true,
      includeClinicalTrials: true,
      includeEMA: true,
      maxPerSource: 8,
    });

    const rawItems = aggregateResult.items;

    // 2b. Save feed health logs
    if (aggregateResult.feedHealth.length > 0) {
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
    }

    if (rawItems.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No news items found from any source.",
        stats: { raw: 0, processed: 0, saved: 0 },
      });
    }

    // 3. AI summarize + categorize (batches of 5)
    const processed = await summarizeNewsItems(rawItems);

    // 4. Match entities to companies in DB
    const matched = await matchEntitiesToCompanies(tenant.id, processed);

    // 5. Match items to topics by keyword overlap
    function matchTopicId(title: string, summary: string | null, entities: string[]): string | null {
      const text = `${title} ${summary ?? ""} ${entities.join(" ")}`.toLowerCase();
      let bestTopicId: string | null = null;
      let bestScore = 0;

      for (const topic of topics) {
        let score = 0;
        for (const keyword of topic.keywords) {
          const words = keyword.toLowerCase().split(/\s+/);
          // Check if all words of the keyword phrase appear in the text
          if (words.every((w) => text.includes(w))) {
            score += words.length; // Longer phrases = better match
          }
        }
        // Also check country matches
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

    // 6. Save to database (upsert by URL)
    let saved = 0;
    let skipped = 0;

    for (const item of matched) {
      const topicId = matchTopicId(item.title, item.summary, item.entities);

      try {
        await prisma.newsItem.upsert({
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
        });
        saved++;
      } catch {
        skipped++;
      }
    }

    // 7. Extract images for items missing them (inline, so they appear with images)
    const itemsWithoutImages = await prisma.newsItem.findMany({
      where: { imageUrl: null, tenantId: tenant.id },
      select: { id: true, url: true, title: true, category: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    let imagesExtracted = 0;
    for (const item of itemsWithoutImages) {
      let imageUrl = await extractImageOnly(item.url);
      if (!imageUrl) {
        imageUrl = await findStockImage(item.title, item.category);
      }
      if (imageUrl) {
        await prisma.newsItem.update({
          where: { id: item.id },
          data: { imageUrl },
        });
        imagesExtracted++;
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        queriesUsed: uniqueQueries.length,
        topicsActive: topics.length,
        raw: rawItems.length,
        processed: processed.length,
        matched: matched.filter((m) => m.companyId).length,
        saved,
        skipped,
        imagesExtracted,
      },
      sources: {
        rss: rawItems.filter((i) => !["FDA Approvals", "FDA Recalls", "FDA Shortages", "ClinicalTrials.gov", "EMA"].includes(i.source)).length,
        fda: rawItems.filter((i) => i.source.startsWith("FDA")).length,
        clinicalTrials: rawItems.filter((i) => i.source === "ClinicalTrials.gov").length,
        ema: rawItems.filter((i) => i.source === "EMA").length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("News collect error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
