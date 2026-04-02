import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createAIClient } from "../client";

const ContactSchema = z.object({
  name: z.string().describe("Full name of the person"),
  title: z.string().nullable().describe("Job title (CEO, Sales Director, etc.)"),
  email: z.string().nullable().describe("Personal business email (not generic like info@ or support@)"),
  phone: z.string().nullable().describe("Direct phone number if available"),
  linkedin: z.string().nullable().describe("LinkedIn profile URL if found on the page"),
  photoUrl: z.string().nullable().describe("URL of the person's photo/avatar if found on the page (must be absolute URL, not relative)"),
  bio: z.string().nullable().describe("Brief professional bio or description (1-2 sentences) if mentioned on the page"),
  languages: z.array(z.string()).describe("Languages the person likely speaks based on their name, location, and bio. Always include English. Example: ['English', 'Arabic']"),
});

const ContactDiscoverySchema = z.object({
  contacts: z.array(ContactSchema).describe("Decision-makers found on the pages"),
});

export type DiscoveredContact = z.infer<typeof ContactSchema>;
export type ContactDiscoveryResult = z.infer<typeof ContactDiscoverySchema>;

const SYSTEM_PROMPT = `You are an expert at finding decision-maker contacts from company web pages.

Your job is to identify people who would be relevant for a B2B distribution partnership discussion.

Priority roles (in order):
1. CEO / Managing Director / General Manager
2. Sales Director / VP Sales / Head of Sales
3. Business Development Director/Manager
4. Commercial Director
5. Purchasing / Procurement Director
6. Marketing Director

Rules:
- Only extract REAL people with actual names found on the page
- Prefer personal business emails (firstname@, firstname.lastname@) over generic ones
- SKIP generic emails: info@, support@, hr@, contact@, admin@, webmaster@, office@
- If you find a generic email and no personal one, still include the contact with email as null
- Do not fabricate or guess emails — only extract what is explicitly on the page
- Maximum 5 contacts per company
- Include LinkedIn profile URLs if found on the page
- Extract photo URLs: look for <img> tags near person's name, team member cards, headshots. Must be absolute URLs (https://...)
- Bio: extract any brief professional description, education, experience mentioned near the person
- Languages: infer from person's name origin, company location, and any language mentions. Always include English for business contacts.`;

export async function discoverContacts(
  pageContent: string,
  companyName: string
): Promise<ContactDiscoveryResult> {
  if (!pageContent || pageContent.trim().length < 50) {
    return { contacts: [] };
  }

  const ai = createAIClient();

  const result = await ai.classify<ContactDiscoveryResult>({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: "extract_contacts",
        description: "Extract decision-maker contacts from company web pages",
        input_schema: zodToJsonSchema(ContactDiscoverySchema as any) as any,
      },
    ],
    tool_choice: { type: "tool" as const, name: "extract_contacts" },
    messages: [
      {
        role: "user",
        content: `Find decision-maker contacts for "${companyName}" from these web pages:\n\n${pageContent.slice(0, 8000)}`,
      },
    ],
  });

  return ContactDiscoverySchema.parse(result);
}
