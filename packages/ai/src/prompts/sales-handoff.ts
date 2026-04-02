import { createAIClient } from "../client";

const SYSTEM_PROMPT = `You are a sales intelligence assistant for ProLife, a Swiss medical technology company.

Your job is to write a concise sales handoff brief for a human sales director. This brief will be sent as a Telegram notification when a potential distribution partner responds with interest.

The brief must include:
1. **Company Overview** — name, country, type, score, key categories
2. **Contact Details** — primary contact name, title, email
3. **Conversation Summary** — what was said in the outreach and their reply
4. **Interest Signals** — why this company is interested, what they responded to
5. **Recommended Next Steps** — concrete action items for the sales director

Keep it under 300 words. Be direct and actionable. Write in English.
Format using HTML tags (<b>, <i>, <a>) for Telegram compatibility.`;

interface HandoffContext {
  company: {
    name: string;
    country: string;
    type: string;
    score: number;
    priority: string;
    categories: string[];
    website?: string | null;
    estimatedRevenue?: string | null;
    pharmacyCount?: number | null;
  };
  contact: {
    name: string;
    title?: string | null;
    email?: string | null;
  } | null;
  emails: {
    type: string;
    subject: string;
    body: string;
    replyBody?: string | null;
    sentAt?: Date | string | null;
    repliedAt?: Date | string | null;
  }[];
}

export async function generateHandoffSummary(
  context: HandoffContext
): Promise<string> {
  const ai = createAIClient();

  const emailHistory = context.emails
    .map((e) => {
      const sentStr = e.sentAt instanceof Date ? e.sentAt.toISOString() : (e.sentAt ?? "N/A");
      const repliedStr = e.repliedAt instanceof Date ? e.repliedAt.toISOString() : (e.repliedAt ?? "N/A");
      let text = `[${e.type}] Subject: ${e.subject}\nSent: ${sentStr}\nBody: ${e.body.slice(0, 500)}`;
      if (e.replyBody) {
        text += `\n\nReply (${repliedStr}):\n${e.replyBody.slice(0, 500)}`;
      }
      return text;
    })
    .join("\n\n---\n\n");

  const prompt = `Generate a sales handoff brief for this interested company:

Company: ${context.company.name}
Country: ${context.company.country}
Type: ${context.company.type}
Score: ${context.company.score}/100 (Priority ${context.company.priority})
Categories: ${context.company.categories.join(", ") || "N/A"}
Website: ${context.company.website || "N/A"}
Revenue: ${context.company.estimatedRevenue || "Unknown"}
Pharmacy Count: ${context.company.pharmacyCount ?? "N/A"}

Primary Contact: ${context.contact ? `${context.contact.name} (${context.contact.title ?? "N/A"}) — ${context.contact.email ?? "no email"}` : "No contact found"}

Email Conversation:
${emailHistory || "No email history available."}`;

  return ai.generate({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });
}
