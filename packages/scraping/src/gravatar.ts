/**
 * Gravatar API — free photo lookup by email.
 * ~5% match rate but completely free and instant.
 */

import { createHash } from "crypto";

/**
 * Get Gravatar photo URL for an email address.
 * Returns null if no Gravatar exists.
 */
export async function getGravatarUrl(
  email: string
): Promise<string | null> {
  if (!email) return null;

  const hash = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");

  const url = `https://gravatar.com/avatar/${hash}?d=404&s=200`;

  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      // Photo exists — return the URL (without d=404 so it loads normally)
      return `https://gravatar.com/avatar/${hash}?s=200`;
    }

    return null; // 404 = no gravatar
  } catch {
    return null;
  }
}
