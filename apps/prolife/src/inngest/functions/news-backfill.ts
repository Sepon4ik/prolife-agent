import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";
import { extractAndTranslateBatch, extractImageOnly, findStockImage } from "@agency/intel";

/**
 * Backfill content extraction + translation for news items.
 *
 * Runs after news-collect, or on its own cron (every 6h, offset by 1h).
 * Processes items that have no fullContent or no translatedTitle yet.
 * Also backfills missing images.
 */
export const newsBackfillContent = inngest.createFunction(
  {
    id: "prolife-news-backfill-content",
    retries: 1,
    concurrency: { limit: 1 }, // Only one backfill at a time
  },
  [
    { event: "prolife/news.backfill-content" },
    { cron: "0 1,7,13,19 * * *" }, // 1h after collect cron
  ],
  async ({ step }) => {
    // Step 1: Find items needing content extraction
    const itemsNeedingContent = await step.run("find-items-needing-content", async () => {
      return prisma.newsItem.findMany({
        where: {
          fullContent: null,
          translatedTitle: null,
        },
        select: {
          id: true,
          url: true,
          title: true,
          summary: true,
        },
        orderBy: { relevanceScore: "desc" },
        take: 50, // Process 50 per run (increased from 20 for faster coverage)
      });
    });

    // Step 2: Extract content + translate in batches of 5
    let contentUpdated = 0;
    for (let i = 0; i < itemsNeedingContent.length; i += 5) {
      const batch = itemsNeedingContent.slice(i, i + 5);
      const batchIndex = Math.floor(i / 5);

      const results = await step.run(`extract-batch-${batchIndex}`, async () => {
        return extractAndTranslateBatch(batch);
      });

      await step.run(`save-batch-${batchIndex}`, async () => {
        for (const result of results) {
          if (!result.fullContent && !result.translatedTitle) continue;

          await prisma.newsItem.update({
            where: { id: result.id },
            data: {
              ...(result.fullContent && { fullContent: result.fullContent }),
              ...(result.translatedTitle && { translatedTitle: result.translatedTitle }),
              ...(result.translatedSummary && { translatedSummary: result.translatedSummary }),
              ...(result.translatedContent && { translatedContent: result.translatedContent }),
              ...(result.imageUrl && { imageUrl: result.imageUrl }),
            },
          });
          contentUpdated++;
        }
      });
    }

    // Step 3: Backfill images for items still missing them
    const itemsNeedingImages = await step.run("find-items-needing-images", async () => {
      return prisma.newsItem.findMany({
        where: { imageUrl: null },
        select: { id: true, url: true, title: true, category: true },
        orderBy: { relevanceScore: "desc" },
        take: 30,
      });
    });

    let imagesUpdated = 0;
    for (let i = 0; i < itemsNeedingImages.length; i += 10) {
      const batch = itemsNeedingImages.slice(i, i + 10);
      const batchIndex = Math.floor(i / 10);

      await step.run(`backfill-images-${batchIndex}`, async () => {
        for (const item of batch) {
          // Try OG extraction first
          let imageUrl = await extractImageOnly(item.url);

          // Fallback to Pexels stock photo
          if (!imageUrl) {
            imageUrl = await findStockImage(item.title, item.category);
          }

          if (imageUrl) {
            await prisma.newsItem.update({
              where: { id: item.id },
              data: { imageUrl },
            });
            imagesUpdated++;
          }
        }
      });
    }

    // Step 4: Eager backfill — if many items were processed, check for more after a delay
    if (itemsNeedingContent.length >= 30) {
      await step.sleep("eager-backfill-delay", "5m");

      const stillRemaining = await step.run("check-remaining", async () => {
        return prisma.newsItem.count({
          where: {
            fullContent: null,
            translatedTitle: null,
          },
        });
      });

      if (stillRemaining > 0) {
        await step.sendEvent("trigger-eager-backfill", {
          name: "prolife/news.backfill-content",
          data: { eager: true },
        });
      }
    }

    return {
      success: true,
      contentUpdated,
      imagesUpdated,
      totalProcessed: itemsNeedingContent.length,
      totalImageCandidates: itemsNeedingImages.length,
    };
  }
);
