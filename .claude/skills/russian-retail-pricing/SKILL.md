# Russian Retail Price Monitoring — Architecture & Sources

## When to use

When building or extending price-monitoring systems for the Russian retail market — federal grocery chains, marketplaces, dark stores, or aggregators. Pairs with `web-scraping-scale` for crawler infrastructure and `lead-data-fusion` for cross-source identity matching.

Trigger keywords: "прайс-мониторинг", "цены ритейл РФ", "Магнит/Пятёрочка/Лента/Метро/Wildberries/Ozon", "competitor pricing", "SKU × сеть × город", "роскос".

## The single most important fact

**Anti-detect libraries (camoufox, playwright-stealth) bypass JS fingerprinting but DO NOT bypass IP geofiltering.** Servicepipe (which protects X5/Магнит/Купер/Самокат) returns a `xpvnsulc/?...&request_ip=...` challenge to any non-RU IP **before** the browser even reaches the page. You need a Russian IP — proxy or VPS — for ~80% of federal chains. There is no headless trick around this.

The exceptions (sources that work from any IP) are documented below — start there.

## Source map (verified 2026-04-08)

### Tier 0 — Works with no proxy, no auth, no browser

| Source | Endpoint | Key insight |
|---|---|---|
| **Wildberries** | `https://search.wb.ru/exactmatch/ru/common/v5/search?dest=<id>&query=<text>` | Public JSON API. `dest=-1255942` is Krasnoyarsk delivery zone. Returns `products[].sizes[].price.{basic,product}` in **kopecks** (divide by 100). Rate limit ~10/min/IP, returns 429 — backoff 1.5–4s. |
| **METRO Cash & Carry** | `POST https://api.metro-cc.ru/products-api/graph` (GraphQL) | **One query returns prices for all 97 stores in Russia.** No auth. Set Origin/Referer to `online.metro-cc.ru`. Returns `Product.barcodes` (EAN-13) and `Stock.prices_per_unit` — much richer than WB. Has `Price.is_promo` + `start_date`/`end_date`. |
| **Open-Inflation/chizhik_api** (Python) | wraps Chizhik web API | Works from any IP, but **Chizhik has limited regional coverage** (no Krasnoyarsk yet) and is private-label dominant — third-party brands rare. |

### Tier 1 — Needs RU proxy or VPS

All federal grocery chains and marketplaces below are blocked by Servicepipe / Cloudflare / Imperva geofilter when accessed from non-RU IPs:

