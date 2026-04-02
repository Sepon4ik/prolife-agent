import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";
import { classifyCompany, discoverContacts } from "@agency/ai";

/**
 * Enrich Company
 * Takes a RAW company, scrapes its website,
 * classifies it with AI, discovers contacts, and updates the record.
 */
export const enrichCompany = inngest.createFunction(
  {
    id: "prolife-enrich-company",
    throttle: { limit: 5, period: "1s" },
    retries: 3,
  },
  { event: "prolife/enrich.started" },
  async ({ event, step }) => {
    const { tenantId, companyId } = event.data;

    // Step 1: Get company
    const company = await step.run("get-company", async () => {
      return prisma.company.findUniqueOrThrow({
        where: { id: companyId },
      });
    });

    // Step 2: Scrape website (if available) — fetch + cheerio
    let websiteContent = "";
    let crawlResults: any[] = [];
    if (company.website) {
      const scrapeResult = await step.run("scrape-website", async () => {
        try {
          const { crawlPages } = await import("@agency/scraping");
          const results = await crawlPages([company.website!], {
            maxRequests: 8,
          });
          return {
            text: results
              .map((r) => r.text)
              .join("\n")
              .slice(0, 10_000),
            results,
          };
        } catch (e) {
          console.error(`Failed to scrape ${company.website}:`, e);
          return { text: "", results: [] };
        }
      });
      websiteContent = scrapeResult.text;
      crawlResults = scrapeResult.results;
    }

    // Step 3: Discover contacts from team/about/contact pages
    const contacts = await step.run("discover-contacts", async () => {
      if (crawlResults.length === 0) return { contacts: [] };

      try {
        const { extractContactPages, findContactPageUrls, crawlPages } =
          await import("@agency/scraping");

        // Check if we already have relevant pages
        let contactPageText = extractContactPages(crawlResults);

        // If no contact pages found in initial crawl, try fetching them
        if (!contactPageText && company.website) {
          const additionalUrls = findContactPageUrls(
            crawlResults,
            company.website
          );
          if (additionalUrls.length > 0) {
            const additionalResults = await crawlPages(additionalUrls, {
              maxRequests: 3,
            });
            contactPageText = extractContactPages([
              ...crawlResults,
              ...additionalResults,
            ]);
          }
        }

        if (!contactPageText) return { contacts: [] };

        return discoverContacts(contactPageText, company.name);
      } catch (e) {
        console.error(`Failed to discover contacts for ${company.name}:`, e);
        return { contacts: [] };
      }
    });

    // Step 4: Classify with AI
    const classification = await step.run("classify-with-ai", async () => {
      const content = websiteContent || company.description || company.name;
      return classifyCompany(content, company.name, company.country);
    });

    // Step 5: Update company with enrichment data
    await step.run("update-company", async () => {
      const typeMap: Record<string, any> = {
        distributor: "DISTRIBUTOR",
        pharmacy_chain: "PHARMACY_CHAIN",
        retail: "RETAIL",
        hybrid: "HYBRID",
        unknown: "UNKNOWN",
      };

      // Use AI-determined name/country if current ones are bad
      const cleanName =
        classification.companyName &&
        classification.companyName.length > 2 &&
        !["Contact Us", "About Us", "Home", "Products", "Exhibitor List"].includes(classification.companyName)
          ? classification.companyName
          : undefined;

      const cleanCountry =
        classification.country &&
        classification.country.length > 1 &&
        classification.country !== "Unknown"
          ? classification.country
          : undefined;

      await prisma.company.update({
        where: { id: companyId },
        data: {
          ...(cleanName && { name: cleanName }),
          ...(cleanCountry && { country: cleanCountry }),
          ...(classification.city && { city: classification.city }),
          type: typeMap[classification.type] ?? "UNKNOWN",
          categories: classification.categories,
          estimatedRevenue: classification.estimatedRevenue,
          hasEcommerce: classification.hasEcommerce,
          hasSalesTeam: classification.hasSalesTeam,
          hasMarketingTeam: classification.hasMarketingTeam,
          hasMedReps: classification.hasMedReps,
          pharmacyCount: classification.pharmacyCount,
          portfolioBrands: classification.portfolioBrands,
          activelySeekingBrands: classification.activelySeekingBrands,
          status: "ENRICHED",
        },
      });
    });

    // Step 6: Save discovered contacts
    if (contacts.contacts.length > 0) {
      await step.run("save-contacts", async () => {
        const priorityTitles =
          /\b(CEO|Managing Director|General Manager|Sales Director|VP Sales|Head of Sales|Business Development|Commercial Director)\b/i;

        // Get existing contacts to avoid duplicates
        const existing = await prisma.contact.findMany({
          where: { companyId },
          select: { email: true },
        });
        const existingEmails = new Set(
          existing.map((c) => c.email?.toLowerCase()).filter(Boolean)
        );

        let hasPrimary = false;

        for (const contact of contacts.contacts) {
          if (!contact.name) continue;

          // Skip if email already exists for this company
          if (
            contact.email &&
            existingEmails.has(contact.email.toLowerCase())
          ) {
            continue;
          }

          const isPrimary =
            !hasPrimary &&
            contact.title != null &&
            priorityTitles.test(contact.title);
          if (isPrimary) hasPrimary = true;

          await prisma.contact.create({
            data: {
              companyId,
              name: contact.name,
              title: contact.title,
              email: contact.email,
              phone: contact.phone,
              linkedin: contact.linkedin,
              isPrimary,
            },
          });

          if (contact.email) {
            existingEmails.add(contact.email.toLowerCase());
          }
        }
      });
    }

    // Step 7: Trigger scoring
    await step.sendEvent("trigger-scoring", {
      name: "prolife/score.calculate",
      data: { tenantId, companyId },
    });

    return {
      companyId,
      classification,
      contactsFound: contacts.contacts.length,
    };
  }
);
