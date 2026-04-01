export interface CompanyWebsiteData {
  companyName: string;
  description: string;
  products: string[];
  aboutText: string;
  contactEmails: string[];
  contactPhones: string[];
  socialLinks: Record<string, string>;
  hasEcommerce: boolean;
  teamMembers: Array<{ name: string; title: string }>;
}

/**
 * Extract structured data from a company website.
 * Used in the enrichment pipeline after initial scraping.
 */
export function extractCompanyWebsite(rawData: {
  url: string;
  text: string;
  links: Array<{ href: string; text: string }>;
}): Partial<CompanyWebsiteData> {
  const text = rawData.text ?? "";
  const links = rawData.links ?? [];

  // Extract emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const contactEmails = [...new Set(text.match(emailRegex) ?? [])];

  // Extract phone numbers
  const phoneRegex = /[\+]?[(]?[0-9]{1,4}[)]?[-\s\./0-9]{7,}/g;
  const contactPhones = [...new Set(text.match(phoneRegex) ?? [])];

  // Detect e-commerce
  const ecommerceKeywords = [
    "add to cart",
    "buy now",
    "shop",
    "e-shop",
    "online store",
    "checkout",
    "shopping cart",
  ];
  const hasEcommerce = ecommerceKeywords.some((kw) =>
    text.toLowerCase().includes(kw)
  );

  // Social links
  const socialLinks: Record<string, string> = {};
  for (const link of links) {
    if (link.href.includes("linkedin.com")) socialLinks.linkedin = link.href;
    if (link.href.includes("facebook.com")) socialLinks.facebook = link.href;
    if (link.href.includes("instagram.com")) socialLinks.instagram = link.href;
  }

  return {
    contactEmails,
    contactPhones,
    hasEcommerce,
    socialLinks,
    description: text.slice(0, 2000),
  };
}
