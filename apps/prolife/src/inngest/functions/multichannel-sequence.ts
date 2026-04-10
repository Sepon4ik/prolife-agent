import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";
import { generateOutreachEmail } from "@agency/ai";
import {
  sendOutreachEmail,
  pickMailboxWithStatus,
  recordMailboxSend,
} from "@agency/email";
import {
  viewProfile,
  sendConnectionRequest,
  sendMessage,
  checkLinkedInLimit,
} from "@agency/linkedin";

/**
 * Multi-Channel Outreach Sequence.
 *
 * Timeline:
 *   Day -1: View LinkedIn profile (creates curiosity)
 *   Day 0:  Send personalized email
 *   Day 2:  Send LinkedIn connection request
 *   Day 4:  Follow-up email
 *   Day 6:  LinkedIn message (if connected)
 *
 * All LinkedIn actions are rate-limited with hard caps.
 * If a limit is hit, the action is SKIPPED (not retried endlessly).
 * Email continues regardless of LinkedIn limits.
 */
export const multichannelSequence = inngest.createFunction(
  {
    id: "prolife-multichannel-sequence",
    throttle: { limit: 5, period: "1m" },
    retries: 2,
  },
  { event: "prolife/sequence.start" },
  async ({ event, step }) => {
    const { tenantId, companyId, linkedInAccountId } = event.data;

    // KILL SWITCH: refuse to run if outreach is not enabled
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

    // Step 1: Load company + contact data
    const { company, contact } = await step.run("load-data", async () => {
      const company = await prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        include: {
          contacts: {
            where: { isPrimary: true },
            take: 1,
          },
        },
      });

      const contact = company.contacts[0];
      if (!contact) {
        throw new Error(`No primary contact for ${company.name}`);
      }

      return { company, contact };
    });

    const hasLinkedIn = !!contact.linkedin && !!linkedInAccountId;
    const hasEmail = !!contact.email;

    // ── Day -1: LinkedIn Profile View ──
    if (hasLinkedIn) {
      await step.run("linkedin-view-profile", async () => {
        const result = await viewProfile(
          linkedInAccountId,
          contact.id,
          contact.linkedin!
        );

        if (result.success) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: {
              linkedinViewed: true,
              linkedinViewedAt: new Date(),
            },
          });
        }

        return result;
      });
    }

    // Wait 1 day before email
    await step.sleep("wait-for-email", "1d");

    // ── Day 0: Send Email ──
    let emailSent = false;
    if (hasEmail) {
      emailSent = await step.run("send-initial-email", async () => {
        const email = await generateOutreachEmail({
          companyName: company.name,
          contactName: contact.name,
          country: company.country,
          companyType: company.type,
          categories: company.categories,
        });

        const mailboxResult = await pickMailboxWithStatus(prisma, tenantId);
        const mb =
          mailboxResult.status === "selected"
            ? mailboxResult.mailbox
            : mailboxResult.status === "no_mailboxes_configured"
              ? {
                  id: null as string | null,
                  email: "partnerships@prolife-global.net",
                  name: "ProLife Partnership",
                  domain: "prolife-global.net",
                  provider: "resend",
                  apiKey: null,
                }
              : null;

        if (!mb) {
          throw new Error(
            "All managed mailboxes are unavailable (daily limits reached or unhealthy bounce rate)"
          );
        }

        const result = await sendOutreachEmail({
          to: contact.email!,
          subject: email.subject,
          body: email.body,
          from: `${mb.name} <${mb.email}>`,
          replyTo: mb.email,
          apiKey: mb.apiKey ?? undefined,
        });

        await prisma.email.create({
          data: {
            companyId,
            contactId: contact.id,
            mailboxId: mb.id,
            type: "INITIAL",
            status: "SENT",
            subject: email.subject,
            body: email.body,
            sentAt: new Date(),
            messageId: result.messageId,
          },
        });

        if (mb.id) await recordMailboxSend(prisma, mb.id);

        await prisma.company.update({
          where: { id: companyId },
          data: { status: "OUTREACH_SENT" },
        });

        return true;
      });
    }

    // Wait 2 days before LinkedIn connect
    await step.sleep("wait-for-connect", "2d");

    // ── Day 2: LinkedIn Connection Request ──
    if (hasLinkedIn) {
      await step.run("linkedin-connect", async () => {
        // Check if already replied to email — no need to connect
        const hasReply = await prisma.email.findFirst({
          where: { companyId, status: "REPLIED" },
        });
        if (hasReply) return { skipped: true, reason: "Already replied to email" };

        const note = generateConnectionNote(
          contact.name,
          company.name,
          contact.title
        );

        const result = await sendConnectionRequest(
          linkedInAccountId,
          contact.id,
          contact.linkedin!,
          note
        );

        return result;
      });
    }

    // Wait 2 more days before follow-up email
    await step.sleep("wait-for-followup", "2d");

    // ── Day 4: Follow-up Email ──
    if (hasEmail && emailSent) {
      await step.run("send-followup-email", async () => {
        // Check if already replied
        const hasReply = await prisma.email.findFirst({
          where: { companyId, status: "REPLIED" },
        });
        if (hasReply) return { skipped: true };

        const initialEmail = await prisma.email.findFirst({
          where: {
            companyId,
            contactId: contact.id,
            type: "INITIAL",
            status: "SENT",
          },
          orderBy: { sentAt: "desc" },
          select: { subject: true },
        });

        const email = await generateOutreachEmail({
          companyName: company.name,
          contactName: contact.name,
          country: company.country,
          companyType: company.type,
          categories: company.categories,
        });

        const threadBaseSubject = initialEmail?.subject ?? email.subject;
        const followupSubject = threadBaseSubject
          .trim()
          .toLowerCase()
          .startsWith("re:")
          ? threadBaseSubject
          : `Re: ${threadBaseSubject}`;

        const mailboxResult = await pickMailboxWithStatus(prisma, tenantId);
        const mb =
          mailboxResult.status === "selected"
            ? mailboxResult.mailbox
            : mailboxResult.status === "no_mailboxes_configured"
              ? {
                  id: null as string | null,
                  email: "partnerships@prolife-global.net",
                  name: "ProLife Partnership",
                  domain: "prolife-global.net",
                  provider: "resend",
                  apiKey: null,
                }
              : null;

        if (!mb) {
          throw new Error(
            "All managed mailboxes are unavailable (daily limits reached or unhealthy bounce rate)"
          );
        }

        const result = await sendOutreachEmail({
          to: contact.email!,
          subject: followupSubject,
          body: email.body,
          from: `${mb.name} <${mb.email}>`,
          replyTo: mb.email,
          apiKey: mb.apiKey ?? undefined,
        });

        await prisma.email.create({
          data: {
            companyId,
            contactId: contact.id,
            mailboxId: mb.id,
            type: "FOLLOW_UP_1",
            status: "SENT",
            subject: followupSubject,
            body: email.body,
            sentAt: new Date(),
            messageId: result.messageId,
          },
        });

        if (mb.id) await recordMailboxSend(prisma, mb.id);

        return { sent: true };
      });
    }

    // Wait 2 more days before LinkedIn message
    await step.sleep("wait-for-linkedin-msg", "2d");

    // ── Day 6: LinkedIn Message ──
    if (hasLinkedIn) {
      await step.run("linkedin-message", async () => {
        // Check if already replied (email or LinkedIn)
        const hasReply = await prisma.email.findFirst({
          where: { companyId, status: "REPLIED" },
        });
        if (hasReply) return { skipped: true, reason: "Already replied" };

        const msg = generateLinkedInMessage(
          contact.name,
          company.name,
          contact.title
        );

        const result = await sendMessage(
          linkedInAccountId,
          contact.id,
          contact.linkedin!,
          msg
        );

        if (result.success) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: {
              linkedinMessaged: true,
              linkedinMessagedAt: new Date(),
            },
          });
        }

        return result;
      });
    }

    return {
      companyId,
      contactName: contact.name,
      channels: {
        email: hasEmail,
        linkedin: hasLinkedIn,
      },
    };
  }
);

// ── Message Templates ──

function generateConnectionNote(
  contactName: string,
  companyName: string,
  title?: string | null
): string {
  const firstName = contactName.split(" ")[0];
  const templates = [
    `Hi ${firstName}, I noticed ${companyName}'s work in healthcare distribution. Would love to connect and share some insights about the market.`,
    `${firstName}, your background${title ? ` in ${title}` : ""} caught my attention. I work with healthcare companies expanding their brand portfolio — would be great to connect.`,
    `Hi ${firstName}, I'm reaching out to leaders in pharmaceutical distribution. Would love to have you in my network — I share industry insights regularly.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateLinkedInMessage(
  contactName: string,
  companyName: string,
  title?: string | null
): string {
  const firstName = contactName.split(" ")[0];
  return `Hi ${firstName}, thanks for connecting! I wanted to follow up on the email I sent about a potential partnership between ProLife and ${companyName}. We help distributors expand their portfolio with Swiss-quality health products. Would you be open to a quick 15-min call this week?`;
}
