/**
 * Deliverability Health Checks.
 *
 * Checks domain DNS configuration (SPF, DKIM, DMARC)
 * and calculates per-mailbox health scores.
 * Uses DNS-over-HTTPS (serverless-compatible, no raw DNS).
 */

// ── Types ──

export interface DnsHealthResult {
  domain: string;
  spf: { found: boolean; record?: string; valid: boolean };
  dkim: { found: boolean; valid: boolean };
  dmarc: { found: boolean; record?: string; policy?: string; valid: boolean };
  mx: { found: boolean; records: string[] };
}

export interface MailboxHealth {
  id: string;
  email: string;
  domain: string;
  isActive: boolean;
  isWarmedUp: boolean;
  dailyLimit: number;
  sentToday: number;
  metrics: {
    totalSent: number;
    totalDelivered: number;
    totalOpened: number;
    totalBounced: number;
    totalReplied: number;
    totalComplained: number;
    deliveryRate: number;
    openRate: number;
    bounceRate: number;
    replyRate: number;
    complaintRate: number;
  };
  health: "good" | "warning" | "critical";
  issues: string[];
}

// ── DNS Health Checks (via DNS-over-HTTPS) ──

async function queryDns(
  domain: string,
  type: string
): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`,
      {
        headers: { Accept: "application/dns-json" },
        signal: controller.signal,
      }
    );

    if (!res.ok) return [];

    const data = (await res.json()) as {
      Answer?: Array<{ data?: string }>;
    };

    return (data.Answer ?? [])
      .map((a) => a.data ?? "")
      .filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check DNS health for a domain (SPF, DKIM, DMARC, MX).
 * Serverless-compatible — uses Google DNS-over-HTTPS.
 */
export async function checkDnsHealth(domain: string): Promise<DnsHealthResult> {
  // Run all checks in parallel
  const [txtRecords, dmarcRecords, mxRecords, dkimRecords] = await Promise.all([
    queryDns(domain, "TXT"),
    queryDns(`_dmarc.${domain}`, "TXT"),
    queryDns(domain, "MX"),
    // Check common DKIM selectors
    Promise.any([
      queryDns(`google._domainkey.${domain}`, "TXT"),
      queryDns(`resend._domainkey.${domain}`, "TXT"),
      queryDns(`default._domainkey.${domain}`, "TXT"),
      queryDns(`selector1._domainkey.${domain}`, "TXT"),
      queryDns(`k1._domainkey.${domain}`, "TXT"),
    ]).catch(() => [] as string[]),
  ]);

  // SPF check
  const spfRecord = txtRecords.find((r) =>
    r.toLowerCase().includes("v=spf1")
  );
  const spfValid = spfRecord
    ? !spfRecord.includes("-all") || spfRecord.includes("include:")
    : false;

  // DMARC check
  const dmarcRecord = dmarcRecords.find((r) =>
    r.toLowerCase().includes("v=dmarc1")
  );
  const dmarcPolicy = dmarcRecord
    ? dmarcRecord.match(/p=(\w+)/)?.[1]
    : undefined;

  // DKIM check
  const dkimFound = dkimRecords.length > 0;

  // MX check
  const mxList = mxRecords.map((r) =>
    r.replace(/^\d+\s+/, "").replace(/\.$/, "")
  );

  return {
    domain,
    spf: {
      found: !!spfRecord,
      record: spfRecord ? spfRecord.replace(/^"|"$/g, "") : undefined,
      valid: spfValid,
    },
    dkim: { found: dkimFound, valid: dkimFound },
    dmarc: {
      found: !!dmarcRecord,
      record: dmarcRecord ? dmarcRecord.replace(/^"|"$/g, "") : undefined,
      policy: dmarcPolicy,
      valid: !!dmarcRecord,
    },
    mx: { found: mxList.length > 0, records: mxList },
  };
}

/**
 * Calculate health status for a mailbox based on its metrics.
 */
export function calculateMailboxHealth(mailbox: {
  id: string;
  email: string;
  domain: string;
  isActive: boolean;
  isWarmedUp: boolean;
  dailyLimit: number;
  sentToday: number;
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalBounced: number;
  totalReplied: number;
  totalComplained: number;
}): MailboxHealth {
  const s = mailbox.totalSent || 1; // avoid division by zero

  const metrics = {
    totalSent: mailbox.totalSent,
    totalDelivered: mailbox.totalDelivered,
    totalOpened: mailbox.totalOpened,
    totalBounced: mailbox.totalBounced,
    totalReplied: mailbox.totalReplied,
    totalComplained: mailbox.totalComplained,
    deliveryRate: mailbox.totalDelivered / s,
    openRate: mailbox.totalOpened / s,
    bounceRate: mailbox.totalBounced / s,
    replyRate: mailbox.totalReplied / s,
    complaintRate: mailbox.totalComplained / s,
  };

  const issues: string[] = [];

  // Check thresholds
  if (metrics.bounceRate > 0.05)
    issues.push(`Bounce rate ${(metrics.bounceRate * 100).toFixed(1)}% (max 5%)`);
  if (metrics.complaintRate > 0.003)
    issues.push(`Complaint rate ${(metrics.complaintRate * 100).toFixed(2)}% (max 0.3%)`);
  if (metrics.deliveryRate < 0.9 && mailbox.totalSent > 20)
    issues.push(`Delivery rate ${(metrics.deliveryRate * 100).toFixed(1)}% (min 90%)`);
  if (metrics.openRate < 0.3 && mailbox.totalSent > 50)
    issues.push(`Open rate ${(metrics.openRate * 100).toFixed(1)}% (min 30%)`);
  if (!mailbox.isWarmedUp) issues.push("Not warmed up");

  let health: "good" | "warning" | "critical" = "good";
  if (metrics.complaintRate > 0.003 || metrics.bounceRate > 0.1) {
    health = "critical";
  } else if (issues.length > 0) {
    health = "warning";
  }

  return {
    id: mailbox.id,
    email: mailbox.email,
    domain: mailbox.domain,
    isActive: mailbox.isActive,
    isWarmedUp: mailbox.isWarmedUp,
    dailyLimit: mailbox.dailyLimit,
    sentToday: mailbox.sentToday,
    metrics,
    health,
    issues,
  };
}
