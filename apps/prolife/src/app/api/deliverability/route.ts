import { NextResponse } from "next/server";
import { prisma } from "@agency/db";
import { checkDnsHealth, calculateMailboxHealth } from "@agency/email";

/**
 * GET /api/deliverability
 * Returns mailbox health metrics and domain DNS status.
 * Used by the deliverability dashboard.
 */
export async function GET() {
  try {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      return NextResponse.json({ error: "No tenant" }, { status: 404 });
    }

    // Get all mailboxes with their metrics
    const mailboxes = await prisma.mailbox.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
    });

    // Calculate health for each mailbox
    const mailboxHealth = mailboxes.map((mb) => calculateMailboxHealth(mb));

    // Check DNS health for unique domains
    const uniqueDomains = [...new Set(mailboxes.map((mb) => mb.domain))];
    const dnsResults = await Promise.all(
      uniqueDomains.map((domain) => checkDnsHealth(domain))
    );

    // Update DNS health in DB (async, don't block response)
    for (const dns of dnsResults) {
      prisma.mailbox
        .updateMany({
          where: { tenantId: tenant.id, domain: dns.domain },
          data: {
            hasSPF: dns.spf.found && dns.spf.valid,
            hasDKIM: dns.dkim.found && dns.dkim.valid,
            hasDMARC: dns.dmarc.found && dns.dmarc.valid,
            lastDnsCheck: new Date(),
          },
        })
        .catch(() => {}); // Fire and forget
    }

    // Aggregate stats
    const totals = mailboxes.reduce(
      (acc, mb) => ({
        totalSent: acc.totalSent + mb.totalSent,
        totalDelivered: acc.totalDelivered + mb.totalDelivered,
        totalOpened: acc.totalOpened + mb.totalOpened,
        totalBounced: acc.totalBounced + mb.totalBounced,
        totalReplied: acc.totalReplied + mb.totalReplied,
        totalComplained: acc.totalComplained + mb.totalComplained,
      }),
      {
        totalSent: 0,
        totalDelivered: 0,
        totalOpened: 0,
        totalBounced: 0,
        totalReplied: 0,
        totalComplained: 0,
      }
    );

    const s = totals.totalSent || 1;

    return NextResponse.json({
      summary: {
        ...totals,
        deliveryRate: totals.totalDelivered / s,
        openRate: totals.totalOpened / s,
        bounceRate: totals.totalBounced / s,
        replyRate: totals.totalReplied / s,
        complaintRate: totals.totalComplained / s,
        mailboxCount: mailboxes.length,
        activeMailboxes: mailboxes.filter((mb) => mb.isActive).length,
        dailyCapacity: mailboxes
          .filter((mb) => mb.isActive && mb.isWarmedUp)
          .reduce((sum, mb) => sum + mb.dailyLimit, 0),
      },
      mailboxes: mailboxHealth,
      dns: dnsResults,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
