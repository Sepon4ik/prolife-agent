/** Region → country mapping for pipeline sidebar navigation */
export const REGIONS: Record<string, string[]> = {
  MENA: [
    "Saudi Arabia", "UAE", "United Arab Emirates", "Egypt", "Qatar",
    "Kuwait", "Bahrain", "Oman", "Jordan", "Lebanon", "Iraq", "Iran",
    "Morocco", "Tunisia", "Algeria", "Libya", "Nigeria", "Kenya",
    "South Africa", "Ghana", "Tanzania",
  ],
  ASIA: [
    "India", "Pakistan", "Bangladesh", "Philippines", "Vietnam",
    "Thailand", "Turkey", "South Korea", "Malaysia", "Singapore",
    "Indonesia", "China", "Japan", "Taiwan", "Myanmar",
  ],
  CIS: [
    "Russia", "Kazakhstan", "Uzbekistan", "Kyrgyzstan", "Tajikistan",
    "Turkmenistan", "Azerbaijan", "Georgia", "Armenia", "Belarus",
    "Moldova", "Ukraine",
  ],
  EUROPE: [
    "Germany", "France", "United Kingdom", "Italy", "Spain",
    "Netherlands", "Belgium", "Switzerland", "Austria", "Poland",
    "Czech Republic", "Sweden", "Norway", "Denmark", "Finland",
    "Portugal", "Greece", "Romania", "Hungary", "Bulgaria",
  ],
  AMERICAS: [
    "USA", "Canada", "Mexico", "Brazil", "Argentina",
    "Colombia", "Chile", "Peru",
  ],
};

const countryToRegion = new Map<string, string>();
for (const [region, countries] of Object.entries(REGIONS)) {
  for (const country of countries) {
    countryToRegion.set(country.toLowerCase(), region);
  }
}

export function getRegion(country: string): string {
  return countryToRegion.get(country.toLowerCase()) ?? "OTHER";
}

export function getCountriesInRegion(region: string): string[] {
  return REGIONS[region] ?? [];
}

export function getAllRegions(): string[] {
  return Object.keys(REGIONS);
}
