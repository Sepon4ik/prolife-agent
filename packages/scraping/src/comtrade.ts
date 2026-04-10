/**
 * UN Comtrade API — Free trade flow data.
 * Shows which countries import pharma/supplements and in what volumes.
 * Used to prioritize target markets and validate that a country has real import demand.
 *
 * API docs: https://comtradeapi.un.org/
 * Free tier: 500 requests/day, no key needed (key gives 10k/day).
 */

// ── Types ──

export interface ComtradeFlow {
  /** Reporting country */
  reporterCountry: string;
  reporterCode: string;
  /** Partner country (where goods come from) */
  partnerCountry: string;
  partnerCode: string;
  /** HS commodity code */
  hsCode: string;
  hsDescription: string;
  /** Import value in USD */
  tradeValueUsd: number;
  /** Net weight in kg */
  netWeightKg: number | null;
  /** Year of data */
  year: number;
  /** "M" = import, "X" = export */
  flowCode: string;
}

export interface CountryImportSummary {
  country: string;
  countryCode: string;
  totalImportUsd: number;
  topPartners: Array<{ country: string; valueUsd: number }>;
  year: number;
  hsCode: string;
}

// ── HS Codes relevant to ProLife ──

export const PHARMA_HS_CODES = {
  /** Medicaments (dosified or packaged for retail) */
  MEDICAMENTS: "3004",
  /** Food preparations (includes supplements/nutraceuticals) */
  SUPPLEMENTS: "2106",
  /** Beauty/skincare preparations */
  DERMOCOSMETICS: "3304",
  /** Medical instruments and devices */
  MEDICAL_DEVICES: "9018",
  /** Vitamins (provitamins and vitamins) */
  VITAMINS: "2936",
} as const;

// ── API ──

/**
 * Get import data for a specific HS code and reporter country.
 * Returns trade flows showing who imports what from where.
 *
 * @param hsCode - HS commodity code (e.g. "3004" for medicaments)
 * @param reporterCode - UN M49 country code (e.g. "360" for Indonesia)
 * @param year - Year of data (default: latest available)
 */
export async function getImportFlows(
  hsCode: string,
  reporterCode: string,
  options: { year?: number } = {}
): Promise<ComtradeFlow[]> {
  const year = options.year ?? new Date().getFullYear() - 1; // Latest full year

  const params = new URLSearchParams({
    reporterCode,
    period: String(year),
    cmdCode: hsCode,
    flowCode: "M", // M = imports
    partnerCode: "0", // 0 = all partners (world)
    partner2Code: "0",
    motCode: "0",
    customsCode: "C00",
  });

  const apiKey = process.env.COMTRADE_API_KEY;
  if (apiKey) {
    params.set("subscription-key", apiKey);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(
      `https://comtradeapi.un.org/data/v1/get/C/A/${year}/HS?${params.toString()}`,
      {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      if (res.status === 429) {
        console.warn("UN Comtrade rate limit (500/day free)");
        return [];
      }
      throw new Error(`Comtrade API error: ${res.status}`);
    }

    const data = (await res.json()) as {
      data?: Array<{
        reporterDesc?: string;
        reporterCode?: number;
        partnerDesc?: string;
        partnerCode?: number;
        cmdCode?: string;
        cmdDesc?: string;
        primaryValue?: number;
        netWgt?: number;
        period?: number;
        flowCode?: string;
      }>;
    };

    return (data.data ?? []).map((row) => ({
      reporterCountry: row.reporterDesc ?? "",
      reporterCode: String(row.reporterCode ?? ""),
      partnerCountry: row.partnerDesc ?? "",
      partnerCode: String(row.partnerCode ?? ""),
      hsCode: row.cmdCode ?? hsCode,
      hsDescription: row.cmdDesc ?? "",
      tradeValueUsd: row.primaryValue ?? 0,
      netWeightKg: row.netWgt ?? null,
      year: row.period ?? year,
      flowCode: row.flowCode ?? "M",
    }));
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get import summary for all P1/P2 countries for a given product category.
 * Returns ranked list of countries by import volume — helps prioritize markets.
 */
export async function getMarketPrioritization(
  hsCode: string,
  options: { year?: number } = {}
): Promise<CountryImportSummary[]> {
  // P1 + P2 target countries with UN M49 codes
  const targetCountries: Array<{ name: string; code: string }> = [
    // P1
    { name: "Indonesia", code: "360" },
    { name: "Pakistan", code: "586" },
    { name: "Bangladesh", code: "050" },
    { name: "Philippines", code: "608" },
    { name: "Vietnam", code: "704" },
    { name: "UAE", code: "784" },
    // P2
    { name: "Nigeria", code: "566" },
    { name: "Kenya", code: "404" },
    { name: "Egypt", code: "818" },
    { name: "Saudi Arabia", code: "682" },
    { name: "India", code: "356" },
    { name: "Thailand", code: "764" },
    { name: "Malaysia", code: "458" },
  ];

  const summaries: CountryImportSummary[] = [];

  for (const country of targetCountries) {
    try {
      const flows = await getImportFlows(hsCode, country.code, options);

      if (flows.length === 0) continue;

      const totalImport = flows.reduce((sum, f) => sum + f.tradeValueUsd, 0);
      const topPartners = flows
        .filter((f) => f.partnerCountry !== "World")
        .sort((a, b) => b.tradeValueUsd - a.tradeValueUsd)
        .slice(0, 5)
        .map((f) => ({
          country: f.partnerCountry,
          valueUsd: f.tradeValueUsd,
        }));

      summaries.push({
        country: country.name,
        countryCode: country.code,
        totalImportUsd: totalImport,
        topPartners,
        year: flows[0]?.year ?? new Date().getFullYear() - 1,
        hsCode,
      });
    } catch (err) {
      console.error(`Comtrade failed for ${country.name}:`, err);
    }

    // Rate limit: 1 second between requests
    await new Promise((r) => setTimeout(r, 1000));
  }

  return summaries.sort((a, b) => b.totalImportUsd - a.totalImportUsd);
}
