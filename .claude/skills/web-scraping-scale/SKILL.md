# Web Scraping at Scale — B2B Data Collection

## When to use
When building or improving web scraping features, data enrichment pipelines, or contact discovery systems.

## Architecture: Queue-Based Scraping

```
API Request → Job Queue (Inngest) → Worker Pool → Scrape → Extract → Store → Enrich
                                        ↓
                                   Proxy Rotation
                                   Rate Limiting
                                   Retry Logic
```

### Current ProLife Architecture
```typescript
// Inngest function: scrape-pipeline.ts
export const scrapePipeline = inngest.createFunction(
  { id: "scrape", throttle: { limit: 3, period: "1s" }, retries: 3 },
  { event: "prolife/scrape.started" },
  async ({ event, step }) => {
    // Step 1: Crawl source
    // Step 2: Extract companies
    // Step 3: Upsert to DB
    // Step 4: Trigger enrichment for new companies
  }
);
```

## Scraping Methods Comparison

| Method | Speed | JS Support | Anti-Detection | Cost | Best For |
|--------|-------|-----------|---------------|------|----------|
| **fetch + cheerio** | Fastest | No | Low | Free | Static HTML, APIs |
| **Playwright** | Slow | Full | Medium | Free + compute | SPAs, JS-rendered |
| **ScraperAPI** | Medium | Yes | High | $49-249/mo | Anti-bot sites |
| **BrightData** | Medium | Yes | Highest | $500+/mo | Enterprise scale |
| **Crawlee** | Medium | Both | Medium | Free + compute | Complex crawls |

**ProLife uses fetch + cheerio** — correct choice for serverless (Vercel). Switch to Playwright only for JS-heavy sites.

## Anti-Detection Techniques

### User-Agent Rotation
```typescript
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/17.5",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}
```

### Request Headers (look like a real browser)
```typescript
const headers = {
  "User-Agent": randomUA(),
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "max-age=0",
};
```

### Request Spacing
```typescript
// Random delay between requests (1-3 seconds)
async function delay(): Promise<void> {
  const ms = 1000 + Math.random() * 2000;
  await new Promise(resolve => setTimeout(resolve, ms));
}
```

### Proxy Rotation
```typescript
// Rotate through proxy list
const PROXIES = process.env.PROXY_URLS?.split(",") ?? [];
let proxyIndex = 0;

function getNextProxy(): string | undefined {
  if (PROXIES.length === 0) return undefined;
  const proxy = PROXIES[proxyIndex % PROXIES.length];
  proxyIndex++;
  return proxy;
}

// With fetch (using undici ProxyAgent for Node.js)
import { ProxyAgent } from "undici";
const response = await fetch(url, {
  headers,
  dispatcher: proxy ? new ProxyAgent(proxy) : undefined,
});
```

### Proxy Provider Comparison

| Provider | Type | Price | IPs | Best For |
|----------|------|-------|-----|----------|
| **BrightData** | Residential/DC | $500+/mo | 72M+ | Enterprise, anti-bot |
| **Oxylabs** | Residential/DC | $300+/mo | 100M+ | Large scale |
| **SmartProxy** | Residential | $80+/mo | 55M+ | Mid-scale |
| **ScraperAPI** | Managed | $49+/mo | Auto-rotate | Simple integration |
| **Webshare** | Datacenter | $30+/mo | 30K+ | Budget, low-security sites |

**For ProLife (startup phase):** Start without proxies. Add SmartProxy ($50/mo, 5GB) if getting blocked. Upgrade to BrightData for enterprise scale.

## TLS Fingerprinting (JA3/JA4)

Every HTTP client has a unique TLS handshake fingerprint. Anti-bot systems (Cloudflare, DataDome) detect Python/Node.js clients instantly.

**Problem:** Node.js `fetch` has a distinctive JA3 hash ≠ real Chrome.
**Solution for Node.js:** Use Playwright with stealth (real browser TLS) or proxy through managed services.
**Solution for Python:** Use `curl_cffi` with `impersonate="chrome"`.

**Key rule:** Match User-Agent to TLS fingerprint. Chrome UA + Python TLS = instant block.

## AI-Powered Data Extraction

### When to use AI vs selectors

**Use CSS selectors/regex when:**
- Page structure is consistent (same template for all pages)
- You need specific fields (email, phone)
- Speed and cost matter

**Use AI (Claude Haiku) when:**
- Page structure varies across sites
- You need to interpret/classify content
- Extraction requires understanding context
- Building contact pages where names/titles are in free text

### Hybrid Pattern (what ProLife does)
```typescript
// Step 1: Extract structured data with cheerio (free, fast)
const $ = cheerio.load(html);
const emails = extractEmails($.text()); // regex
const phones = extractPhones($.text()); // regex
const links = $("a").map((_, el) => $(el).attr("href")).get();

// Step 2: Use AI only for ambiguous content (costs $0.001/page)
if (needsAIExtraction(pageText)) {
  const contacts = await discoverContacts(pageText, companyName); // Claude Haiku
}
```

### AI Extraction Prompt Pattern
```typescript
const systemPrompt = `Extract structured data from this webpage. 
Only extract what is explicitly stated — never guess or fabricate.
If a field is not found, set it to null.`;

const result = await ai.classify({
  model: "claude-haiku-4-5-20251001",
  system: systemPrompt,
  tools: [{
    name: "extract_data",
    input_schema: zodToJsonSchema(extractionSchema),
  }],
  tool_choice: { type: "tool", name: "extract_data" },
  messages: [{ role: "user", content: `Extract from:\n${pageText.slice(0, 8000)}` }],
});
```

