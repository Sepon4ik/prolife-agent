import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";
import { generateOutreachEmail } from "@agency/ai";
import {
  sendOutreachEmail,
  pickMailboxWithStatus,
  recordMailboxSend,
} from "@agency/email";

/**
 * Send Outreach Email
 * Generates a personalized email using AI and sends via SES.
 * Schedules follow-up if no reply after 5 days.
 */
export const sendOutreach = inngest.createFunction(
  {
    id: "prolife-send-outreach",
    throttle: { limit: 10, period: "1m" }, // Rate limit emails
    retries: 3,
  },
  { event: "prolife/outreach.send" },
  async ({ event, step }) => {
    const { tenantId, companyId, type } = event.data;

    // KILL SWITCH: refuse to send if outreach is not enabled
    await step.run("check-outreach-enabled", async () => {
      const tenant = await prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { outreachEnabled: true },
      });
      if (!tenant.outreachEnabled) {
        throw new Error(
          "Outreach is disabled for this tenant. Enable it in settings before sending."
        );
      }
    });

    // Step 1: Get company and contact
    const { company, contact } = await step.run("get-data", async () => {
      const company = await prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        include: {
          contacts: { where: { isPrimary: true }, take: 1 },
        },
      });

      const contact = company.contacts[0];
      if (!contact?.email) {
        throw new Error(`No contact email for company ${company.name}`);
      }

      return { company, contact };
    });

    // Step 2: Fetch latest news about this company for personalization
    const newsContext = await step.run("fetch-news-context", async () => {
      const latestNews = await prisma.newsItem.findFirst({
        where: {
          companyId,
          relevanceScore: { gte: 50 },
          createdAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) }, // last 60 days
        },
        orderBy: { relevanceScore: "desc" },
        select: {
          title: true,
          category: true,
          summary: true,
          publishedAt: true,
        },
      });
      if (!latestNews) return null;
      return {
        title: latestNews.title,
        category: latestNews.category,
        summary: latestNews.summary,
        publishedAt: latestNews.publishedAt?.toISOString().split("T")[0] ?? null,
      };
    });

    // Step 3: Generate personalized email
    const email = await step.run("generate-email", async () => {
      return generateOutreachEmail({
        companyName: company.name,
        contactName: contact.name,
        country: company.country,
        companyType: company.type,
        categories: company.categories,
        newsContext: newsContext ?? undefined,
      });
    });

    // Step 4: Pick mailbox (rotation)
    const mailbox = await step.run("pick-mailbox", async () => {
      const result = await pickMailboxWithStatus(prisma, tenantId);
      if (result.status === "selected") {
        return result.mailbox;
      }

      // Fallback only when no managed mailboxes exist.
      if (result.status === "no_mailboxes_configured") {
        return {
          id: null as string | null,
          email: "partnerships@prolife-global.net",
          name: "ProLife Partnership",
          domain: "prolife-global.net",
          provider: "resend",
          apiKey: null,
        };
      }

      throw new Error(
        "All managed mailboxes are unavailable (daily limits reached or unhealthy bounce rate)"
      );
    });

    // Step 5: Send email via selected mailbox
    const sent = await step.run("send-email", async () => {
      const fromAddress = `${mailbox.name} <${mailbox.email}>`;

      const result = await sendOutreachEmail({
        to: contact.email!,
        subject: email.subject,
        body: email.body,
        from: fromAddress,
        replyTo: mailbox.email,
        apiKey: mailbox.apiKey ?? undefined,
      });

      const outreachTypeMap = {
        initial: "INITIAL",
        follow_up_1: "FOLLOW_UP_1",
        follow_up_2: "FOLLOW_UP_2",
        follow_up_3: "FOLLOW_UP_3",
      } as const;

      const emailType = outreachTypeMap[type as keyof typeof outreachTypeMap] ?? "INITIAL";

      await prisma.email.create({
        data: {
          companyId,
          contactId: contact.id,
          mailboxId: mailbox.id,
          type: emailType,
          status: "SENT",
          subject: email.subject,
          body: email.body,
          sentAt: new Date(),
          messageId: result.messageId,
        },
      });

      // Update mailbox send counter
      if (mailbox.id) {
        await recordMailboxSend(prisma, mailbox.id);
      }

      await prisma.company.update({
        where: { id: companyId },
        data: { status: "OUTREACH_SENT" },
      });

      return result;
    });

    // Auto follow-up disabled — manual trigger only.
    // When ready: uncomment to auto-send follow-up after 5 days.
    //
    // if (type === "initial") {
    //   await step.sleep("wait-for-reply", "5d");
    //   const hasReply = await step.run("check-reply", async () => {
    //     const reply = await prisma.email.findFirst({
    //       where: { companyId, status: "REPLIED" },
    //     });
    //     return !!reply;
    //   });
    //   if (!hasReply) {
    //     await step.sendEvent("schedule-follow-up", {
    //       name: "prolife/outreach.send",
    //       data: { tenantId, companyId, contactId: contact.id, type: "follow_up_1" },
    //     });
    //   }
    // }

    return { sent: true, messageId: sent.messageId };
  }
);
