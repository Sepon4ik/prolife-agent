import { prisma } from "@agency/db";

const emailStatusColors: Record<string, string> = {
  QUEUED: "bg-gray-500/20 text-gray-300",
  SENT: "bg-blue-500/20 text-blue-300",
  DELIVERED: "bg-cyan-500/20 text-cyan-300",
  OPENED: "bg-purple-500/20 text-purple-300",
  CLICKED: "bg-indigo-500/20 text-indigo-300",
  REPLIED: "bg-green-500/20 text-green-300",
  BOUNCED: "bg-orange-500/20 text-orange-300",
  FAILED: "bg-red-500/20 text-red-300",
};

const outreachTypeLabels: Record<string, string> = {
  INITIAL: "Initial",
  FOLLOW_UP_1: "Follow-up 1",
  FOLLOW_UP_2: "Follow-up 2",
  FOLLOW_UP_3: "Follow-up 3",
};

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  let emails: any[] = [];
  let dbError: string | null = null;

  try {
    emails = await prisma.email.findMany({
      include: {
        company: { select: { name: true, country: true, priority: true } },
        contact: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  } catch (error: any) {
    dbError = error.message;
    console.error("Outreach DB error:", error);
  }

  const stats = {
    total: emails.length,
    sent: emails.filter((e) => e.status !== "QUEUED" && e.status !== "FAILED")
      .length,
    opened: emails.filter(
      (e) =>
        e.status === "OPENED" ||
        e.status === "CLICKED" ||
        e.status === "REPLIED"
    ).length,
    replied: emails.filter((e) => e.status === "REPLIED").length,
  };

  const openRate =
    stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100) : 0;
  const replyRate =
    stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Outreach</h1>
          <p className="text-gray-400 text-sm mt-1">
            Email campaigns and follow-up tracking
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <MiniStat label="Total Emails" value={String(stats.total)} />
        <MiniStat label="Sent" value={String(stats.sent)} />
        <MiniStat label="Opened" value={String(stats.opened)} />
        <MiniStat label="Replied" value={String(stats.replied)} />
        <MiniStat label="Open Rate" value={`${openRate}%`} highlight />
        <MiniStat label="Reply Rate" value={`${replyRate}%`} highlight />
      </div>

      {dbError && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 text-sm font-medium">Database Error</p>
          <p className="text-red-300/70 text-xs mt-1">{dbError}</p>
        </div>
      )}

      {/* Pipeline funnel */}
      {stats.total > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Pipeline Funnel</h2>
          <div className="bg-dark-secondary rounded-lg p-5 border border-white/10">
            <div className="flex items-end gap-3 h-24">
              <FunnelBar
                label="Sent"
                count={stats.sent}
                total={stats.total}
                color="bg-blue-500"
              />
              <FunnelBar
                label="Opened"
                count={stats.opened}
                total={stats.total}
                color="bg-purple-500"
              />
              <FunnelBar
                label="Replied"
                count={stats.replied}
                total={stats.total}
                color="bg-green-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Emails table */}
      {emails.length === 0 ? (
        <div className="bg-dark-secondary rounded-lg p-12 border border-white/10 text-center">
          <p className="text-gray-400 text-lg mb-2">No outreach emails yet</p>
          <p className="text-gray-500 text-sm">
            Emails will be sent automatically once companies are scored as
            Priority A or B.
          </p>
        </div>
      ) : (
        <div className="bg-dark-secondary rounded-lg border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-gray-400 text-left">
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Sent</th>
                  <th className="px-4 py-3 font-medium">Opened</th>
                  <th className="px-4 py-3 font-medium">Replied</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((email) => (
                  <tr
                    key={email.id}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">
                        {email.company.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {email.company.country}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs">
                      {email.contact ? (
                        <div>
                          <div>{email.contact.name}</div>
                          <div className="text-gray-500">
                            {email.contact.email}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-500">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-400">
                        {outreachTypeLabels[email.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs max-w-[200px] truncate">
                      {email.subject}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs ${
                          emailStatusColors[email.status] ||
                          "bg-gray-500/20 text-gray-300"
                        }`}
                      >
                        {email.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {email.sentAt
                        ? new Date(email.sentAt).toLocaleDateString()
                        : "--"}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {email.openedAt
                        ? new Date(email.openedAt).toLocaleDateString()
                        : "--"}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {email.repliedAt
                        ? new Date(email.repliedAt).toLocaleDateString()
                        : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-dark-secondary rounded-lg px-4 py-3 border border-white/10">
      <p className="text-xs text-gray-400">{label}</p>
      <p
        className={`text-2xl font-bold mt-0.5 ${
          highlight ? "text-primary-400" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function FunnelBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.max((count / total) * 100, 4) : 4;
  return (
    <div className="flex-1 flex flex-col items-center gap-1">
      <span className="text-xs text-gray-400">{count}</span>
      <div
        className={`w-full ${color} rounded-t`}
        style={{ height: `${pct}%`, minHeight: "4px" }}
      />
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}
