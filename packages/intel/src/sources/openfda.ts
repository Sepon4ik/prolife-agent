/**
 * OpenFDA API — free, no key required (with key: 120K req/day).
 * Endpoints: drug approvals, recalls, shortages, adverse events.
 * https://open.fda.gov/apis/
 */

import type { RawNewsItem } from "../aggregator";

const BASE = "https://api.fda.gov";
const TIMEOUT = 15_000;

async function fdaFetch<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const apiKey = process.env.OPENFDA_API_KEY;
  if (apiKey) url.searchParams.set("api_key", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "ProLifeIntel/1.0" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Recent Drug Approvals ──

interface DrugsFDAResult {
  results?: Array<{
    application_number?: string;
    sponsor_name?: string;
    products?: Array<{
      brand_name?: string;
      active_ingredients?: Array<{ name?: string }>;
    }>;
    submissions?: Array<{
      submission_type?: string;
      submission_status?: string;
      submission_status_date?: string;
      review_priority?: string;
    }>;
    openfda?: {
      generic_name?: string[];
      brand_name?: string[];
      route?: string[];
    };
  }>;
}

export async function fetchFDAApprovals(limit = 20): Promise<RawNewsItem[]> {
  const data = await fdaFetch<DrugsFDAResult>("/drug/drugsfda.json", {
    search: 'submissions.submission_type:"ORIG"+AND+submissions.submission_status:"AP"',
    sort: "submissions.submission_status_date:desc",
    limit: String(limit),
  });

  if (!data?.results) return [];

  return data.results.map((r) => {
    const latest = r.submissions?.sort((a, b) =>
      (b.submission_status_date ?? "").localeCompare(a.submission_status_date ?? "")
    )[0];
    const brandName = r.products?.[0]?.brand_name ?? r.openfda?.brand_name?.[0] ?? "";
    const genericName = r.openfda?.generic_name?.[0] ?? r.products?.[0]?.active_ingredients?.[0]?.name ?? "";
    const title = `FDA Approval: ${brandName}${genericName ? ` (${genericName})` : ""} — ${r.sponsor_name ?? ""}`;

    return {
      title,
      url: `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${r.application_number ?? ""}`,
      source: "FDA Approvals",
      snippet: `${latest?.review_priority === "PRIORITY" ? "Priority Review. " : ""}Application ${r.application_number ?? "N/A"} by ${r.sponsor_name ?? "Unknown"}. Route: ${r.openfda?.route?.join(", ") ?? "N/A"}.`,
      publishedAt: latest?.submission_status_date
        ? new Date(latest.submission_status_date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")).toISOString()
        : undefined,
    };
  });
}

// ── Drug Recalls / Enforcement ──

interface EnforcementResult {
  results?: Array<{
    recall_number?: string;
    reason_for_recall?: string;
    product_description?: string;
    recalling_firm?: string;
    classification?: string;
    status?: string;
    report_date?: string;
    distribution_pattern?: string;
    openfda?: { brand_name?: string[] };
  }>;
}

export async function fetchFDARecalls(limit = 15): Promise<RawNewsItem[]> {
  const data = await fdaFetch<EnforcementResult>("/drug/enforcement.json", {
    sort: "report_date:desc",
    limit: String(limit),
  });

  if (!data?.results) return [];

  return data.results.map((r) => {
    const brand = r.openfda?.brand_name?.[0] ?? "";
    const firm = r.recalling_firm ?? "Unknown";
    const title = `FDA Recall (Class ${r.classification ?? "?"}): ${brand || firm} — ${(r.reason_for_recall ?? "").slice(0, 100)}`;

    return {
      title,
      url: `https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts`,
      source: "FDA Recalls",
      snippet: `${r.recalling_firm ?? ""}: ${r.reason_for_recall ?? ""}. Distribution: ${r.distribution_pattern ?? "N/A"}. Status: ${r.status ?? "N/A"}.`,
      publishedAt: r.report_date
        ? new Date(r.report_date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")).toISOString()
        : undefined,
    };
  });
}

// ── Drug Shortages ──

interface ShortageResult {
  results?: Array<{
    generic_name?: string;
    proprietary_name?: string;
    company_name?: string;
    status?: string;
    initial_posting_date?: string;
    updated_date?: string;
    dosage_form?: string;
  }>;
}

export async function fetchFDAShortages(limit = 15): Promise<RawNewsItem[]> {
  const data = await fdaFetch<ShortageResult>("/drug/shortages.json", {
    sort: "updated_date:desc",
    limit: String(limit),
  });

  if (!data?.results) return [];

  return data.results.map((r) => ({
    title: `Drug Shortage: ${r.proprietary_name ?? r.generic_name ?? "Unknown"} (${r.company_name ?? ""}) — ${r.status ?? ""}`,
    url: "https://www.fda.gov/drugs/drug-safety-and-availability/drug-shortages",
    source: "FDA Shortages",
    snippet: `${r.generic_name ?? ""} by ${r.company_name ?? "Unknown"}. Form: ${r.dosage_form ?? "N/A"}. Status: ${r.status ?? "N/A"}.`,
    publishedAt: r.updated_date ?? r.initial_posting_date ?? undefined,
  }));
}

// ── Device Recalls ──

interface DeviceRecallResult {
  results?: Array<{
    product_description?: string;
    reason_for_recall?: string;
    recalling_firm?: string;
    classification?: string;
    event_date_terminated?: string;
    report_date?: string;
    product_code?: string;
    openfda?: { device_name?: string; medical_specialty_description?: string };
  }>;
}

export async function fetchFDADeviceRecalls(limit = 10): Promise<RawNewsItem[]> {
  const data = await fdaFetch<DeviceRecallResult>("/device/enforcement.json", {
    sort: "report_date:desc",
    limit: String(limit),
  });

  if (!data?.results) return [];

  return data.results.map((r) => ({
    title: `Device Recall (Class ${r.classification ?? "?"}): ${r.openfda?.device_name ?? r.recalling_firm ?? "Unknown"} — ${(r.reason_for_recall ?? "").slice(0, 100)}`,
    url: "https://www.fda.gov/medical-devices/medical-device-recalls",
    source: "FDA Device Recalls",
    snippet: `${r.recalling_firm ?? ""}: ${r.product_description ?? ""}. Reason: ${r.reason_for_recall ?? ""}. Specialty: ${r.openfda?.medical_specialty_description ?? "N/A"}.`.slice(0, 500),
    publishedAt: r.report_date
      ? new Date(r.report_date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")).toISOString()
      : undefined,
  }));
}

// ── Device 510(k) Clearances ──

interface Device510kResult {
  results?: Array<{
    k_number?: string;
    device_name?: string;
    applicant?: string;
    decision_date?: string;
    product_code?: string;
    advisory_committee_description?: string;
    statement_or_summary?: string;
  }>;
}

export async function fetchFDA510kClearances(limit = 10): Promise<RawNewsItem[]> {
  const data = await fdaFetch<Device510kResult>("/device/510k.json", {
    sort: "decision_date:desc",
    limit: String(limit),
  });

  if (!data?.results) return [];

  return data.results.map((r) => ({
    title: `510(k) Cleared: ${r.device_name ?? "Unknown"} by ${r.applicant ?? "Unknown"} (${r.k_number ?? ""})`,
    url: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${r.k_number ?? ""}`,
    source: "FDA 510(k)",
    snippet: `Device: ${r.device_name ?? "N/A"}. Applicant: ${r.applicant ?? "N/A"}. Committee: ${r.advisory_committee_description ?? "N/A"}.`,
    publishedAt: r.decision_date ?? undefined,
  }));
}

// ── Aggregate all FDA sources ──

export async function fetchAllFDA(): Promise<RawNewsItem[]> {
  const [approvals, recalls, shortages, deviceRecalls, clearances] = await Promise.all([
    fetchFDAApprovals(15),
    fetchFDARecalls(10),
    fetchFDAShortages(10),
    fetchFDADeviceRecalls(10),
    fetchFDA510kClearances(10),
  ]);
  return [...approvals, ...recalls, ...shortages, ...deviceRecalls, ...clearances];
}
