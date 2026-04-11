/**
 * ClinicalTrials.gov API v2 — completely free, no auth required.
 * Tracks clinical trial pipeline globally.
 * https://clinicaltrials.gov/data-api/api
 */

import type { RawNewsItem } from "../aggregator";

const BASE = "https://clinicaltrials.gov/api/v2/studies";
const TIMEOUT = 15_000;

interface CTStudy {
  protocolSection?: {
    identificationModule?: {
      nctId?: string;
      briefTitle?: string;
      organization?: { fullName?: string };
    };
    statusModule?: {
      overallStatus?: string;
      startDateStruct?: { date?: string };
      statusVerifiedDate?: string;
      lastUpdatePostDateStruct?: { date?: string };
    };
    descriptionModule?: {
      briefSummary?: string;
    };
    conditionsModule?: {
      conditions?: string[];
    };
    designModule?: {
      phases?: string[];
    };
    armsInterventionsModule?: {
      interventions?: Array<{
        type?: string;
        name?: string;
      }>;
    };
    contactsLocationsModule?: {
      locations?: Array<{
        country?: string;
        facility?: string;
      }>;
    };
  };
}

interface CTResponse {
  studies?: CTStudy[];
}

/**
 * Fetch recent clinical trials by condition/keyword.
 * Focuses on pharma distribution-relevant categories.
 */
export async function fetchClinicalTrials(
  query: string,
  options: {
    status?: string[];
    phases?: string[];
    limit?: number;
  } = {}
): Promise<RawNewsItem[]> {
  const { status = ["RECRUITING", "ACTIVE_NOT_RECRUITING"], phases, limit = 15 } = options;

  const params = new URLSearchParams({
    "query.cond": query,
    format: "json",
    pageSize: String(limit),
    sort: "LastUpdatePostDate:desc",
  });

  if (status.length > 0) {
    params.set("filter.overallStatus", status.join(","));
  }
  if (phases && phases.length > 0) {
    params.set("filter.phase", phases.join(","));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(`${BASE}?${params.toString()}`, {
      signal: controller.signal,
      headers: { "User-Agent": "ProLifeIntel/1.0" },
    });

    if (!res.ok) return [];

    const data = (await res.json()) as CTResponse;
    if (!data.studies) return [];

    return data.studies.map((study) => {
      const id = study.protocolSection?.identificationModule;
      const status = study.protocolSection?.statusModule;
      const desc = study.protocolSection?.descriptionModule;
      const conditions = study.protocolSection?.conditionsModule?.conditions ?? [];
      const phase = study.protocolSection?.designModule?.phases?.join(", ") ?? "N/A";
      const interventions = study.protocolSection?.armsInterventionsModule?.interventions ?? [];
      const countries = [
        ...new Set(
          study.protocolSection?.contactsLocationsModule?.locations
            ?.map((l) => l.country)
            .filter(Boolean) ?? []
        ),
      ];

      const drugNames = interventions
        .filter((i) => i.type === "DRUG" || i.type === "BIOLOGICAL")
        .map((i) => i.name)
        .filter(Boolean);

      const title = `Trial ${id?.nctId ?? ""}: ${id?.briefTitle ?? "Untitled"} (${phase})`;

      return {
        title,
        url: `https://clinicaltrials.gov/study/${id?.nctId ?? ""}`,
        source: "ClinicalTrials.gov",
        snippet: [
          `Sponsor: ${id?.organization?.fullName ?? "N/A"}`,
          `Status: ${status?.overallStatus ?? "N/A"}`,
          `Conditions: ${conditions.slice(0, 3).join(", ")}`,
          drugNames.length > 0 ? `Drugs: ${drugNames.join(", ")}` : "",
          countries.length > 0 ? `Countries: ${countries.slice(0, 5).join(", ")}` : "",
          desc?.briefSummary ? desc.briefSummary.slice(0, 200) : "",
        ]
          .filter(Boolean)
          .join(". "),
        publishedAt: status?.lastUpdatePostDateStruct?.date ?? undefined,
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch trials relevant to pharma distribution (vitamins, supplements, medical devices).
 */
export async function fetchPharmaDistributionTrials(): Promise<RawNewsItem[]> {
  const queries = [
    "vitamins supplements",
    "dermo-cosmetics skincare",
    "medical devices home use",
    "baby infant nutrition",
  ];

  const results: RawNewsItem[] = [];
  for (const q of queries) {
    const items = await fetchClinicalTrials(q, {
      status: ["RECRUITING", "COMPLETED"],
      phases: ["PHASE3", "PHASE4"],
      limit: 5,
    });
    results.push(...items);
  }

  return results;
}
