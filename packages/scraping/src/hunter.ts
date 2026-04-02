/**
 * Hunter.io API Integration
 * Email finder and verification for B2B contacts.
 * API docs: https://hunter.io/api-documentation/v2
 */

const HUNTER_BASE = "https://api.hunter.io/v2";

function getApiKey(): string | null {
  return process.env.HUNTER_API_KEY ?? null;
}

interface HunterEmailResult {
  email: string;
  score: number; // 0-100 confidence
  firstName: string;
  lastName: string;
  position: string | null;
  company: string | null;
}

interface HunterDomainResult {
  emails: {
    value: string;
    type: "personal" | "generic";
    confidence: number;
    firstName: string | null;
    lastName: string | null;
    position: string | null;
  }[];
  organization: string;
  country: string | null;
}

/**
 * Find email by person name + company domain.
 * Uses ~1 request/credit.
 */
export async function hunterFindEmail(
  domain: string,
  firstName: string,
  lastName: string
): Promise<HunterEmailResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      domain,
      first_name: firstName,
      last_name: lastName,
      api_key: apiKey,
    });

    const res = await fetch(`${HUNTER_BASE}/email-finder?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      if (res.status === 429) console.warn("[Hunter] Rate limited");
      return null;
    }

    const json: any = await res.json();
    const data = json.data;

    if (!data?.email) return null;

    return {
      email: data.email,
      score: data.score ?? 0,
      firstName: data.first_name ?? firstName,
      lastName: data.last_name ?? lastName,
      position: data.position ?? null,
      company: data.company ?? null,
    };
  } catch (e) {
    console.error("[Hunter] Email finder error:", e);
    return null;
  }
}

/**
 * Search all emails at a domain.
 * Good for discovering contacts when you don't have names.
 * Uses ~1 request/credit per call.
 */
export async function hunterDomainSearch(
  domain: string
): Promise<HunterDomainResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      domain,
      api_key: apiKey,
      limit: "10",
      type: "personal", // Skip generic (info@, contact@)
    });

    const res = await fetch(`${HUNTER_BASE}/domain-search?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;

    const json: any = await res.json();
    const data = json.data;

    return {
      emails: (data.emails ?? []).map((e: any) => ({
        value: e.value,
        type: e.type,
        confidence: e.confidence ?? 0,
        firstName: e.first_name ?? null,
        lastName: e.last_name ?? null,
        position: e.position ?? null,
      })),
      organization: data.organization ?? "",
      country: data.country ?? null,
    };
  } catch (e) {
    console.error("[Hunter] Domain search error:", e);
    return null;
  }
}

/**
 * Verify if an email address is valid.
 * Uses ~1 request/credit.
 */
export async function hunterVerifyEmail(
  email: string
): Promise<{ valid: boolean; score: number; status: string } | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      email,
      api_key: apiKey,
    });

    const res = await fetch(`${HUNTER_BASE}/email-verifier?${params}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const json: any = await res.json();
    const data = json.data;

    return {
      valid: data.result === "deliverable" || data.result === "risky",
      score: data.score ?? 0,
      status: data.result ?? "unknown",
    };
  } catch (e) {
    console.error("[Hunter] Verify error:", e);
    return null;
  }
}

/**
 * Check remaining Hunter.io credits.
 */
export async function hunterCheckCredits(): Promise<{
  used: number;
  available: number;
} | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `${HUNTER_BASE}/account?api_key=${apiKey}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;

    const json: any = await res.json();
    const requests = json.data?.requests;
    return {
      used: requests?.searches?.used ?? 0,
      available: requests?.searches?.available ?? 0,
    };
  } catch {
    return null;
  }
}