| Source | Status | Best client |
|---|---|---|
| **Пятёрочка** (5ka.ru) | Servicepipe geoblock → 403 | [`Open-Inflation/pyaterochka_api`](https://github.com/Open-Inflation/pyaterochka_api) — uses camoufox internally, accepts `proxy=` in constructor |
| **Перекрёсток** (perekrestok.ru) | Servicepipe geoblock → challenge redirect | [`Open-Inflation/perekrestok_api`](https://github.com/Open-Inflation/perekrestok_api) — async, accepts `proxy=` |
| **Магнит** (magnit.ru) | Full TCP-level blackhole, ConnectTimeout | No public client. Reverse mobile API (mitmproxy on emulator) or Playwright + curl-impersonate |
| **Лента** (lenta.com) | 401 Unauthorized | Reverse mobile API. Old [gist](https://gist.github.com/thevar1able/c2ea032d364c4c070f0b35ed8f74a99b) is from 2019, only promotions, useless for catalog |
| **Ozon** | 403 with `x-o3-app-name` headers | composer-api.bx + entrypoint-api.bx, needs `x-o3-app-name: dweb_client` + session cookies |
| **Я.Маркет** | 403 on `/api/resolve/` | resolve API with `Origin: market.yandex.ru` + cookies |
| **Самокат** | 403 entire domain | No client. Mobile API reverse |
| **Купер/СберМаркет** | Servicepipe + buyer API archived | x0rium/sbermarket-api archived 2022. Official Kuper API at docs.kuper.ru is **merchant-only**. |
| **ВкусВилл** | 401/404 on guessed paths | No public client. Mobile API reverse |
| **Метро** (catalog beyond GraphQL) | 403 on /api/v1/ paths | Not needed — GraphQL covers everything |

### Tier 2 — Excluded

| Source | Why |
|---|---|
| **Командор**, **Красный Яр** (Krasnoyarsk regional leaders) | No online catalog. Site is corporate-only, no e-commerce. |
| **Светофор** | Same — discounter model excludes online catalog by design |
| **Чижик** in regions where it's not yet open | API works but `has_shop: false` |

### Tier 3 — Premium (paid, contract required)

| Source | Cost | Value |
|---|---|---|
| **OFD.ru / Контур.ОФД / Платформа ОФД / Такском** | ~10–30k₽/mo + corporate registration | **Real receipt-level prices** from cash registers, not catalog. The product moat — competitors (Priceva, Competera) don't have this. Several weeks setup. |
| **Priceva.ru** | from ~15k₽/mo | Turnkey monitoring of FMCG retail — 200+ chains. Has API. **The "buy don't build" option.** |
| **Competera** | enterprise, 100k+₽/mo | Enterprise repricing for top brands |

## METRO GraphQL — full reference

This is the single most valuable source we have. Document carefully because it covers all 97 Russian Metro stores in one call.

### Endpoint
```
POST https://api.metro-cc.ru/products-api/graph
Headers:
  User-Agent: Mozilla/5.0 ... Chrome/130
  Content-Type: application/json
  Origin: https://online.metro-cc.ru
  Referer: https://online.metro-cc.ru/
```

### Search query
```graphql
query Search($text: String!, $storeId: Int!, $size: Int!, $from: Int!) {
  search(text: $text, storeId: $storeId) {
    products(from: $from, size: $size) {
      total
      products {
        id article name barcodes
        manufacturer { name }
        stocks(allStocks: true) {
          store_id value text eshop_availability
          prices { price old_price discount is_promo start_date end_date }
          prices_per_unit { price old_price discount }
        }
      }
    }
  }
}
```

`storeId` is required by the API but mostly affects which products are surfaced — set it to `10` (Moscow) and the `stocks(allStocks: true)` field returns prices for **all stores** anyway.

### Resolving city → store_id

Metro doesn't expose a stores list API. Map cities by:

1. Find the canonical URL for a city's flagship store, e.g. via Google search `metro cash carry <city> address` → `online.metro-cc.ru/markets/<city-slug>/<store-slug>`.
2. GET that URL with regular browser headers.
3. The page contains a `window.__NUXT__ = (function(a,b,c,...){...}(val1,val2,...))` IIFE state. Each store object looks like `{id:iL,store_id:it,name:"...",address:"..."}` — `store_id` is a minified variable name.
4. Find the position of that variable in the function signature, then read the corresponding value from the IIFE invocation.
5. Cache the city → store_id mapping in a JSON file.

**Confirmed mappings (sample):**
- Moscow → `10`
- Krasnoyarsk → `46` (П. Солонцы, пр-т Котельникова, д. 1)

### Schema highlights

- `Product.barcodes` is an EAN-13 array — **the canonical identity key for cross-source matching** (the only thing that reliably joins WB / Metro / others).
- `Product.manufacturer.name` is the **trusted brand** — much cleaner than WB's `brand` field which often shows "Snickers" for Mars listings due to combo cards.
- `Stock.prices_per_unit` gives normalized per-unit pricing for multipacks — saves having to parse pack size from name.
- `Stock.text` is the human-readable stock indicator: "Товара много", "Товара мало", "Товара достаточно", "Нет в наличии".

## Wildberries — important caveats

WB lets you fetch with no auth, but the data is messy:

- **Brand field is unreliable.** Mars listings often show `brand: "Snickers"` because they're combo packs. Filter by name + manufacturer instead, never by brand.
- **No barcodes** in the search response — you cannot identity-match WB to Metro by EAN-13 directly. Match by `(brand + size + pack_count + name fuzzy)`.
- **`\b` regex is ASCII-only in JS/Python** — `\bгр\b` does NOT match because Russian "р" isn't a word char. Use `(?![а-яa-z])` lookahead instead. This eats hours if you don't know it.
- **Prices are in kopecks**, not rubles. `basic: 4960` = 49.60₽. Divide by 100.
- **Most listings are B2B reseller blocks** (3, 5, 8, 12, 36, 96 pieces). Single-bar Mars 50g doesn't really exist on WB — only multi-packs. Always parse pack count from name and compute per-unit price.
- **Rate limit** ~10–20 req/min/IP. Cycle hosts (`v4`/`v5`, `ru`/`sng` paths) and backoff on 429.

## Architectural choices for РОСКОС

### Why Bun + Python hybrid

- Bun is the orchestrator: TS adapters for sources with simple HTTP APIs (WB, future direct REST), unified `PriceObservation` schema, parallel `runAll()`, formatters.
- Python via `uv` is for sources with existing battle-tested clients: Open-Inflation libs (`pyaterochka_api`, `perekrestok_api`, `chizhik_api`) and Metro GraphQL with httpx.
- Bun shells out to Python via `Bun.spawn` with stdout JSON. ~500ms overhead per Python invocation — fine for 30-min trigger cadence.

### Unified observation schema

Every adapter emits `PriceObservation[]`:
```typescript
interface PriceObservation {
  capturedAt: string;
  source: "wildberries" | "metro" | ...;
  city: string | null;
  storeId: number | string | null;
  nmId: number | string;
  barcode: string | null;       // identity key
  name: string;
  brand: string;
  supplier: string;
  packSize: number;
  basicRub: number | null;
  saleRub: number | null;
  basicPerUnitRub: number | null;
  salePerUnitRub: number | null; // the apples-to-apples metric
  discountPct: number | null;
  isPromo?: boolean;
  promoStart?: string | null;
  promoEnd?: string | null;
  available?: boolean;
  stockText?: string | null;
  url: string;
}
```

The orchestrator does no cross-source merging beyond concatenation — all dedup/identity-matching happens at the consumer level (database UPSERT by `(source, store_id, nm_id, captured_at)` composite key).

### Storage shape (for ProLife/Postgres)

```prisma
model PriceObservation {
  id            String   @id @default(cuid())
  source        String
  storeId       String
  city          String?
  productId     String   // source-native id (nmId)
  barcode       String?  @db.VarChar(14)
  brand         String
  name          String
  packSize      Int
  basicRub      Decimal? @db.Decimal(10,2)
  saleRub       Decimal? @db.Decimal(10,2)
  basicPerUnit  Decimal? @db.Decimal(10,2)
  salePerUnit   Decimal? @db.Decimal(10,2)
  discountPct   Int?
  isPromo       Boolean  @default(false)
  promoStart    DateTime?
  promoEnd      DateTime?
  capturedAt    DateTime @default(now())

  @@index([source, storeId, productId, capturedAt])
  @@index([barcode, capturedAt])
  @@index([city, capturedAt])
}
```

Index by `barcode` because that's the cross-source join key. Index by `(source, storeId, productId, capturedAt)` because that's how you fetch history for a single SKU at a single store.

## Buyer landscape (who pays for this data)

Three buyer personas, ranked by ARPA potential:

1. **Brands (Mars, Nestle, PepsiCo, Unilever)** — for trade marketing and **МРЦ control** (suggested retail price compliance). Highest willingness to pay. Want accurate per-store granularity.
2. **Sales chains themselves** — competitive intelligence. Want to know "is Магнит cheaper than us by SKU in our stores' radius". Real-time matters. Currently buy Nielsen/Ромир panel data — slow, expensive, low granularity.
3. **Distributors** — anti-dumping monitoring. Need to spot grey-market resellers undercutting suggested prices.

The **moat over Priceva/Competera** is OFD-level data (real cash register prices, not catalog). Tier 3 above. Worth pursuing once Tier 0+1 are working and there's a paying customer.

## Common pitfalls

| Pitfall | Fix |
|---|---|
| Trying anti-detect from non-RU IP | Doesn't help. You need IP, not fingerprint. |
| Filtering Mars by `brand: "Mars"` on WB | Brand is wrong on combo packs. Use name regex. |
| Matching WB ↔ Metro by name fuzzy | Use barcode when possible (Metro has it, WB doesn't — match Metro→other instead) |
| Treating WB prices as rubles | They're in kopecks. ÷100. |
| `\b` regex with cyrillic | Use `(?![а-яa-z])` lookahead instead |
| Forgetting `Origin`/`Referer` headers on Russian APIs | Most return 403 without them |
| Building "Krasnoyarsk only" vertical | Metro gives 97 cities for free. Multi-city is the same effort as one city. |
| Picking WB as the primary truth | WB shows reseller B2B blocks, not real retail. Metro has actual unit pricing. |

## When you find a new source

Standard probing sequence (5 minutes):

1. `GET <homepage>` with browser UA — does it work or 403/timeout?
2. Find their api subdomain or `/api/` path. Try common shapes: `/api/v1/`, `/api/v2/`, `/api/customer/`, `/api/products/`, `/graph`.
3. `POST <graphql-endpoint> { query: "{ __schema { queryType { name fields { name } } } }" }` — if 200 with JSON, you have introspection and can map all available queries.
4. Check for cookies set by the homepage that look like `storeId`, `cityId`, `coordinates` — that's how the site picks region.
5. Search GitHub for `<retailer-name> api parser python` and `Open-Inflation/<retailer>_api` — the community has often done the work already.
6. Search the retailer's sitemap.xml for city-specific URLs.

## Sources

- [METRO Cash & Carry online](https://online.metro-cc.ru/)
- [Open-Inflation organization](https://github.com/Open-Inflation) — RU retail API clients
- [pyaterochka_api](https://github.com/Open-Inflation/pyaterochka_api)
- [perekrestok_api](https://github.com/Open-Inflation/perekrestok_api)
- [chizhik_api](https://github.com/Open-Inflation/chizhik_api)
- [camoufox](https://github.com/daijro/camoufox) — anti-detect Firefox fork
- [Priceva](https://www.priceva.ru/) — turnkey FMCG monitoring
- [OFD.ru API](https://ofd.ru/razrabotchikam) — receipt-level fiscal data
