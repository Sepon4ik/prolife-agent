/**
 * Mailbox Rotation for Cold Email at Scale.
 *
 * Why: A single mailbox can safely send 30-50 cold emails/day.
 * For 500 emails/day, you need 10-15 mailboxes rotating.
 *
 * Strategy:
 * - Round-robin across active, warmed-up mailboxes
 * - Skip mailboxes that hit daily limit
 * - Skip mailboxes with high bounce rate (>5%)
 * - Track per-mailbox metrics for deliverability dashboard
 */

import { prisma } from "@agency/db";

type PrismaClient = typeof prisma;

export interface MailboxForSending {
  id: string;
  email: string;
  name: string;
  domain: string;
  provider: string;
  apiKey: string | null;
}

/**
 * Pick the next available mailbox for sending.
 * Selection criteria:
 * 1. Active and warmed up
 * 2. Under daily limit
 * 3. Lowest bounce rate
 * 4. Round-robin (least recently used)
 */
export async function pickMailbox(
  prisma: PrismaClient,
  tenantId: string
): Promise<MailboxForSending | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Reset daily counters for mailboxes that haven't been reset today
  await prisma.mailbox.updateMany({
    where: {
      tenantId,
      isActive: true,
      OR: [
        { sentTodayDate: null },
        { sentTodayDate: { lt: today } },
      ],
    },
    data: {
      sentToday: 0,
      sentTodayDate: today,
    },
  });

  // Find best available mailbox
  const mailboxes = await prisma.mailbox.findMany({
    where: {
      tenantId,
      isActive: true,
      isWarmedUp: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      domain: true,
      provider: true,
      apiKey: true,
      dailyLimit: true,
      sentToday: true,
      totalSent: true,
      totalBounced: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "asc" }, // Least recently used first
  });

  for (const mb of mailboxes) {
    // Skip if over daily limit
    if (mb.sentToday >= mb.dailyLimit) continue;

    // Skip if bounce rate > 5% (unhealthy mailbox)
    if (mb.totalSent > 50) {
      const bounceRate = mb.totalBounced / mb.totalSent;
      if (bounceRate > 0.05) continue;
    }

    return {
      id: mb.id,
      email: mb.email,
      name: mb.name,
      domain: mb.domain,
      provider: mb.provider,
      apiKey: mb.apiKey,
    };
  }

  return null; // All mailboxes exhausted for today
}

/**
 * Increment the send counter after an email is sent.
 */
export async function recordMailboxSend(
  prisma: PrismaClient,
  mailboxId: string
): Promise<void> {
  await prisma.mailbox.update({
    where: { id: mailboxId },
    data: {
      sentToday: { increment: 1 },
      totalSent: { increment: 1 },
    },
  });
}

/**
 * Update mailbox metrics from webhook events.
 * Called when Resend webhook reports delivery/open/bounce/complaint.
 */
export async function updateMailboxMetrics(
  prisma: PrismaClient,
  mailboxId: string,
  event: "delivered" | "opened" | "bounced" | "replied" | "complained"
): Promise<void> {
  const fieldMap: Record<string, string> = {
    delivered: "totalDelivered",
    opened: "totalOpened",
    bounced: "totalBounced",
    replied: "totalReplied",
    complained: "totalComplained",
  };

  const field = fieldMap[event];
  if (!field) return;

  await prisma.mailbox.update({
    where: { id: mailboxId },
    data: { [field]: { increment: 1 } },
  });
}
