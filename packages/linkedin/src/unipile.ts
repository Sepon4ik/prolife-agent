/**
 * Unipile LinkedIn API Integration.
 *
 * Unipile provides a REST API for LinkedIn actions via cookie-based auth.
 * Required: UNIPILE_API_KEY and a connected LinkedIn account in Unipile dashboard.
 *
 * Every action goes through the rate limiter FIRST.
 * If the rate limiter says no → the action is NOT performed.
 *
 * Docs: https://docs.unipile.com/
 */

import {
  checkLinkedInLimit,
  recordLinkedInAction,
  type LinkedInActionType,
} from "./rate-limiter";

// ── Types ──

export interface LinkedInProfile {
  id: string;
  firstName: string;
  lastName: string;
  headline: string;
  profileUrl: string;
  photoUrl?: string;
  location?: string;
  connectionDegree?: number;
}

export interface LinkedInActionResult {
  success: boolean;
  action: LinkedInActionType;
  error?: string;
  rateLimited?: boolean;
}

// ── API Client ──

function getUnipileConfig(): { apiKey: string; baseUrl: string } {
  const apiKey = process.env.UNIPILE_API_KEY;
  if (!apiKey) {
    throw new Error("UNIPILE_API_KEY not configured");
  }
  return {
    apiKey,
    baseUrl: process.env.UNIPILE_BASE_URL ?? "https://api.unipile.com/api/v1",
  };
}

async function unipileRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const { apiKey, baseUrl } = getUnipileConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Unipile API ${res.status}: ${errText}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Actions (all rate-limited) ──

/**
 * View a LinkedIn profile.
 * Creates "curiosity" — the person sees you viewed their profile.
 * SAFE limit: 80/day.
 */
export async function viewProfile(
  accountId: string,
  contactId: string,
  linkedinUrl: string
): Promise<LinkedInActionResult> {
  // HARD LIMIT CHECK — never skip this
  const limit = await checkLinkedInLimit(accountId, "profile_view");
  if (!limit.allowed) {
    return {
      success: false,
      action: "profile_view",
      error: limit.reason,
      rateLimited: true,
    };
  }

  try {
    // Extract LinkedIn profile ID from URL
    const profileId = extractProfileId(linkedinUrl);
    if (!profileId) {
      return {
        success: false,
        action: "profile_view",
        error: `Invalid LinkedIn URL: ${linkedinUrl}`,
      };
    }

    await unipileRequest(`/linkedin/profile/${profileId}`, { method: "GET" });

    // Record successful action
    await recordLinkedInAction(accountId, "profile_view", contactId, {
      linkedinUrl,
    });

    // Human-like delay: 2-5 seconds after viewing
    await randomDelay(2000, 5000);

    return { success: true, action: "profile_view" };
  } catch (err) {
    return {
      success: false,
      action: "profile_view",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Send a connection request with a personalized note.
 * SAFE limit: 15/day, 80/week.
 * Note MUST be personalized — identical messages get flagged at ~50.
 */
export async function sendConnectionRequest(
  accountId: string,
  contactId: string,
  linkedinUrl: string,
  note: string
): Promise<LinkedInActionResult> {
  // HARD LIMIT CHECK
  const limit = await checkLinkedInLimit(accountId, "connection_request");
  if (!limit.allowed) {
    return {
      success: false,
      action: "connection_request",
      error: limit.reason,
      rateLimited: true,
    };
  }

  // Note length limit: LinkedIn allows 300 chars max
  const trimmedNote = note.slice(0, 300);

  try {
    const profileId = extractProfileId(linkedinUrl);
    if (!profileId) {
      return {
        success: false,
        action: "connection_request",
        error: `Invalid LinkedIn URL: ${linkedinUrl}`,
      };
    }

    await unipileRequest("/linkedin/invitation", {
      method: "POST",
      body: {
        linkedin_identifier: profileId,
        message: trimmedNote,
      },
    });

    await recordLinkedInAction(accountId, "connection_request", contactId, {
      linkedinUrl,
      noteLength: String(trimmedNote.length),
    });

    // Human-like delay: 3-8 seconds
    await randomDelay(3000, 8000);

    return { success: true, action: "connection_request" };
  } catch (err) {
    return {
      success: false,
      action: "connection_request",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Send a LinkedIn message (must be connected first).
 * SAFE limit: 25/day.
 * Message MUST be personalized.
 */
export async function sendMessage(
  accountId: string,
  contactId: string,
  linkedinUrl: string,
  message: string
): Promise<LinkedInActionResult> {
  // HARD LIMIT CHECK
  const limit = await checkLinkedInLimit(accountId, "message");
  if (!limit.allowed) {
    return {
      success: false,
      action: "message",
      error: limit.reason,
      rateLimited: true,
    };
  }

  try {
    const profileId = extractProfileId(linkedinUrl);
    if (!profileId) {
      return {
        success: false,
        action: "message",
        error: `Invalid LinkedIn URL: ${linkedinUrl}`,
      };
    }

    await unipileRequest("/linkedin/message", {
      method: "POST",
      body: {
        linkedin_identifier: profileId,
        message,
      },
    });

    await recordLinkedInAction(accountId, "message", contactId, {
      linkedinUrl,
      messageLength: String(message.length),
    });

    // Human-like delay: 5-12 seconds
    await randomDelay(5000, 12000);

    return { success: true, action: "message" };
  } catch (err) {
    return {
      success: false,
      action: "message",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Helpers ──

/**
 * Extract LinkedIn profile ID from URL.
 * Handles: linkedin.com/in/username, linkedin.com/in/username/
 */
function extractProfileId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/in\/([^/]+)/);
    return match ? match[1] : null;
  } catch {
    // Maybe it's just a username
    if (/^[a-zA-Z0-9-]+$/.test(url)) return url;
    return null;
  }
}

/**
 * Random delay to mimic human behavior.
 * LinkedIn detects fixed intervals — randomization is critical.
 */
function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}
