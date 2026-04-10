import { z } from "zod";

// ── Types ──

export interface PlaceResult {
  name: string;
  address: string;
  country: string;
  city: string;
  phone?: string;
  website?: string;
  rating?: number;
  totalRatings?: number;
  placeId: string;
  types: string[];
  location: { lat: number; lng: number };
}

const PlaceResponseSchema = z.object({
  places: z.array(
    z.object({
      id: z.string(),
      displayName: z.object({ text: z.string() }),
      formattedAddress: z.string().optional(),
      nationalPhoneNumber: z.string().optional(),
      internationalPhoneNumber: z.string().optional(),
      websiteUri: z.string().optional(),
      rating: z.number().optional(),
      userRatingCount: z.number().optional(),
      types: z.array(z.string()).optional(),
      location: z
        .object({ latitude: z.number(), longitude: z.number() })
        .optional(),
      addressComponents: z
        .array(
          z.object({
            longText: z.string(),
            types: z.array(z.string()),
          })
        )
        .optional(),
    })
  ),
});

// ── Queries ──

/**
 * Generate Google Maps search queries for pharma distributors in a country/city.
 */
export function generateMapsQueries(
  country: string,
  city?: string
): string[] {
  const location = city ? `${city}, ${country}` : country;
  return [
    `pharmaceutical distributor in ${location}`,
    `pharma wholesale ${location}`,
    `supplement distributor ${location}`,
    `medical products distributor ${location}`,
    `nutraceutical importer ${location}`,
  ];
}

// ── API ──

/**
 * Search Google Maps Places API (New) for businesses.
 * Uses the Text Search endpoint: https://places.googleapis.com/v1/places:searchText
 *
 * Requires GOOGLE_PLACES_API_KEY env var.
 * Cost: ~$0.032 per request (Text Search).
 */
export async function searchGoogleMaps(
  query: string,
  options: { maxResults?: number } = {}
): Promise<PlaceResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn("GOOGLE_PLACES_API_KEY not set, skipping Google Maps search");
    return [];
  }

  const maxResults = Math.min(options.maxResults ?? 20, 20);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.nationalPhoneNumber",
            "places.internationalPhoneNumber",
            "places.websiteUri",
            "places.rating",
            "places.userRatingCount",
            "places.types",
            "places.location",
            "places.addressComponents",
          ].join(","),
        },
        body: JSON.stringify({
          textQuery: query,
          maxResultCount: maxResults,
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Google Places API error: ${res.status} ${errText}`);
    }

    const raw = await res.json();
    const parsed = PlaceResponseSchema.safeParse(raw);

    if (!parsed.success) {
      console.warn("Google Places response parse error:", parsed.error.message);
      return [];
    }

    return parsed.data.places.map((place) => {
      const addressComponents = place.addressComponents ?? [];
      const countryComponent = addressComponents.find((c) =>
        c.types.includes("country")
      );
      const cityComponent = addressComponents.find(
        (c) =>
          c.types.includes("locality") ||
          c.types.includes("administrative_area_level_1")
      );

      return {
        name: place.displayName.text,
        address: place.formattedAddress ?? "",
        country: countryComponent?.longText ?? "",
        city: cityComponent?.longText ?? "",
        phone:
          place.internationalPhoneNumber ?? place.nationalPhoneNumber,
        website: place.websiteUri,
        rating: place.rating,
        totalRatings: place.userRatingCount,
        placeId: place.id,
        types: place.types ?? [],
        location: {
          lat: place.location?.latitude ?? 0,
          lng: place.location?.longitude ?? 0,
        },
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Search multiple queries and deduplicate by placeId.
 * Used by the scrape pipeline for comprehensive coverage.
 */
export async function searchGoogleMapsMulti(
  queries: string[],
  options: { maxResultsPerQuery?: number } = {}
): Promise<PlaceResult[]> {
  const seen = new Set<string>();
  const results: PlaceResult[] = [];

  for (const query of queries) {
    const places = await searchGoogleMaps(query, {
      maxResults: options.maxResultsPerQuery ?? 20,
    });

    for (const place of places) {
      if (!seen.has(place.placeId)) {
        seen.add(place.placeId);
        results.push(place);
      }
    }

    // Rate limit: 1 second between queries
    if (queries.indexOf(query) < queries.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return results;
}
