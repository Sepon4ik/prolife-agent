import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";
import {
  discoverCompanyPages,
  scrapePage,
  getContentDiff,
} from "@agency/intel";

/**
 * Company Website Monitor — checks competitor/prospect sites for changes.
 *
 * Runs daily at 05:00 UTC. Discovers pages on first run, then tracks changes.
 * When a change is detected, creates a NewsItem with source "Company Website".
 */
export const websiteMonitor = inngest.createFunction(
  {
    id: "prolife-website-monitor",
    retries: 1,
    concurrency: { limit: 1 },
  },
  { cron: "0 5 * * *" }, // Daily at 05:00 UTC
  async ({ step }) => {
    // Step 1: Get companies with websites (scored or higher, top 50 by score)
    const companies = await step.run("load-companies", async () => {
      return prisma.company.findMany({
        where: {
          website: { not: null },
          status: { in: ["SCORED", "OUTREACH_SENT", "REPLIED", "INTERESTED", "HANDED_OFF"] },
          deletedAt: null,
        },
        select: { id: true, name: true, website: true, tenantId: true },
        orderBy: { score: "desc" },
        take: 50,
      });
    });

    if (companies.length === 0) {
      return { skipped: true, reason: "No companies with websites" };
    }

    let pagesDiscovered = 0;
    let pagesChecked = 0;
    let changesDetected = 0;
    let newsCreated = 0;

    // Step 2: Process companies in batches of 5
    for (let i = 0; i < companies.length; i += 5) {
      const batch = companies.slice(i, i + 5);
      const batchIndex = Math.floor(i / 5);

      const batchResult = await step.run(`monitor-batch-${batchIndex}`, async () => {
        let batchDiscovered = 0;
        let batchChecked = 0;
        let batchChanges = 0;
        let batchNews = 0;

        for (const company of batch) {
          if (!company.website) continue;

          // Check if we have existing snapshots for this company
          const existingSnapshots = await prisma.companyPageSnapshot.findMany({
            where: { companyId: company.id },
            select: { pageUrl: true, contentHash: true, content: true, pageType: true },
          });

          let pagesToCheck: Array<{ url: string; pageType: string }>;

          if (existingSnapshots.length === 0) {
            // First time — discover pages
            pagesToCheck = await discoverCompanyPages(company.website);
            batchDiscovered += pagesToCheck.length;
          } else {
            // Existing — check known pages
            pagesToCheck = existingSnapshots.map((s) => ({
              url: s.pageUrl,
              pageType: s.pageType,
            }));
          }

          // Scrape each page
          for (const page of pagesToCheck) {
            const result = await scrapePage(page.url, page.pageType);
            if (!result) continue;

            batchChecked++;

            const existingSnapshot = existingSnapshots.find((s) => s.pageUrl === page.url);
            const hasChanged = existingSnapshot
              ? existingSnapshot.contentHash !== result.contentHash
              : false;

            // Upsert snapshot
            await prisma.companyPageSnapshot.upsert({
              where: {
                companyId_pageUrl: {
                  companyId: company.id,
                  pageUrl: page.url,
                },
              },
              create: {
                companyId: company.id,
                pageUrl: page.url,
                pageType: page.pageType,
                contentHash: result.contentHash,
                content: result.content,
                changeDetected: false,
                checkedAt: new Date(),
              },
              update: {
                previousContent: hasChanged ? existingSnapshot?.content : undefined,
                content: result.content,
                contentHash: result.contentHash,
                changeDetected: hasChanged,
                changeSummary: null, // Will be filled by AI step
                checkedAt: new Date(),
              },
            });

            // If changed, create a NewsItem
            if (hasChanged && existingSnapshot?.content) {
              const diff = getContentDiff(existingSnapshot.content, result.content);
              if (diff.length > 50) {
                batchChanges++;

                // Create news item from the change
                const title = `${company.name}: обновление на сайте (${page.pageType})`;
                const url = page.url;

                try {
                  await prisma.newsItem.create({
                    data: {
                      tenantId: company.tenantId,
                      url: `${url}#change-${Date.now()}`, // Unique URL per change
                      title,
                      source: "Company Website",
                      category: "GENERAL",
                      summary: diff.slice(0, 500),
                      entities: [company.name],
                      countries: [],
                      sentiment: "neutral",
                      relevanceScore: 75, // Website changes are high-relevance
                      companyId: company.id,
                    },
                  });
                  batchNews++;
                } catch {
                  // Duplicate URL — skip
                }
              }
            }
          }
        }

        return { discovered: batchDiscovered, checked: batchChecked, changes: batchChanges, news: batchNews };
      });

      pagesDiscovered += batchResult.discovered;
      pagesChecked += batchResult.checked;
      changesDetected += batchResult.changes;
      newsCreated += batchResult.news;
    }

    return {
      success: true,
      stats: {
        companiesProcessed: companies.length,
        pagesDiscovered,
        pagesChecked,
        changesDetected,
        newsCreated,
      },
    };
  }
);
