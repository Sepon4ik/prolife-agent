import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";
import { generateHandoffSummary } from "@agency/ai";
import { sendTelegramMessage } from "@agency/notifications";

/**
 * Sales Handoff
 * When a company is marked INTERESTED, generate an AI summary
 * and notify the sales team via Telegram.
 */
export const salesHandoff = inngest.createFunction(
  {
    id: "prolife-sales-handoff",
    retries: 2,
  },
  { event: "prolife/sales.handoff" },
  async ({ event, step }) => {
    const { companyId } = event.data;

    // Step 1: Gather all data
    const data = await step.run("gather-data", async () => {
      const company = await prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        include: {
          contacts: { orderBy: { isPrimary: "desc" }, take: 3 },
          emails: {
            orderBy: { createdAt: "asc" },
            take: 10,
          },
        },
      });

      return {
        company: {
          name: company.name,
          country: company.country,
          type: company.type,
          score: company.score,
          priority: company.priority,
          categories: company.categories,
          website: company.website,
          estimatedRevenue: company.estimatedRevenue,
          pharmacyCount: company.pharmacyCount,
        },
        contact: company.contacts[0] ?? null,
        emails: company.emails.map((e) => ({
          type: e.type,
          subject: e.subject,
          body: e.body,
          replyBody: e.replyBody,
          sentAt: e.sentAt,
          repliedAt: e.repliedAt,
        })),
      };
    });

    // Step 2: Generate AI summary
    const summary = await step.run("generate-summary", async () => {
      return generateHandoffSummary(data);
    });

    // Step 3: Send Telegram notification
    const telegramResult = await step.run("send-telegram", async () => {
      const header = `🔥 <b>NEW HOT LEAD</b>\n\n`;
      const message = header + summary;

      return sendTelegramMessage(message);
    });

    // Step 4: Send Slack notification (if configured)
    await step.run("send-slack", async () => {
      const slackUrl = process.env.SLACK_WEBHOOK_URL;
      if (!slackUrl) return { skipped: true };

      try {
        await fetch(slackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `🔥 *NEW HOT LEAD: ${data.company.name}* (${data.company.country})\nScore: ${data.company.score}/100 | Priority: ${data.company.priority}\n\n${summary.replace(/<[^>]+>/g, "")}`,
          }),
        });
        return { sent: true };
      } catch (e) {
        console.error("[Slack] Failed to send:", e);
        return { error: true };
      }
    });

    // Step 5: Update company status to HANDED_OFF
    await step.run("update-status", async () => {
      await prisma.company.update({
        where: { id: companyId },
        data: { status: "HANDED_OFF" },
      });
    });

    return {
      companyId,
      company: data.company.name,
      telegramSent: telegramResult.ok,
      status: "HANDED_OFF",
    };
  }
);
