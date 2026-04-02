import { prisma } from "@agency/db";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

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

const priorityConfig: Record<string, { label: string; color: string }> = {
  A: { label: "Hot", color: "bg-green-500/10 text-green-400 border-green-500/30" },
  B: { label: "Warm", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" },
  C: { label: "Cold", color: "bg-gray-500/10 text-gray-400 border-gray-500/30" },
};

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

export default async function CompanyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const company = await prisma.company.findUnique({
    where: { id: params.id },
    include: {
      contacts: { orderBy: { isPrimary: "desc" } },
      emails: {
        orderBy: { createdAt: "desc" },
        include: {
          contact: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!company) return notFound();

  const pcfg = priorityConfig[company.priority] ?? priorityConfig.C;

  return (
    <div className="p-6 lg:p-8 max-w-[1200px]">
      {/* Back link */}
      <Link
        href="/dashboard/companies"
        className="text-sm text-gray-500 hover:text-gray-300 mb-4 inline-block"
      >
        &larr; Back to Pipeline
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{company.name}</h1>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded border ${pcfg.color}`}
            >
              {pcfg.label}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${statusColors[company.status]}`}
            >
              {company.status}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {company.country}
            {company.city ? `, ${company.city}` : ""}
            {company.website && (
              <>
                {" · "}
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-400 hover:text-primary-300"
                >
                  {company.website.replace("https://", "")}
                </a>
              </>
            )}
          </p>
        </div>
        {/* Score circle */}
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold border-2 ${
            company.score >= 70
              ? "border-green-500/50 text-green-400 bg-green-500/10"
              : company.score >= 40
                ? "border-yellow-500/50 text-yellow-400 bg-yellow-500/10"
                : "border-gray-500/50 text-gray-400 bg-gray-500/10"
          }`}
        >
          {company.score}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Company info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Company details */}
          <div className="bg-dark-secondary rounded-xl border border-white/5 p-5">
            <h2 className="text-sm font-semibold text-white mb-3">
              Company Profile
            </h2>
            <div className="space-y-2.5 text-sm">
              <InfoRow label="Type" value={company.type} />
              <InfoRow label="Revenue" value={company.estimatedRevenue ?? "Unknown"} />
              <InfoRow label="Source" value={`${company.source}${company.sourceExhibition ? ` · ${company.sourceExhibition}` : ""}`} />
              <InfoRow label="Geo Priority" value={company.geoPriority ?? "Not set"} />

              {company.categories.length > 0 && (
                <div>
                  <span className="text-gray-500 text-xs">Categories</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {company.categories.map((cat) => (
                      <span
                        key={cat}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {company.portfolioBrands.length > 0 && (
                <div>
                  <span className="text-gray-500 text-xs">Portfolio Brands</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {company.portfolioBrands.map((brand) => (
                      <span
                        key={brand}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-400"
                      >
                        {brand}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Capabilities */}
          <div className="bg-dark-secondary rounded-xl border border-white/5 p-5">
            <h2 className="text-sm font-semibold text-white mb-3">
              Capabilities
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <Capability label="E-commerce" active={company.hasEcommerce} />
              <Capability label="Sales Team" active={company.hasSalesTeam} />
              <Capability label="Marketing" active={company.hasMarketingTeam} />
              <Capability label="Med Reps" active={company.hasMedReps} />
              <Capability label="Seeking Brands" active={company.activelySeekingBrands} />
              {company.pharmacyCount && (
                <div className="col-span-2 text-xs text-gray-400">
                  Pharmacies: {company.pharmacyCount}
                </div>
              )}
            </div>
          </div>

          {/* Contacts */}
          <div className="bg-dark-secondary rounded-xl border border-white/5 p-5">
            <h2 className="text-sm font-semibold text-white mb-3">
              Contacts ({company.contacts.length})
            </h2>
            {company.contacts.length === 0 ? (
              <p className="text-gray-500 text-xs">No contacts found</p>
            ) : (
              <div className="space-y-3">
                {company.contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="p-3 rounded-lg bg-white/[0.02] border border-white/5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {contact.name}
                      </span>
                      {contact.isPrimary && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-primary-500/20 text-primary-400">
                          PRIMARY
                        </span>
                      )}
                    </div>
                    {contact.title && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {contact.title}
                      </div>
                    )}
                    {contact.email && (
                      <div className="text-xs text-gray-400 mt-1">
                        {contact.email}
                      </div>
                    )}
                    {contact.phone && (
                      <div className="text-xs text-gray-500">
                        {contact.phone}
                      </div>
                    )}
                    {contact.linkedin && (
                      <a
                        href={contact.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 mt-1 block"
                      >
                        LinkedIn
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column — Email history */}
        <div className="lg:col-span-2">
          <div className="bg-dark-secondary rounded-xl border border-white/5 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">
              Email History ({company.emails.length})
            </h2>
            {company.emails.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-sm">
                  No emails sent to this company yet
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {company.emails.map((email) => (
                  <div
                    key={email.id}
                    className="border border-white/5 rounded-lg overflow-hidden"
                  >
                    {/* Email header */}
                    <div className="bg-white/[0.02] px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-300">
                            {email.type.replace("_", " ")}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${emailStatusColors[email.status]}`}
                          >
                            {email.status}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-white mt-1">
                          {email.subject}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          To: {email.contact?.name ?? "Unknown"}{" "}
                          &lt;{email.contact?.email ?? "N/A"}&gt;
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-600">
                        {email.sentAt
                          ? new Date(email.sentAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Not sent"}
                      </div>
                    </div>

                    {/* Email body */}
                    <div className="px-4 py-3">
                      <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                        {email.body}
                      </pre>
                    </div>

                    {/* Reply */}
                    {email.replyBody && (
                      <div className="border-t border-white/5 bg-green-500/5 px-4 py-3">
                        <div className="text-xs text-green-400 font-medium mb-1">
                          Reply{" "}
                          {email.repliedAt &&
                            `· ${new Date(email.repliedAt).toLocaleDateString()}`}
                        </div>
                        <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">
                          {email.replyBody}
                        </pre>
                      </div>
                    )}

                    {/* Timestamps */}
                    <div className="px-4 py-2 bg-white/[0.01] flex gap-4 text-[10px] text-gray-600">
                      {email.sentAt && (
                        <span>Sent: {new Date(email.sentAt).toLocaleString()}</span>
                      )}
                      {email.openedAt && (
                        <span className="text-purple-400">
                          Opened: {new Date(email.openedAt).toLocaleString()}
                        </span>
                      )}
                      {email.repliedAt && (
                        <span className="text-green-400">
                          Replied: {new Date(email.repliedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          {company.description && (
            <div className="bg-dark-secondary rounded-xl border border-white/5 p-5 mt-6">
              <h2 className="text-sm font-semibold text-white mb-2">
                Description
              </h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                {company.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className="text-gray-300 text-xs">{value}</span>
    </div>
  );
}

function Capability({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-2 h-2 rounded-full ${active ? "bg-green-500" : "bg-gray-600"}`}
      />
      <span className={`text-xs ${active ? "text-gray-300" : "text-gray-600"}`}>
        {label}
      </span>
    </div>
  );
}
