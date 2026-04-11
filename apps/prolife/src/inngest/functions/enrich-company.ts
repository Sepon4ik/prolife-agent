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
          portfolioBrandInfo: classification.portfolioBrandInfo ?? {},
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
              photoUrl: contact.photoUrl,
              bio: contact.bio,
              languages: contact.languages ?? [],
              isPrimary,
            },
          });

          if (contact.email) {
            existingEmails.add(contact.email.toLowerCase());
          }
        }
      });
    }

    // Step 7: Apollo People Search — find real decision-makers (FREE)
    await step.run("apollo-people-search", async () => {
      const updatedCompany = await prisma.company.findUnique({
        where: { id: companyId },
        select: { website: true, name: true },
      });
      if (!updatedCompany?.website) return;

      const { findPeopleAtCompany, getGravatarUrl } = await import("@agency/scraping");
      const { extractDomain } = await import("@agency/scraping");
      const domain = extractDomain(updatedCompany.website);
      if (!domain) return;

      const apolloPeople = await findPeopleAtCompany(domain, {
        maxResults: 10,
      });
      if (apolloPeople.length === 0) return;

      // Get existing contacts to merge
      const existing = await prisma.contact.findMany({
        where: { companyId },
        select: { id: true, name: true, email: true, linkedin: true },
      });
      const existingNames = new Set(
        existing.map((c) => c.name?.toLowerCase().trim())
      );
      const existingLinkedins = new Set(
        existing.filter((c) => c.linkedin).map((c) => c.linkedin!.toLowerCase())
      );

      let primarySet = existing.some(
        (c) => true // check later
      );

      const priorityTitles =
        /\b(CEO|Managing Director|General Manager|Sales Director|VP Sales|Head of Sales|Business Development|Commercial Director)\b/i;

      for (const person of apolloPeople) {
        if (!person.name || person.name.length < 3) continue;

        // Skip if already exists (by name or LinkedIn)
        const normalizedName = person.name.toLowerCase().trim();
        if (existingNames.has(normalizedName)) {
          // Update existing contact with Apollo data if it was <UNKNOWN>
          const match = existing.find(
            (c) => c.name?.toLowerCase().trim() === normalizedName
          );
          if (match && !match.linkedin && person.linkedinUrl) {
            await prisma.contact.update({
              where: { id: match.id },
              data: {
                linkedin: person.linkedinUrl,
                ...(person.photoUrl && { photoUrl: person.photoUrl }),
                ...(person.title && { title: person.title }),
                ...(person.seniority && { linkedinSeniority: person.seniority }),
                ...(person.department && { linkedinDepartment: person.department }),
              },
            });
          }
          continue;
        }
        if (person.linkedinUrl && existingLinkedins.has(person.linkedinUrl.toLowerCase())) {
          continue;
        }

        const isPrimary = !primarySet && priorityTitles.test(person.title);
        if (isPrimary) primarySet = true;

        await prisma.contact.create({
          data: {
            companyId,
            name: person.name,
            title: person.title || null,
            linkedin: person.linkedinUrl || null,
            photoUrl: person.photoUrl || null,
            linkedinHeadline: person.title || null,
            linkedinSeniority: person.seniority || null,
            linkedinDepartment: person.department || null,
            isPrimary,
          },
        });
        existingNames.add(normalizedName);
      }
    });

    // Step 8: Waterfall email discovery (for contacts found by Apollo + website)
    await step.run("waterfall-email-discovery", async () => {
      const contactsWithEmail = await prisma.contact.count({
        where: { companyId, email: { not: null } },
      });
      if (contactsWithEmail > 0) return; // Already have email contacts

      const allContacts = await prisma.contact.findMany({
        where: { companyId },
        select: { id: true, name: true, title: true, email: true },
      });

      const updatedCompany = await prisma.company.findUnique({
        where: { id: companyId },
        select: { website: true, name: true },
      });
      if (!updatedCompany?.website) return;

      const { extractDomain, findEmailByPattern, hunterFindEmail, hunterDomainSearch } =
        await import("@agency/scraping");

      const domain = extractDomain(updatedCompany.website);
      if (!domain) return;

      // Level 1: Pattern guessing for named contacts (FREE)
      for (const contact of allContacts) {
        if (contact.email) continue;
        const parts = contact.name?.split(" ") ?? [];
        const firstName = parts[0];
        const lastName = parts.slice(1).join(" ");
        if (!firstName || firstName === "<UNKNOWN>" || firstName.length < 2) continue;

        const guessedEmail = await findEmailByPattern(
          firstName,
          lastName || firstName,
          domain
        );
        if (guessedEmail) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: { email: guessedEmail },
          });
          return; // Found one — enough for outreach
        }
      }

      // Level 2: Hunter.io domain search ($0.10/lookup)
      const hunterResult = await hunterDomainSearch(domain);
      if (hunterResult && hunterResult.emails.length > 0) {
        // Find the best personal email (decision-maker)
        const bestEmail = hunterResult.emails
          .filter((e) => e.type === "personal")
          .sort((a, b) => b.confidence - a.confidence)[0]
          ?? hunterResult.emails[0];

        if (bestEmail) {
          const name = [bestEmail.firstName, bestEmail.lastName]
            .filter(Boolean)
            .join(" ") || "Unknown Contact";

          // Update existing contact or create new one
          if (allContacts.length > 0 && !allContacts[0].email) {
            await prisma.contact.update({
              where: { id: allContacts[0].id },
              data: {
                email: bestEmail.value,
                ...(name !== "Unknown Contact" && { name }),
                ...(bestEmail.position && { title: bestEmail.position }),
              },
            });
          } else {
            await prisma.contact.create({
              data: {
                companyId,
                name,
                title: bestEmail.position,
                email: bestEmail.value,
                isPrimary: true,
              },
            });
          }
          return;
        }
      }

      // Level 3: Hunter.io email finder for named contacts ($0.10/lookup)
      for (const contact of allContacts) {
        if (contact.email) continue;
        const parts = contact.name?.split(" ") ?? [];
        const firstName = parts[0];
        const lastName = parts.slice(1).join(" ");
        if (!firstName || firstName === "<UNKNOWN>" || !lastName) continue;

        const found = await hunterFindEmail(domain, firstName, lastName);
        if (found?.email && found.score >= 50) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: { email: found.email },
          });
          return;
        }
      }

      // Level 4: Fallback — info@domain (FREE)
      if (allContacts.length === 0) {
        await prisma.contact.create({
          data: {
            companyId,
            name: "Partnerships Team",
            title: "General Inquiry",
            email: `info@${domain}`,
            isPrimary: true,
          },
        });
      } else {
        await prisma.contact.update({
          where: { id: allContacts[0].id },
          data: { email: `info@${domain}` },
        });
      }
    });

    // Step 9: Gravatar photo lookup (free)
    await step.run("gravatar-photo-lookup", async () => {
      const { getGravatarUrl } = await import("@agency/scraping");

      const contactsNeedingPhoto = await prisma.contact.findMany({
        where: { companyId, photoUrl: null, email: { not: null } },
        select: { id: true, email: true },
        take: 5,
      });

      for (const contact of contactsNeedingPhoto) {
        if (!contact.email) continue;
        const photoUrl = await getGravatarUrl(contact.email);
        if (photoUrl) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: { photoUrl },
          });
        }
      }
    });

    // Step 10: Trigger scoring
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
