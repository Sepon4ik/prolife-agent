import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createAIClient } from "./client";

// ── Company Classification Schema ──
export const CompanyClassificationSchema = z.object({
  companyName: z.string().describe("Clean company name (not page title, not 'Contact Us', not 'About Us' — the actual business name)"),
  country: z.string().describe("Country where the company is headquartered (e.g. 'United Arab Emirates', 'Germany'). Determine from address, phone code, domain TLD, or content."),
  city: z.string().nullable().describe("City where headquarters is located, if mentioned"),
  type: z.enum(["distributor", "pharmacy_chain", "retail", "hybrid", "unknown"]),
  categories: z.array(z.string()).describe("Product categories the company works with"),
  estimatedRevenue: z.enum(["under_2m", "2m_10m", "10m_plus", "unknown"]),
  hasEcommerce: z.boolean(),
  hasSalesTeam: z.boolean(),
  hasMarketingTeam: z.boolean(),
  hasMedReps: z.boolean().describe("Has medical representatives"),
  pharmacyCount: z.number().nullable().describe("Number of pharmacy outlets if chain"),
  portfolioBrands: z.array(z.string()).describe("Known brand names in portfolio"),
  activelySeekingBrands: z.boolean().describe("Shows signs of looking for new brands/products"),
  relevanceScore: z.number().min(0).max(100).describe("How relevant is this company for ProLife partnership"),
  confidence: z.number().min(0).max(1).describe("Confidence in the classification"),
  reasoning: z.string().describe("Brief explanation of the classification"),
});

export type CompanyClassificationResult = z.infer<typeof CompanyClassificationSchema>;

const CLASSIFY_SYSTEM_PROMPT = `You are an expert at analyzing pharmaceutical and healthcare distribution companies.
Your job is to classify companies based on their website content and available data.

ProLife is a Swiss company producing:
- Vitamins & supplements
- Dermo-cosmetics
- Children's products (cosmetics, accessories)
- Home medical devices

You must evaluate if a company would be a good distribution partner based on:
1. Company type (distributor, pharmacy chain, retail, hybrid)
2. Geographic presence in target markets
3. Revenue scale (ideally 2M+ USD)
4. Pharmacy network size (300+ outlets is a plus)
5. Existing brand portfolio and categories
6. E-commerce presence
7. Sales/medical representative teams
8. Marketing capabilities
9. Active search for new brands

Be precise and conservative with confidence scores.`;

export async function classifyCompany(
  websiteContent: string,
  companyName: string,
  country: string
): Promise<CompanyClassificationResult> {
  const ai = createAIClient();

  const result = await ai.classify<CompanyClassificationResult>({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: CLASSIFY_SYSTEM_PROMPT,
    tools: [
      {
        name: "classify_company",
        description: "Classify a company based on website content and available data",
        input_schema: zodToJsonSchema(CompanyClassificationSchema as any) as any,
      },
    ],
    tool_choice: { type: "tool" as const, name: "classify_company" },
    messages: [
      {
        role: "user",
        content: `Analyze this company for potential ProLife distribution partnership:\n\nCompany: ${companyName}\nCountry: ${country}\n\nWebsite content:\n${websiteContent.slice(0, 8000)}`,
      },
    ],
  });

  return CompanyClassificationSchema.parse(result);
}
