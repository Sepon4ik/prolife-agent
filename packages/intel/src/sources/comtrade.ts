/**
 * UN Comtrade API — pharma trade flows between countries.
 * HS Chapter 30 = Pharmaceutical products.
 * Free tier with registration.
 * https://comtradeplus.un.org/
 */

import type { RawNewsItem } from "../aggregator";

const BASE = "https://comtradeapi.un.org/data/v1/get/C/A";
const TIMEOUT = 20_000;

// HS codes for pharmaceutical products
const PHARMA_HS_CODES = [
  "30", // Chapter 30: Pharmaceutical products (aggregate)
  "3001", // Glands, organs for organotherapeutic uses
  "3002", // Blood, antisera, vaccines, toxins
  "3003", // Medicaments, not in doses/retail
  "3004", // Medicaments, in doses/retail
  "3005", // Wadding, bandages, surgical sutures
  "3006", // Pharmaceutical preparations
];

// ProLife target markets
const TARGET_MARKETS: Record<string, string> = {
  "360": "Indonesia",
  "586": "Pakistan",
  "050": "Bangladesh",
  "608": "Philippines",
  "704": "Vietnam",
  "784": "UAE",
  "764": "Thailand",
  "792": "Turkey",
  "410": "South Korea",
  "458": "Malaysia",
  "702": "Singapore",
  "144": "Sri Lanka",
  "524": "Nepal",
  "642": "Romania",
  "203": "Czech Republic",
  "348": "Hungary",
  "040": "Austria",
  "528": "Netherlands",
  "566": "Nigeria",
  "404": "Kenya",
  "710": "South Africa",
};

interface ComtradeResponse {
  data?: Array<{
    reporterCode?: number;
    reporterDesc?: string;
    partnerCode?: number;
    partnerDesc?: string;
    cmdCode?: string;
    cmdDesc?: string;
    flowDesc?: string;
    period?: number;
    primaryValue?: number;
    netWgt?: number;
    qty?: number;
  }>;
}

/**
 * Fetch pharma import data for a target market.
 * Shows which countries are importing pharma products — signals market demand.
 */
export async function fetchPharmaTradeFlows(
  reporterCode: string,
  year?: number
): Promise<RawNewsItem[]> {
  const period = year ?? new Date().getFullYear() - 1; // Latest full year
  const apiKey = process.env.COMTRADE_API_KEY;

  const params = new URLSearchParams({
    reporterCode,
    period: String(period),
    cmdCode: "30", // All pharma
    flowCode: "M", // Imports
    partnerCode: "0", // World (all partners)
    partner2Code: "0",
    motCode: "0",
    customsCode: "C00",
  });

  if (apiKey) params.set("subscription-key", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(`${BASE}?${params.toString()}`, {
      signal: controller.signal,
      headers: { "User-Agent": "ProLifeIntel/1.0" },
    });

    if (!res.ok) return [];

    const data = (await res.json()) as ComtradeResponse;
    if (!data.data) return [];

    return data.data
      .filter((d) => d.primaryValue && d.primaryValue > 0)
      .sort((a, b) => (b.primaryValue ?? 0) - (a.primaryValue ?? 0))
      .slice(0, 15)
      .map((d) => ({
        title: `Pharma Trade: ${d.reporterDesc ?? ""} imported $${formatValue(d.primaryValue ?? 0)} of ${d.cmdDesc ?? "pharma"} (${period})`,
        url: `https://comtradeplus.un.org/TradeFlow?Frequency=A&Flows=M&CommodityCodes=${d.cmdCode ?? "30"}&Partners=${reporterCode}&Reporters=0&period=${period}`,
        source: "UN Comtrade",
        snippet: `${d.reporterDesc ?? ""} ${d.flowDesc ?? "import"}: ${d.cmdDesc ?? ""}. Value: $${formatValue(d.primaryValue ?? 0)}. Weight: ${formatValue(d.netWgt ?? 0)} kg.`,
        publishedAt: `${period}-12-31`,
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch pharma trade data for all ProLife target markets.
 */
export async function fetchAllTargetMarketTrade(): Promise<RawNewsItem[]> {
  const results: RawNewsItem[] = [];
  const codes = Object.keys(TARGET_MARKETS).slice(0, 5); // Top 5 to avoid rate limits

  for (const code of codes) {
    const items = await fetchPharmaTradeFlows(code);
    results.push(...items);
    await new Promise((r) => setTimeout(r, 1000)); // Rate limit
  }

  return results;
}

function formatValue(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export { TARGET_MARKETS, PHARMA_HS_CODES };
