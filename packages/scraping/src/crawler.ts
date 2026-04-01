import { PlaywrightCrawler, ProxyConfiguration, Dataset } from "crawlee";

interface CrawlerOptions {
  maxRequests?: number;
  maxConcurrency?: number;
  proxyUrls?: string[];
  requestHandler: Parameters<typeof PlaywrightCrawler.prototype.run>[0] extends any
    ? any
    : never;
}

export function createExhibitionCrawler(options: {
  maxRequests?: number;
  maxConcurrency?: number;
  proxyUrls?: string[];
}) {
  const proxyConfiguration = options.proxyUrls?.length
    ? new ProxyConfiguration({ proxyUrls: options.proxyUrls })
    : undefined;

  return new PlaywrightCrawler({
    maxRequestsPerCrawl: options.maxRequests ?? 500,
    maxConcurrency: options.maxConcurrency ?? 3,
    requestHandlerTimeoutSecs: 60,
    maxRequestRetries: 3,
    proxyConfiguration,
    launchContext: {
      launchOptions: {
        headless: true,
      },
    },
    requestHandler: async ({ page, request, enqueueLinks, log }) => {
      log.info(`Processing: ${request.url}`);

      // Wait for main content to load
      await page.waitForLoadState("domcontentloaded");

      // Extract exhibitor/company data
      const data = await page.evaluate(() => {
        return {
          title: document.title,
          text: document.body.innerText?.slice(0, 10000),
          links: Array.from(document.querySelectorAll("a[href]")).map((a) => ({
            href: (a as HTMLAnchorElement).href,
            text: a.textContent?.trim() ?? "",
          })),
        };
      });

      await Dataset.pushData({
        url: request.url,
        ...data,
        scrapedAt: new Date().toISOString(),
      });
    },
    failedRequestHandler: async ({ request }, error) => {
      console.error(`Failed: ${request.url} - ${error.message}`);
    },
  });
}
