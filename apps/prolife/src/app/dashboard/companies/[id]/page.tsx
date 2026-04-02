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

// Scoring factors — mirrors score-company.ts logic
function calculateScoreBreakdown(company: any) {
  const GEO_PRIORITY: Record<string, number> = {
    Indonesia: 20, Pakistan: 20, Bangladesh: 20, Philippines: 20,
    Vietnam: 20, "United Arab Emirates": 20, UAE: 20,
    Thailand: 15, Turkey: 15, "South Korea": 15, Malaysia: 15,
    Singapore: 10, "Sri Lanka": 10, Nepal: 10, Romania: 10,
    "Czech Republic": 10, Hungary: 10, Austria: 10, Netherlands: 10,
    Nigeria: 10, Kenya: 10, "South Africa": 10,
  };

  const factors = [
    { label: "Geography", max: 20, value: GEO_PRIORITY[company.country] ?? 0, detail: company.country || "Unknown" },
    { label: "Company Type", max: 15, value: company.type === "DISTRIBUTOR" ? 15 : company.type === "HYBRID" ? 12 : company.type === "PHARMACY_CHAIN" ? 10 : company.type === "RETAIL" ? 5 : 0, detail: company.type },
    { label: "Revenue", max: 15, value: company.estimatedRevenue === "10m_plus" ? 15 : company.estimatedRevenue === "2m_10m" ? 10 : company.estimatedRevenue === "under_2m" ? 3 : 0, detail: company.estimatedRevenue ?? "Unknown" },
    { label: "E-commerce", max: 5, value: company.hasEcommerce ? 5 : 0, detail: company.hasEcommerce ? "Yes" : "No" },
    { label: "Sales Team", max: 10, value: company.hasSalesTeam ? 10 : 0, detail: company.hasSalesTeam ? "Yes" : "No" },
    { label: "Med Reps", max: 10, value: company.hasMedReps ? 10 : 0, detail: company.hasMedReps ? "Yes" : "No" },
    { label: "Marketing", max: 5, value: company.hasMarketingTeam ? 5 : 0, detail: company.hasMarketingTeam ? "Yes" : "No" },
    { label: "Pharmacies", max: 10, value: (company.pharmacyCount ?? 0) >= 300 ? 10 : (company.pharmacyCount ?? 0) >= 100 ? 5 : 0, detail: company.pharmacyCount ? `${company.pharmacyCount} outlets` : "Unknown" },
    { label: "Seeking Brands", max: 5, value: company.activelySeekingBrands ? 5 : 0, detail: company.activelySeekingBrands ? "Yes" : "No" },
    { label: "Portfolio", max: 5, value: company.portfolioBrands.length >= 10 ? 5 : company.portfolioBrands.length >= 5 ? 3 : 0, detail: `${company.portfolioBrands.length} brands` },
  ];

  return factors;
}

function generateAISummary(company: any): string {
  const strengths: string[] = [];
  const concerns: string[] = [];

  if (company.type === "DISTRIBUTOR") strengths.push("established distribution network");
  if (company.type === "PHARMACY_CHAIN") strengths.push("direct pharmacy access");
  if (company.hasEcommerce) strengths.push("e-commerce presence");
  if (company.hasSalesTeam) strengths.push("dedicated sales team");
  if (company.hasMedReps) strengths.push("medical representatives");
  if (company.activelySeekingBrands) strengths.push("actively looking for new brand partners");
  if (company.pharmacyCount && company.pharmacyCount >= 100) strengths.push(`${company.pharmacyCount} pharmacy outlets`);
  if (company.portfolioBrands.length >= 5) strengths.push(`diverse portfolio (${company.portfolioBrands.length} brands)`);

  const prolifeCategories = ["vitamins", "supplements", "dermo-cosmetics", "baby", "children", "medical devices", "home medical"];
  const overlap = company.categories.filter((c: string) =>
    prolifeCategories.some(pc => c.toLowerCase().includes(pc))
  );
  if (overlap.length > 0) strengths.push(`handles ProLife-relevant categories (${overlap.join(", ")})`);

  if (!company.hasEcommerce) concerns.push("no e-commerce channel");
  if (!company.hasSalesTeam) concerns.push("no dedicated sales team identified");
  if (company.estimatedRevenue === "unknown") concerns.push("revenue data unavailable");
  if (company.portfolioBrands.length === 0) concerns.push("no known brand portfolio");

  let summary = `${company.name} is a ${company.type.toLowerCase().replace("_", " ")} in ${company.country || "an unidentified market"}`;

  if (strengths.length > 0) {
    summary += ` with ${strengths.slice(0, 3).join(", ")}`;
    if (strengths.length > 3) summary += `, and ${strengths.length - 3} more strengths`;
    summary += ".";
  } else {
    summary += ".";
  }

  if (overlap.length > 0) {
    summary += ` Their product focus directly aligns with ProLife's portfolio.`;
  }

  if (concerns.length > 0 && concerns.length <= 2) {
    summary += ` Note: ${concerns.join(", ")}.`;
  }

  return summary;
}

