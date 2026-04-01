import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";

/**
 * Scrape Pipeline
 * Triggered when a scraping job is started.
 * Crawls exhibition catalogs, extracts exhibitor data,
 * and creates Company records for each found company.
 */
export const scrapePipeline = inngest.createFunction(
  {
    id: "prolife-scrape-pipeline",
    throttle: { limit: 3, period: "1s" },
    retries: 3,
  },
  { event: "prolife/scrape.started" },
  async ({ event, step }) => {
    const { tenantId, jobId, sourceUrl, sourceType, sourceName } = event.data;

    // Step 1: Update job status
    await step.run("update-job-running", async () => {
      await prisma.scrapingJob.update({
        where: { id: jobId },
        data: { status: "running", startedAt: new Date() },
      });
    });

    // Step 2: Crawl the source
    const rawData = await step.run("crawl-source", async () => {
      // Dynamic import to avoid loading Playwright in all routes
      const { createExhibitionCrawler } = await import("@agency/scraping");
      const crawler = createExhibitionCrawler({
        maxRequests: 100,
        maxConcurrency: 3,
        proxyUrls: process.env.PROXY_URLS?.split(","),
      });

      await crawler.run([sourceUrl]);

      // Get results from dataset
      const { Dataset } = await import("crawlee");
      const dataset = await Dataset.open();
      const { items } = await dataset.getData();
      await dataset.drop();

      return items;
    });

    // Step 3: Extract and save companies
    const savedCount = await step.run("extract-and-save", async () => {
      const { extractExhibitorData } = await import("@agency/scraping");
      let count = 0;

      for (const item of rawData) {
        const extracted = extractExhibitorData(item as any);
        if (!extracted.name) continue;

        try {
          await prisma.company.upsert({
            where: {
              tenantId_name_country: {
                tenantId,
                name: extracted.name,
                country: extracted.country ?? "Unknown",
              },
            },
            create: {
              tenantId,
              name: extracted.name,
              country: extracted.country ?? "Unknown",
              city: extracted.city,
              website: extracted.website,
              description: extracted.description,
              source: sourceType.toUpperCase() as any,
              sourceUrl,
              sourceExhibition: sourceName,
              status: "RAW",
            },
            update: {},
          });
          count++;
        } catch (e) {
          // Duplicate or validation error — skip
          console.error(`Skip ${extracted.name}:`, e);
        }
      }

      return count;
    });

    // Step 4: Update job as completed
    await step.run("update-job-completed", async () => {
      await prisma.scrapingJob.update({
        where: { id: jobId },
        data: {
          status: "completed",
          totalFound: rawData.length,
          totalNew: savedCount,
          finishedAt: new Date(),
        },
      });
    });

    // Step 5: Trigger enrichment for all new RAW companies
    await step.run("trigger-enrichment", async () => {
      const rawCompanies = await prisma.company.findMany({
        where: { tenantId, status: "RAW" },
        select: { id: true },
        take: 100,
      });

      for (const company of rawCompanies) {
        await inngest.send({
          name: "prolife/enrich.started",
          data: { tenantId, companyId: company.id },
        });
      }
    });

    return { crawled: rawData.length, saved: savedCount };
  }
);
