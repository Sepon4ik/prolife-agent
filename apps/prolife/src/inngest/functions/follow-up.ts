import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";

/**
 * Follow-up Scheduler
 * Runs daily to check companies that need follow-up emails.
 * Triggers outreach for companies without replies.
 */
export const followUp = inngest.createFunction(
  {
    id: "prolife-follow-up-scheduler",
    retries: 2,
  },
  { cron: "0 9 * * 1-5" }, // Mon-Fri at 9:00 AM
  async ({ step }) => {
    // KILL SWITCH: skip if outreach is disabled
    const enabled = await step.run("check-outreach-enabled", async () => {
      const tenant = await prisma.tenant.findFirst({
        select: { outreachEnabled: true },
      });
      return tenant?.outreachEnabled ?? false;
    });
    if (!enabled) {
      return { skipped: true, reason: "Outreach disabled" };
    }

    // Find companies with sent emails but no reply after 5+ days
    const needFollowUp = await step.run("find-companies", async () => {
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

      return prisma.company.findMany({
        where: {
          status: "OUTREACH_SENT",
          emails: {
            some: {
              sentAt: { lte: fiveDaysAgo },
              status: { not: "REPLIED" },
            },
            none: {
              status: "REPLIED",
            },
          },
        },
        include: {
          emails: { orderBy: { createdAt: "desc" }, take: 1 },
          contacts: { where: { isPrimary: true }, take: 1 },
        },
        take: 50,
      });
    });

    // Send follow-up events
    let sent = 0;
    for (const company of needFollowUp) {
      const lastEmail = company.emails[0];
      const contact = company.contacts[0];

      if (!lastEmail || !contact) continue;

      // Determine follow-up type
      let followUpType: string;
      if (lastEmail.type === "INITIAL") followUpType = "follow_up_1";
      else if (lastEmail.type === "FOLLOW_UP_1") followUpType = "follow_up_2";
      else if (lastEmail.type === "FOLLOW_UP_2") followUpType = "follow_up_3";
      else continue; // Max 3 follow-ups

      await step.sendEvent(`follow-up-${company.id}`, {
        name: "prolife/outreach.send",
        data: {
          tenantId: company.tenantId,
          companyId: company.id,
          contactId: contact.id,
          type: followUpType,
        },
      });
      sent++;
    }

    return { checked: needFollowUp.length, followUpsSent: sent };
  }
);