function getNextActions(company: any, emailCount: number, hasContacts: boolean): { action: string; urgency: "high" | "medium" | "low" }[] {
  const actions: { action: string; urgency: "high" | "medium" | "low" }[] = [];

  if (!hasContacts) {
    actions.push({ action: "Find decision-maker contacts", urgency: "high" });
  } else if (emailCount === 0 && company.status === "SCORED") {
    actions.push({ action: "Send initial outreach email", urgency: "high" });
  }

  if (company.status === "REPLIED") {
    actions.push({ action: "Review reply and classify interest", urgency: "high" });
  }

  if (company.status === "INTERESTED") {
    actions.push({ action: "Schedule call with sales team", urgency: "high" });
  }

  if (company.status === "OUTREACH_SENT") {
    actions.push({ action: "Wait for reply or send follow-up", urgency: "medium" });
  }

  if (company.portfolioBrands.length > 0) {
    actions.push({ action: "Analyze competitor brand overlap", urgency: "low" });
  }

  const contactsWithoutEmail = company.contacts?.filter((c: any) => !c.email) ?? [];
  if (contactsWithoutEmail.length > 0) {
    actions.push({ action: `Find email for ${contactsWithoutEmail.length} contact(s)`, urgency: "medium" });
  }

  if (actions.length === 0) {
    actions.push({ action: "Research company website for more intel", urgency: "low" });
  }

  return actions.slice(0, 4);
}

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
  const scoreBreakdown = calculateScoreBreakdown(company);
  const aiSummary = generateAISummary(company);
  const hasContactsWithEmail = company.contacts.some(c => c.email);
  const nextActions = getNextActions(company, company.emails.length, hasContactsWithEmail);

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      {/* Back link */}
      <Link
        href="/dashboard/companies"
        className="text-xs text-gray-500 hover:text-gray-300 mb-4 inline-block"
      >
        &larr; Back to Pipeline
      </Link>

      {/* === HEADER === */}
      <div className="bg-dark-secondary rounded-xl border border-white/5 p-5 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white">{company.name}</h1>
              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${pcfg.color}`}>
                {pcfg.label}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded ${statusColors[company.status]}`}>
                {company.status}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              {company.type.replace("_", " ")}
              {company.country ? ` · ${company.country}` : ""}
              {company.city ? `, ${company.city}` : ""}
              {company.website && (
                <>
                  {" · "}
                  <a href={company.website} target="_blank" rel="noopener noreferrer"
                    className="text-primary-400 hover:text-primary-300">
                    {company.website.replace("https://", "").replace("http://", "")}
                  </a>
                </>
              )}
            </p>
          </div>
          {/* Score */}
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold border-2 shrink-0 ${
            company.score >= 70 ? "border-green-500/50 text-green-400 bg-green-500/10"
              : company.score >= 40 ? "border-yellow-500/50 text-yellow-400 bg-yellow-500/10"
                : "border-gray-500/50 text-gray-400 bg-gray-500/10"
          }`}>
            {company.score}
          </div>
        </div>

        {/* AI Summary */}
        <div className="mt-4 p-3 rounded-lg bg-primary-600/5 border border-primary-600/10">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />
            <span className="text-[10px] text-primary-400 uppercase tracking-wider font-medium">AI Insight</span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">{aiSummary}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* === LEFT SIDEBAR === */}
        <div className="space-y-5">
          {/* Score Breakdown */}
          <div className="bg-dark-secondary rounded-xl border border-white/5 p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Score Breakdown</h2>
            <div className="space-y-2">
              {scoreBreakdown.map((factor) => (
                <div key={factor.label}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-gray-400">{factor.label}</span>
                    <span className="text-gray-500">
                      {factor.value}/{factor.max}
                      <span className="text-gray-600 ml-1">· {factor.detail}</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        factor.value === factor.max ? "bg-green-500" :
                        factor.value > 0 ? "bg-yellow-500" : "bg-gray-600"
                      }`}
                      style={{ width: `${(factor.value / factor.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-white/5 flex justify-between">
              <span className="text-xs text-gray-400">Total</span>
              <span className="text-sm font-bold text-white">{company.score}/100</span>
            </div>
          </div>

          {/* Next Actions */}
          <div className="bg-dark-secondary rounded-xl border border-white/5 p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Recommended Actions</h2>
            <div className="space-y-2">
              {nextActions.map((action, i) => {
                const urgencyColors = {
                  high: "border-red-500/20 bg-red-500/5 text-red-400",
                  medium: "border-yellow-500/20 bg-yellow-500/5 text-yellow-400",
                  low: "border-gray-500/20 bg-gray-500/5 text-gray-400",
                };
                return (
                  <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${urgencyColors[action.urgency]}`}>
                    <span className="text-xs font-medium">{i + 1}.</span>
                    <span className="text-xs">{action.action}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Company Profile */}
          <div className="bg-dark-secondary rounded-xl border border-white/5 p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Company Profile</h2>
            <div className="space-y-2 text-sm">
              <InfoRow label="Type" value={company.type.replace("_", " ")} />
              <InfoRow label="Revenue" value={company.estimatedRevenue ?? "Unknown"} />
              <InfoRow label="Source" value={`${company.source}${company.sourceExhibition ? ` · ${company.sourceExhibition}` : ""}`} />
              <InfoRow label="Geo Priority" value={company.geoPriority ?? "Not set"} />
              {company.pharmacyCount && <InfoRow label="Pharmacies" value={String(company.pharmacyCount)} />}

              {company.categories.length > 0 && (
                <div className="pt-2">
                  <span className="text-gray-500 text-xs">Categories</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {company.categories.map((cat) => (
                      <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400">{cat}</span>
                    ))}
                  </div>
                </div>
              )}

              {company.portfolioBrands.length > 0 && (
                <div className="pt-2">
                  <span className="text-gray-500 text-xs">Portfolio Brands</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {company.portfolioBrands.map((brand) => {
                      const brandInfo = (company.portfolioBrandInfo as Record<string, string> | null)?.[brand];
                      return (
                        <span
                          key={brand}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-400 relative group cursor-help"
                        >
                          {brand}
                          {brandInfo && (
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-dark text-gray-200 text-[11px] leading-relaxed whitespace-nowrap border border-white/10 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 max-w-[250px] whitespace-normal">
                              {brandInfo}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Capabilities */}
          <div className="bg-dark-secondary rounded-xl border border-white/5 p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Capabilities</h2>
            <div className="grid grid-cols-2 gap-2">
              <Capability label="E-commerce" active={company.hasEcommerce} />
              <Capability label="Sales Team" active={company.hasSalesTeam} />
              <Capability label="Marketing" active={company.hasMarketingTeam} />
              <Capability label="Med Reps" active={company.hasMedReps} />
              <Capability label="Seeking Brands" active={company.activelySeekingBrands} />
            </div>
          </div>

          {/* Contacts */}
          <div className="bg-dark-secondary rounded-xl border border-white/5 p-5">
            <h2 className="text-sm font-semibold text-white mb-3">
              Contacts ({company.contacts.length})
            </h2>
            {company.contacts.length === 0 ? (
              <p className="text-gray-600 text-xs">No contacts found yet</p>
            ) : (
              <div className="space-y-3">
                {company.contacts.map((contact) => (
                  <div key={contact.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="flex items-start gap-3">
                      {/* Photo */}
                      {contact.photoUrl ? (
                        <img
                          src={contact.photoUrl}
                          alt={contact.name}
                          className="w-10 h-10 rounded-full object-cover border border-white/10 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-dark-tertiary flex items-center justify-center shrink-0 border border-white/10">
                          <span className="text-xs text-gray-500 font-medium">
                            {contact.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{contact.name}</span>
                          {contact.isPrimary && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-primary-500/20 text-primary-400">PRIMARY</span>
                          )}
                        </div>
                        {contact.title && <div className="text-xs text-gray-500 mt-0.5">{contact.title}</div>}

                        {/* Bio */}
                        {contact.bio && (
                          <div className="text-[11px] text-gray-400 mt-1.5 leading-relaxed italic">
                            &ldquo;{contact.bio}&rdquo;
                          </div>
                        )}

                        {/* Contact details */}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                          {contact.email && (
                            <span className="text-xs text-gray-400">{contact.email}</span>
                          )}
                          {contact.phone && (
                            <span className="text-xs text-gray-500">{contact.phone}</span>
                          )}
                          {contact.linkedin && (
                            <a href={contact.linkedin} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:text-blue-300">LinkedIn</a>
                          )}
                        </div>

                        {/* Languages */}
                        {contact.languages.length > 0 && (
                          <div className="flex gap-1 mt-2">
                            {contact.languages.map((lang) => (
                              <span key={lang} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500">
                                {lang}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* === MAIN CONTENT — Email History === */}
        <div className="lg:col-span-2 space-y-5">
          {/* Email History */}
          <div className="bg-dark-secondary rounded-xl border border-white/5 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">
              Email History ({company.emails.length})
            </h2>
            {company.emails.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-500 text-sm">No emails sent to this company yet</p>
                <p className="text-gray-600 text-xs mt-1">
                  {company.status === "SCORED" ? "Company is scored and ready for outreach"
                    : "Complete enrichment and scoring first"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {company.emails.map((email) => (
                  <details key={email.id} className="group border border-white/5 rounded-lg overflow-hidden">
                    {/* Email header — always visible */}
                    <summary className="bg-white/[0.02] px-4 py-3 cursor-pointer hover:bg-white/[0.04] transition-colors list-none">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-medium text-gray-500 shrink-0">
                            {email.type.replace("_", " ")}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${emailStatusColors[email.status]}`}>
                            {email.status}
                          </span>
                          <span className="text-sm text-white truncate">{email.subject}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-[10px] text-gray-600">
                            {email.sentAt ? new Date(email.sentAt).toLocaleDateString("en-US", {
                              month: "short", day: "numeric",
                            }) : ""}
                          </span>
                          <span className="text-gray-600 text-xs group-open:rotate-180 transition-transform">&#9662;</span>
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        To: {email.contact?.name ?? "Unknown"} &lt;{email.contact?.email ?? "N/A"}&gt;
                      </div>
                    </summary>

                    {/* Email body — expandable */}
                    <div className="px-4 py-3 border-t border-white/5">
                      <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                        {email.body}
                      </pre>
                    </div>

                    {/* Reply */}
                    {email.replyBody && (
                      <div className="border-t border-white/5 bg-green-500/5 px-4 py-3">
                        <div className="text-xs text-green-400 font-medium mb-1">
                          Reply {email.repliedAt && `· ${new Date(email.repliedAt).toLocaleDateString()}`}
                        </div>
                        <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">{email.replyBody}</pre>
                      </div>
                    )}

                    {/* Timestamps */}
                    <div className="px-4 py-2 bg-white/[0.01] flex gap-4 text-[10px] text-gray-600 border-t border-white/5">
                      {email.sentAt && <span>Sent: {new Date(email.sentAt).toLocaleString()}</span>}
                      {email.openedAt && <span className="text-purple-400">Opened: {new Date(email.openedAt).toLocaleString()}</span>}
                      {email.repliedAt && <span className="text-green-400">Replied: {new Date(email.repliedAt).toLocaleString()}</span>}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          {company.description && (
            <div className="bg-dark-secondary rounded-xl border border-white/5 p-5">
              <h2 className="text-sm font-semibold text-white mb-2">Description</h2>
              <p className="text-sm text-gray-400 leading-relaxed">{company.description}</p>
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
      <span className="text-gray-300 text-xs text-right">{value}</span>
    </div>
  );
}

function Capability({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${active ? "bg-green-500" : "bg-gray-600"}`} />
      <span className={`text-xs ${active ? "text-gray-300" : "text-gray-600"}`}>{label}</span>
    </div>
  );
}
