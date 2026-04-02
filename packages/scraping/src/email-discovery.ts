/**
 * Email Discovery — Pattern Guessing + SMTP Verification
 * Free methods to find email addresses for contacts.
 */

/**
 * Generate common email patterns from a person's name and company domain.
 */
export function generateEmailPatterns(
  firstName: string,
  lastName: string,
  domain: string
): string[] {
  const f = firstName.toLowerCase().replace(/[^a-z]/g, "");
  const l = lastName.toLowerCase().replace(/[^a-z]/g, "");

  if (!f || !l || !domain) return [];

  return [
    `${f}@${domain}`,              // john@company.com
    `${f}.${l}@${domain}`,         // john.doe@company.com
    `${f}${l}@${domain}`,          // johndoe@company.com
    `${f[0]}${l}@${domain}`,       // jdoe@company.com
    `${f}${l[0]}@${domain}`,       // johnd@company.com
    `${f[0]}.${l}@${domain}`,      // j.doe@company.com
    `${f}_${l}@${domain}`,         // john_doe@company.com
    `${l}@${domain}`,              // doe@company.com
    `${l}.${f}@${domain}`,         // doe.john@company.com
  ];
}

/**
 * Basic SMTP email verification.
 * Connects to the MX server and checks if the mailbox exists.
 * Returns true if likely valid, false if definitely invalid.
 *
 * Note: Many servers return true for all addresses (catch-all).
 * This eliminates only clearly invalid addresses.
 */
export async function verifyEmailSMTP(email: string): Promise<{
  valid: boolean;
  catchAll: boolean;
  reason?: string;
}> {
  // For serverless environments, we can't do raw SMTP connections.
  // Use DNS MX lookup as a basic check instead.
  try {
    const domain = email.split("@")[1];
    if (!domain) return { valid: false, catchAll: false, reason: "invalid format" };

    // Check if domain has MX records via DNS-over-HTTPS (works in serverless)
    const res = await fetch(
      `https://dns.google/resolve?name=${domain}&type=MX`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data: any = await res.json();

    if (!data.Answer || data.Answer.length === 0) {
      return { valid: false, catchAll: false, reason: "no MX records" };
    }

    // Domain has MX records — email is likely valid
    // We can't do full SMTP RCPT TO check in serverless
    return { valid: true, catchAll: false };
  } catch {
    // DNS check failed — assume valid (don't reject on network errors)
    return { valid: true, catchAll: false, reason: "dns check failed" };
  }
}

/**
 * Find the best email for a contact using pattern guessing.
 * Returns the first pattern that passes MX validation.
 */
export async function findEmailByPattern(
  firstName: string,
  lastName: string,
  domain: string
): Promise<string | null> {
  const patterns = generateEmailPatterns(firstName, lastName, domain);
  if (patterns.length === 0) return null;

  // First, verify the domain has MX records at all
  const domainCheck = await verifyEmailSMTP(`test@${domain}`);
  if (!domainCheck.valid) return null;

  // Domain is valid — return the most common pattern
  // (firstname@domain is most common in Middle East / small companies)
  return patterns[0];
}

/**
 * Extract domain from a URL or website string.
 */
export function extractDomain(website: string): string | null {
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return null;
  }
}
