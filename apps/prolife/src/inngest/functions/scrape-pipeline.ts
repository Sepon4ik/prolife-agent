import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";

/**
 * Scrape Pipeline
 * Triggered when a scraping job is started.
 * Supports two modes:
 * - "exhibition": Crawls exhibition pages and extracts exhibitor data
 * - "google_search": Searches Google for distributors and crawls result pages
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

    // Step 2: Crawl or Search (supports multiple source types)
    const rawData = await step.run("crawl-source", async () => {
      if (sourceType === "google_search") {
        const { searchAndCrawl } = await import("@agency/scraping");
        const result = await searchAndCrawl(sourceUrl, {
          maxResults: 20,
          maxCrawlPages: 15,
        });

        return {
          type: "google_search" as const,
          crawledPages: result.crawledPages.map((page) => {
            const matchingSearch = result.searchResults.find(
              (sr) =>
                page.url.includes(new URL(sr.url).hostname) ||
                sr.url === page.url
            );
            return {
              ...page,
              searchSnippet: matchingSearch?.snippet ?? "",
              searchTitle: matchingSearch?.title ?? "",
            };
          }),
        };
      }

      if (sourceType === "google_maps") {
        const { searchGoogleMapsMulti, generateMapsQueries } = await import(
          "@agency/scraping"
        );
        // sourceUrl contains country, sourceName can contain city
        const queries = generateMapsQueries(sourceUrl, sourceName);
        const places = await searchGoogleMapsMulti(queries, {
          maxResultsPerQuery: 20,
        });
        return { type: "google_maps" as const, places };
      }

      if (sourceType === "directory") {
        const { scrapeDirectoriesMulti, getPharmaDirectories } = await import(
          "@agency/scraping"
        );
        // sourceUrl can be a custom directory URL, or use predefined ones
        const directories =
          sourceUrl === "auto"
            ? getPharmaDirectories(sourceName)
            : [{ name: sourceName ?? "Custom", url: sourceUrl, maxPages: 30 }];
        const listings = await scrapeDirectoriesMulti(directories);
        return { type: "directory" as const, listings };
      }

      if (sourceType === "trade_registry") {
        const { searchTradeRegistriesMulti, generateTradeRegistryQueries } =
          await import("@agency/scraping");
        const queries = generateTradeRegistryQueries(sourceUrl);
        const companies = await searchTradeRegistriesMulti(queries);
        return { type: "trade_registry" as const, companies };
      }

      if (sourceType === "regulatory") {
        const { scrapeRegulatoryByCountry } = await import("@agency/scraping");
        const listings = await scrapeRegulatoryByCountry(sourceUrl);
        return { type: "regulatory" as const, listings };
      }

      if (sourceType === "news_intent") {
        const { monitorNewsForCountry } = await import("@agency/scraping");
        const signals = await monitorNewsForCountry(sourceUrl);
        return { type: "news_intent" as const, signals };
      }

      if (sourceType === "apollo") {
        const { findDecisionMakers } = await import("@agency/scraping");
        const people = await findDecisionMakers(sourceUrl);
        return { type: "apollo" as const, people };
      }

      // Default: Exhibition/direct crawl mode
      const { crawlPages } = await import("@agency/scraping");
      const results = await crawlPages([sourceUrl], {
        maxRequests: 100,
        maxConcurrency: 3,
      });
      return { type: "exhibition" as const, crawledPages: results };
    });

    // Step 3: Extract and save companies
    const savedCount = await step.run("extract-and-save", async () => {
      let count = 0;

      if (rawData.type === "google_search") {
        const { extractCompanyWebsite } = await import("@agency/scraping");

        for (const item of rawData.crawledPages) {
          try {
            const extracted = extractCompanyWebsite(item);
            const name =
              item.searchTitle ||
              item.title?.replace(/\s*[-|–].*$/, "").trim();
            if (!name || name.length < 2) continue;

            const domain = new URL(item.url).hostname.replace("www.", "");

            await prisma.company.upsert({
              where: {
                tenantId_name_country: {
                  tenantId,
                  name,
                  country: sourceName ?? "Unknown",
                },
              },
              create: {
                tenantId,
                name,
                country: sourceName ?? "Unknown",
                website: `https://${domain}`,
                description:
                  item.searchSnippet || extracted.description?.slice(0, 500),
                source: "GOOGLE",
                sourceUrl: item.url,
                hasEcommerce: extracted.hasEcommerce,
                status: "RAW",
              },
              update: {},
            });
            count++;
          } catch (e) {
            console.error(`Skip ${item.url}:`, e);
          }
        }
      } else if (rawData.type === "google_maps") {
        for (const place of rawData.places) {
          try {
            if (!place.name || place.name.length < 2) continue;

            await prisma.company.upsert({
              where: {
                tenantId_name_country: {
                  tenantId,
                  name: place.name,
                  country: place.country || sourceName || "Unknown",
                },
              },
              create: {
                tenantId,
                name: place.name,
                country: place.country || sourceName || "Unknown",
                city: place.city || undefined,
                website: place.website || undefined,
                description: [
                  place.address,
                  place.rating
                    ? `Rating: ${place.rating}/5 (${place.totalRatings ?? 0} reviews)`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" | "),
                source: "GOOGLE_MAPS",
                sourceUrl: `https://maps.google.com/?cid=${place.placeId}`,
                status: "RAW",
              },
              update: {},
            });
            count++;
          } catch (e) {
            console.error(`Skip Google Maps ${place.name}:`, e);
          }
        }
      } else if (rawData.type === "directory") {
        for (const listing of rawData.listings) {
          try {
            if (!listing.name || listing.name.length < 2) continue;

            await prisma.company.upsert({
              where: {
                tenantId_name_country: {
                  tenantId,
                  name: listing.name,
                  country: listing.country || sourceName || "Unknown",
                },
              },
              create: {
                tenantId,
                name: listing.name,
                country: listing.country || sourceName || "Unknown",
                city: listing.city || undefined,
                website: listing.website || undefined,
                description: listing.description?.slice(0, 500),
                source: "DIRECTORY",
                sourceUrl: listing.website || sourceUrl,
                status: "RAW",
              },
              update: {},
            });
            count++;
          } catch (e) {
            console.error(`Skip directory ${listing.name}:`, e);
          }
        }
      } else if (rawData.type === "trade_registry") {
        for (const company of rawData.companies) {
          try {
            if (!company.name || company.name.length < 2) continue;

            await prisma.company.upsert({
              where: {
                tenantId_name_country: {
                  tenantId,
                  name: company.name,
                  country: company.country || sourceName || "Unknown",
                },
              },
              create: {
                tenantId,
                name: company.name,
                country: company.country || sourceName || "Unknown",
                description: [
                  company.status ? `Status: ${company.status}` : null,
                  company.address,
                  company.companyNumber
                    ? `Reg: ${company.companyNumber}`
                    : null,
                  company.officers?.length
                    ? `Officers: ${company.officers.join(", ")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" | ")
                  .slice(0, 500),
                source: "TRADE_REGISTRY",
                sourceUrl: company.sourceUrl,
                status: "RAW",
              },
              update: {},
            });
            count++;
          } catch (e) {
            console.error(`Skip registry ${company.name}:`, e);
          }
        }
      } else if (rawData.type === "regulatory") {
        for (const listing of rawData.listings) {
          try {
            if (!listing.name || listing.name.length < 2) continue;

            await prisma.company.upsert({
              where: {
                tenantId_name_country: {
                  tenantId,
                  name: listing.name,
                  country: listing.country || sourceName || "Unknown",
                },
              },
              create: {
                tenantId,
                name: listing.name,
                country: listing.country || sourceName || "Unknown",
                website: listing.website || undefined,
                description: [
                  listing.licenseNumber
                    ? `License: ${listing.licenseNumber}`
                    : null,
                  listing.licenseType,
                  listing.address,
                ]
                  .filter(Boolean)
                  .join(" | ")
                  .slice(0, 500) || undefined,
                source: "REGULATORY",
                sourceUrl: listing.sourceUrl,
                status: "RAW",
              },
              update: {},
            });
            count++;
          } catch (e) {
            console.error(`Skip regulatory ${listing.name}:`, e);
          }
        }
      } else if (rawData.type === "news_intent") {
        for (const signal of rawData.signals) {
          try {
            if (!signal.companyName || signal.companyName.length < 2) continue;

            await prisma.company.upsert({
              where: {
                tenantId_name_country: {
                  tenantId,
                  name: signal.companyName,
                  country: signal.country || sourceName || "Unknown",
                },
              },
              create: {
                tenantId,
                name: signal.companyName,
                country: signal.country || sourceName || "Unknown",
                description: `[${signal.intentType}] ${signal.headline}`.slice(
                  0,
                  500
                ),
                source: "NEWS_INTENT",
                sourceUrl: signal.url,
                status: "RAW",
              },
              update: {},
            });
            count++;
          } catch (e) {
            console.error(`Skip news ${signal.companyName}:`, e);
          }
        }
      } else if (rawData.type === "apollo") {
        // Apollo returns people — group by company and create company + contacts
        const companiesMap = new Map<
          string,
          { name: string; domain?: string; industry?: string; people: typeof rawData.people }
        >();

        for (const person of rawData.people) {
          if (!person.companyName) continue;
          const key = person.companyName.toLowerCase();
          if (!companiesMap.has(key)) {
            companiesMap.set(key, {
              name: person.companyName,
              domain: person.companyDomain,
              industry: person.companyIndustry,
              people: [],
            });
          }
          companiesMap.get(key)!.people.push(person);
        }

        for (const [, company] of companiesMap) {
          try {
            const created = await prisma.company.upsert({
              where: {
                tenantId_name_country: {
                  tenantId,
                  name: company.name,
                  country: sourceName || sourceUrl || "Unknown",
                },
              },
              create: {
                tenantId,
                name: company.name,
                country: sourceName || sourceUrl || "Unknown",
                website: company.domain
                  ? `https://${company.domain}`
                  : undefined,
                description: company.industry || undefined,
                source: "APOLLO",
                sourceUrl: company.domain
                  ? `https://${company.domain}`
                  : "https://apollo.io",
                status: "RAW",
              },
              update: {},
            });

            // Save contacts from Apollo with LinkedIn enrichment
            for (const person of company.people) {
              try {
                await prisma.contact.create({
                  data: {
                    companyId: created.id,
                    name: person.name,
                    title: person.title || undefined,
                    linkedin: person.linkedinUrl || undefined,
                    photoUrl: person.photoUrl || undefined,
                    linkedinHeadline: person.title
                      ? `${person.title} at ${person.companyName}`
                      : undefined,
                    linkedinSeniority: person.seniority || undefined,
                    linkedinDepartment: person.department || undefined,
                    isPrimary:
                      person.seniority === "c_suite" ||
                      person.seniority === "owner" ||
                      person.seniority === "founder",
                  },
                });
              } catch {
                // Duplicate contact, skip
              }
            }

            count++;
          } catch (e) {
            console.error(`Skip Apollo ${company.name}:`, e);
          }
        }
      } else {
        // Exhibition mode
        const { extractExhibitorData } = await import("@agency/scraping");

        for (const item of rawData.crawledPages) {
          const extracted = extractExhibitorData(item);
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
                source: "EXHIBITION",
                sourceUrl,
                sourceExhibition: sourceName,
                status: "RAW",
              },
              update: {},
            });
            count++;
          } catch (e) {
            console.error(`Skip ${extracted.name}:`, e);
          }
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
          totalFound: (rawData.type === "google_maps"
              ? rawData.places.length
              : rawData.type === "directory" || rawData.type === "regulatory"
                ? rawData.listings.length
                : rawData.type === "trade_registry"
                  ? rawData.companies.length
                  : rawData.type === "news_intent"
                    ? rawData.signals.length
                    : rawData.type === "apollo"
                      ? rawData.people.length
                      : rawData.crawledPages.length),
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

    return { crawled: (rawData.type === "google_maps"
              ? rawData.places.length
              : rawData.type === "directory" || rawData.type === "regulatory"
                ? rawData.listings.length
                : rawData.type === "trade_registry"
                  ? rawData.companies.length
                  : rawData.type === "news_intent"
                    ? rawData.signals.length
                    : rawData.type === "apollo"
                      ? rawData.people.length
                      : rawData.crawledPages.length), saved: savedCount };
  }
);

