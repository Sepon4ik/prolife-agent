import { prisma } from "@agency/db";
import { AddCompanyForm } from "./add-company-form";

const statusColors: Record<string, string> = {
  RAW: "bg-gray-500/20 text-gray-300",
  ENRICHED: "bg-blue-500/20 text-blue-300",
  SCORED: "bg-purple-500/20 text-purple-300",
  OUTREACH_SENT: "bg-yellow-500/20 text-yellow-300",
  REPLIED: "bg-cyan-500/20 text-cyan-300",
  INTERESTED: "bg-green-500/20 text-green-300",
  NOT_INTERESTED: "bg-red-500/20 text-red-300",
  HANDED_OFF: "bg-emerald-500/20 text-emerald-300",
  DISQUALIFIED: "bg-rose-500/20 text-rose-300",
};

const priorityColors: Record<string, string> = {
  A: "bg-green-500/20 text-green-300 border border-green-500/30",
  B: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  C: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
};

const typeLabels: Record<string, string> = {
  DISTRIBUTOR: "Distributor",
  PHARMACY_CHAIN: "Pharmacy Chain",
  RETAIL: "Retail",
  HYBRID: "Hybrid",
  UNKNOWN: "Unknown",
};

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const companies = await prisma.company.findMany({
    include: {
      contacts: { where: { isPrimary: true }, take: 1 },
      _count: { select: { emails: true } },
    },
    orderBy: [{ priority: "asc" }, { score: "desc" }],
    take: 100,
  });

  const stats = {
    total: companies.length,
    enriched: companies.filter((c) => c.status !== "RAW").length,
    priorityA: companies.filter((c) => c.priority === "A").length,
    interested: companies.filter((c) => c.status === "INTERESTED").length,
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Companies</h1>
          <p className="text-gray-400 text-sm mt-1">
            Discovered distributors and potential partners
          </p>
        </div>
        <AddCompanyForm />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MiniStat label="Total" value={stats.total} />
        <MiniStat label="Enriched" value={stats.enriched} />
        <MiniStat label="Priority A" value={stats.priorityA} />
        <MiniStat label="Interested" value={stats.interested} />
      </div>

      {/* Table */}
      {companies.length === 0 ? (
        <div className="bg-dark-secondary rounded-lg p-12 border border-white/10 text-center">
          <p className="text-gray-400 text-lg mb-2">No companies yet</p>
          <p className="text-gray-500 text-sm">
            Start a scraping job from the Sources page to discover companies.
          </p>
        </div>
      ) : (
        <div className="bg-dark-secondary rounded-lg border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-gray-400 text-left">
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Country</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Emails</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => {
                  const contact = company.contacts[0];
                  return (
                    <tr
                      key={company.id}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">
                          {company.name}
                        </div>
                        {company.website && (
                          <a
                            href={company.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary-400 hover:underline"
                          >
                            {new URL(company.website).hostname}
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {typeLabels[company.type] || company.type}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        <div className="flex items-center gap-1.5">
                          {company.country}
                          {company.geoPriority && (
                            <span className="text-xs text-gray-500">
                              ({company.geoPriority})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                            priorityColors[company.priority]
                          }`}
                        >
                          {company.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-white font-mono">
                          {company.score}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs ${
                            statusColors[company.status] || "bg-gray-500/20 text-gray-300"
                          }`}
                        >
                          {company.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs">
                        {contact ? (
                          <div>
                            <div>{contact.name}</div>
                            {contact.title && (
                              <div className="text-gray-500">
                                {contact.title}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-500">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-center">
                        {company._count.emails}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-dark-secondary rounded-lg px-4 py-3 border border-white/10">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
    </div>
  );
}
