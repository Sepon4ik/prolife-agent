import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";
import { generateOutreachEmail } from "@agency/ai";
import { sendOutreachEmail } from "@agency/email";

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

    // Step 2: Generate personalized email
    const email = await step.run("generate-email", async () => {
      return generateOutreachEmail({
        companyName: company.name,
        contactName: contact.name,
        country: company.country,
        companyType: company.type,
        categories: company.categories,
      });
    });

    // Step 3: Send email
    const sent = await step.run("send-email", async () => {
      const result = await sendOutreachEmail({
        to: contact.email!,
        subject: email.subject,
        body: email.body,
      });

      // Save to DB
      const outreachTypeMap: Record<string, any> = {
        initial: "INITIAL",
        follow_up_1: "FOLLOW_UP_1",
        follow_up_2: "FOLLOW_UP_2",
        follow_up_3: "FOLLOW_UP_3",
      };

      await prisma.email.create({
        data: {
          companyId,
          contactId: contact.id,
          type: outreachTypeMap[type],
          status: "SENT",
          subject: email.subject,
          body: email.body,
          sentAt: new Date(),
          messageId: result.messageId,
        },
      });

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
