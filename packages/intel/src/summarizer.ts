/**
 * AI News Summarizer — uses Claude Haiku to:
 * 1. Summarize each news item (2-3 sentences)
 * 2. Classify category (contract, expansion, regulatory, etc.)
 * 3. Extract entities (company names, countries)
 * 4. Score relevance to pharma distribution
 *
 * Cost: ~$0.001 per article (Haiku is cheap)
 */

import type { RawNewsItem } from "./aggregator";

// ── Types ──

export interface ProcessedNewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
  summary: string;
  category: string;
  entities: string[];
  countries: string[];
  sentiment: "positive" | "negative" | "neutral";
  relevanceScore: number;
}

// ── AI Processing ──

/**
 * Process a batch of raw news items through Claude Haiku.
 * Uses tool_use for structured output.
 *
 * Requires ANTHROPIC_API_KEY env var.
 */
export async function summarizeNewsItems(
  items: RawNewsItem[]
): Promise<ProcessedNewsItem[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY not set, returning items without AI processing");
    return items.map((item) => ({
      ...item,
      summary: item.snippet,
      category: "GENERAL",
      entities: [],
      countries: [],
      sentiment: "neutral" as const,
      relevanceScore: 50,
    }));
  }

  const results: ProcessedNewsItem[] = [];

  // Process in batches of 5 for efficiency
  for (let i = 0; i < items.length; i += 5) {
    const batch = items.slice(i, i + 5);
    const batchResults = await processBatch(apiKey, batch);
    results.push(...batchResults);
  }

  return results;
}

async function processBatch(
  apiKey: string,
  items: RawNewsItem[]
): Promise<ProcessedNewsItem[]> {
  const newsText = items
    .map(
      (item, idx) =>
        `[${idx + 1}] Title: ${item.title}\nSource: ${item.source}\nSnippet: ${item.snippet}`
    )
    .join("\n\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: `You analyze pharmaceutical industry news. For each article, extract:
- summary: 2-3 sentence summary focused on business impact
- category: one of CONTRACT, EXPANSION, REGULATORY, MA_FUNDING, LEADERSHIP, PRODUCT_LAUNCH, TENDER, EVENT, GENERAL
- entities: company names mentioned (array)
- countries: countries mentioned (array)
- sentiment: positive, negative, or neutral (for pharma distributors)
- relevanceScore: 0-100, how relevant to pharma distribution businesses

Return valid JSON array. Only extract what's explicitly stated.`,
        messages: [
          {
            role: "user",
            content: `Analyze these ${items.length} pharma industry news articles:\n\n${newsText}\n\nReturn a JSON array with one object per article, in order.`,
          },
        ],
        tools: [
          {
            name: "classify_news",
            description: "Classify and summarize news articles",
            input_schema: {
              type: "object",
              properties: {
                articles: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      summary: { type: "string" },
                      category: {
                        type: "string",
                        enum: [
                          "CONTRACT",
                          "EXPANSION",
                          "REGULATORY",
                          "MA_FUNDING",
                          "LEADERSHIP",
                          "PRODUCT_LAUNCH",
                          "TENDER",
                          "EVENT",
                          "GENERAL",
                        ],
                      },
                      entities: { type: "array", items: { type: "string" } },
                      countries: { type: "array", items: { type: "string" } },
                      sentiment: {
                        type: "string",
                        enum: ["positive", "negative", "neutral"],
                      },
                      relevanceScore: { type: "number", minimum: 0, maximum: 100 },
                    },
                    required: [
                      "summary",
                      "category",
                      "entities",
                      "countries",
                      "sentiment",
                      "relevanceScore",
                    ],
                  },
                },
              },
              required: ["articles"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "classify_news" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error("Anthropic API error:", res.status);
      return items.map(fallbackProcess);
    }

    const data = (await res.json()) as {
      content?: Array<{
        type: string;
        input?: { articles?: Array<{
          summary?: string;
          category?: string;
          entities?: string[];
          countries?: string[];
          sentiment?: string;
          relevanceScore?: number;
        }> };
      }>;
    };

    const toolResult = data.content?.find((c) => c.type === "tool_use");
    const articles = toolResult?.input?.articles ?? [];

    return items.map((item, idx) => {
      const ai = articles[idx];
      if (!ai) return fallbackProcess(item);

      return {
        title: item.title,
        url: item.url,
        source: item.source,
        publishedAt: item.publishedAt,
        summary: ai.summary ?? item.snippet,
        category: ai.category ?? "GENERAL",
        entities: ai.entities ?? [],
        countries: ai.countries ?? [],
        sentiment: (ai.sentiment as "positive" | "negative" | "neutral") ?? "neutral",
        relevanceScore: ai.relevanceScore ?? 50,
      };
    });
  } catch (err) {
    console.error("AI summarization failed:", err);
    return items.map(fallbackProcess);
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackProcess(item: RawNewsItem): ProcessedNewsItem {
  return {
    title: item.title,
    url: item.url,
    source: item.source,
    publishedAt: item.publishedAt,
    summary: item.snippet,
    category: "GENERAL",
    entities: [],
    countries: [],
    sentiment: "neutral",
    relevanceScore: 50,
  };
}
