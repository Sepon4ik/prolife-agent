export interface ExhibitorData {
  name: string;
  country: string;
  city?: string;
  website?: string;
  description?: string;
  categories?: string[];
  boothNumber?: string;
  contactEmail?: string;
  contactPhone?: string;
}

/**
 * Extract exhibitor data from a raw page scrape.
 * Each exhibition site has different structure —
 * this function normalizes the output.
 */
export function extractExhibitorData(rawData: {
  url: string;
  text: string;
  title: string;
}): Partial<ExhibitorData> {
  const text = rawData.text ?? "";

  // Extract emails from page text
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = text.match(emailRegex) ?? [];

  // Extract phone numbers
  const phoneRegex = /[\+]?[(]?[0-9]{1,4}[)]?[-\s\./0-9]{7,}/g;
  const phones = text.match(phoneRegex) ?? [];

  // Extract website URLs
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  const urls = text.match(urlRegex) ?? [];

  return {
    name: rawData.title?.replace(/\s*[-|].*$/, "").trim(),
    contactEmail: emails[0],
    contactPhone: phones[0],
    website: urls.find(
      (u) =>
        !u.includes("facebook") &&
        !u.includes("twitter") &&
        !u.includes("linkedin") &&
        !u.includes("instagram")
    ),
  };
}