## B2B Data Sources

### Company Discovery
| Source | Method | Data Quality | Cost |
|--------|--------|-------------|------|
| **Exhibition websites** | Crawl exhibitor lists | High (curated) | Free |
| **Google Search** | SerpAPI + crawl results | Medium | $50/mo (SerpAPI) |
| **LinkedIn** | API or scraping (risky) | Highest | $0-banned |
| **Industry directories** | Crawl directory pages | High | Free |
| **Google Maps** | Places API | Medium-High | $0.032/request |
| **Crunchbase** | API | High (tech/startup) | $99/mo |

### Contact Discovery (Waterfall Pattern)
Try each source in order until you find the contact:

```
1. Company website (team/about page) → FREE
2. Hunter.io API → $49/mo, 1000 lookups
3. Apollo.io API → $49/mo, export contacts
4. Snov.io API → $39/mo, email finder
5. LinkedIn Sales Navigator → $79/mo
6. Google Search "{name} {company} email" → FREE
```

```typescript
async function findContactEmail(name: string, company: string, domain: string): Promise<string | null> {
  // Level 1: Check website (already scraped)
  const websiteEmail = await checkWebsiteContacts(company);
  if (websiteEmail) return websiteEmail;
  
  // Level 2: Hunter.io
  if (process.env.HUNTER_API_KEY) {
    const hunterResult = await hunterEmailFinder(name, domain);
    if (hunterResult) return hunterResult;
  }
  
  // Level 3: Pattern guess + verify
  const patterns = generateEmailPatterns(name, domain);
  // firstname@, f.lastname@, firstname.lastname@
  for (const pattern of patterns) {
    const valid = await verifyEmail(pattern); // SMTP check
    if (valid) return pattern;
  }
  
  return null;
}
```

## Rate Limiting & Respectful Crawling

### robots.txt Compliance
```typescript
import { RobotsParser } from "robots-parser";

async function canCrawl(url: string): Promise<boolean> {
  const robotsUrl = new URL("/robots.txt", url).href;
  try {
    const res = await fetch(robotsUrl);
    const robots = new RobotsParser(robotsUrl, await res.text());
    return robots.isAllowed(url, "Mozilla/5.0") ?? true;
  } catch {
    return true; // No robots.txt = allowed
  }
}
```

### Rate Limiting per Domain
```typescript
const domainLastRequest = new Map<string, number>();
const MIN_DELAY_MS = 2000; // 2 seconds between requests to same domain

async function throttledFetch(url: string): Promise<Response> {
  const domain = new URL(url).hostname;
  const lastReq = domainLastRequest.get(domain) ?? 0;
  const elapsed = Date.now() - lastReq;
  
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(r => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  
  domainLastRequest.set(domain, Date.now());
  return fetch(url, { headers: getHeaders() });
}
```

## Scraping Monitoring

Track per job:
- **Success rate:** % of URLs that returned 200 OK
- **Block rate:** % that returned 403/429/captcha
- **Data yield:** companies extracted / pages crawled
- **Duration:** time per page (detect slowdowns)
- **Cost:** proxy cost + AI cost per lead

Alert when:
- Block rate > 20% → switch proxy provider or add delays
- Success rate < 80% → site may have changed structure
- Data yield drops → extraction logic may need updating

---

## Recommended open-source tools (researched 2026-04-09)

### Web data extraction

| Repo | Stars | Best for | Integrates with ProLife? |
|---|---|---|---|
| **firecrawl/firecrawl** | 106k | URL → clean markdown/structured data for AI. Best for feeding company pages to enrichment. | Yes — REST API, call from Inngest steps |
| **ScrapeGraphAI/Scrapegraph-ai** | 23k | LLM-powered scraping: give URL, get structured JSON. No selectors needed. | Python only — use as microservice or via API |
| **jina-ai/reader** | 10.5k | Prefix any URL with `r.jina.ai/` to get LLM-friendly text. Zero setup. | Yes — simple fetch, no SDK needed |

### Browser automation for scraping

| Repo | Stars | Best for | When to use |
|---|---|---|---|
| **apify/crawlee** | 23k | Node.js crawling framework. Playwright + Cheerio + proxy rotation + request queue. | Complex multi-page crawls. ProLife's stack is Node, so this fits. |
| **browser-use/browser-use** | 87k | AI agent that browses websites autonomously. | Lead research on company sites — let AI navigate and extract. |
| **stagehand-ai/stagehand** | ~13k | Playwright-based browser automation for AI agents. | When you need Playwright reliability + AI flexibility. |

### Anti-detection

| Repo | Stars | What it does |
|---|---|---|
| **nicedayzhu/camofox-browser** | 1.3k | Headless anti-detect browser. Randomized fingerprints. | For sites with aggressive bot detection. |

### Usage recommendation for ProLife
```
Simple company pages → fetch + cheerio (current, keep)
JS-heavy SPAs → crawlee with Playwright
AI extraction needed → firecrawl API or jina reader
Lead research → browser-use (autonomous browsing)
Anti-bot sites → crawlee + proxy rotation (SmartProxy)
```
