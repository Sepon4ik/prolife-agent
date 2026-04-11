import { createAIClient } from "../client";

interface OutreachParams {
  companyName: string;
  contactName: string;
  country: string;
  companyType: string;
  categories: string[];
  language?: string;
  /** Recent news about this company for personalization */
  newsContext?: {
    title: string;
    category: string;
    summary: string | null;
    publishedAt: string | null;
  };
}

const OUTREACH_SYSTEM_PROMPT = `You are writing a professional outreach email on behalf of ProLife, a Swiss company specializing in:
- Vitamins & dietary supplements
- Dermo-cosmetics
- Children's cosmetics & accessories
- Home medical devices

The email should be:
- Professional but warm
- Personalized to the recipient's company and market
- Brief (150-200 words max)
- Include a clear call to action (schedule a call)
- Mention Swiss quality and innovation
- Reference the recipient's market expertise
- If recent news about the company is provided, subtly reference it to show you're paying attention to their business (1 sentence max, don't overdo it)

Write ONLY the email body in PLAIN TEXT. No HTML tags, no formatting. No subject line, no greeting format instructions. Keep it short — 100-150 words max. Write like a human typed it in Gmail, not like a marketing template.`;

export async function generateOutreachEmail(params: OutreachParams): Promise<{
  subject: string;
  body: string;
}> {
  const ai = createAIClient();

  const body = await ai.generate({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: OUTREACH_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Write a personalized outreach email for:
- Company: ${params.companyName}
- Contact: ${params.contactName}
- Country: ${params.country}
- Company type: ${params.companyType}
- Their categories: ${params.categories.join(", ")}
- Language: ${params.language ?? "English"}${params.newsContext ? `
- Recent news about them: "${params.newsContext.title}" (${params.newsContext.category}, ${params.newsContext.publishedAt ?? "recent"})${params.newsContext.summary ? ` — ${params.newsContext.summary}` : ""}` : ""}

The email should feel personal and reference their specific market.`,
      },
    ],
  });

  // Generate subject separately for better quality
  const subject = await ai.generate({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Generate a short, compelling email subject line for a B2B outreach email from ProLife (Swiss health products) to ${params.companyName} (${params.companyType} in ${params.country}). Return ONLY the subject line, no quotes.`,
      },
    ],
  });

  return { subject: subject.trim(), body };
}
