# ProLife Agent — Architecture & Service Map

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PROLIFE AGENT                                   │
│                    Next.js 14 + Vercel                                  │
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Dashboard │  │  Login   │  │ API      │  │ Webhooks │  │ Inngest  │ │
│  │ /dashboard│  │ /login   │  │ /api/*   │  │ /api/wh  │  │ /api/inn │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
└───────┼──────────────┼─────────────┼─────────────┼─────────────┼───────┘
        │              │             │             │             │
        ▼              ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        PACKAGES (Monorepo)                              │
│                                                                         │
│  @agency/db    @agency/ai    @agency/email   @agency/scraping           │
│  @agency/auth  @agency/intel @agency/linkedin @agency/queue             │
│  @agency/env   @agency/ui   @agency/notifications                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## External Services — When & Why

### Database & Auth
```
┌──────────────┐     ┌─────────────────┐
│ Neon Postgres│◄────│ @agency/db      │  EVERY request
│ (DATABASE_URL)│    │ Prisma ORM      │  19 models, pooled connection
└──────────────┘     └─────────────────┘

┌──────────────┐     ┌─────────────────┐
│ Neon Postgres│◄────│ @agency/auth    │  Login/logout/session check
│ (UNPOOLED)   │     │ better-auth + pg│  Tables: user, session, account
└──────────────┘     └─────────────────┘
```

### AI Processing
```
┌──────────────┐     ┌─────────────────┐
│ Anthropic API│◄────│ @agency/ai      │
│              │     │ @agency/intel   │
│ Haiku 4.5   │     └────────┬────────┘
│ Sonnet 4    │              │
└──────────────┘              │
                              ├── Company classification (Haiku)      → enrich-company
                              ├── Email generation (Sonnet)           → send-outreach
                              ├── News summarization (Haiku)          → news-collect
                              ├── News translation RU (Haiku)         → news-backfill
                              ├── Entity extraction (Haiku)           → news-collect
                              └── Reply classification (Haiku)        → handle-reply
```

### Outreach Channels
```
┌──────────────┐     ┌─────────────────┐
│ Resend API   │◄────│ @agency/email   │  send-outreach, follow-up
│ (RESEND_KEY) │     │ Plain-text only │  Multi-mailbox rotation
└──────────────┘     └─────────────────┘  Default: partnerships@prolife-global.net

┌──────────────┐     ┌─────────────────┐
│ Unipile API  │◄────│ @agency/linkedin│  multichannel-sequence
│ (UNIPILE_KEY)│     │ Rate-limited    │  15 conn/day, 25 msg/day, 80 views/day
└──────────────┘     └─────────────────┘
```

### Data Sources — Company Discovery
```
┌──────────────┐     ┌─────────────────┐
│ Apollo.io    │◄────│ @agency/scraping│  enrich-company (contact discovery)
│ (free search)│     │ apollo.ts       │  POST /api/v1/mixed_people/search
└──────────────┘     └─────────────────┘

┌──────────────┐     ┌─────────────────┐
│ Hunter.io    │◄────│ @agency/scraping│  enrich-company (email discovery)
│ (HUNTER_KEY) │     │ hunter.ts       │  ~$0.10/credit per reveal
└──────────────┘     └─────────────────┘

┌──────────────┐     ┌─────────────────┐
│ Google Places│◄────│ @agency/scraping│  scrape-pipeline (Google Maps)
│ (PLACES_KEY) │     │ google-maps.ts  │
└──────────────┘     └─────────────────┘

┌──────────────┐     ┌─────────────────┐
│ SerpAPI      │◄────│ @agency/scraping│  scrape-pipeline (Google Search)
│ (SERPAPI_KEY) │    │ google-search.ts│
└──────────────┘     └─────────────────┘

┌──────────────┐     ┌─────────────────┐
│ OpenCorporates│◄───│ @agency/scraping│  scrape-pipeline (trade registries)
│ (OPENCORP_KEY)│    │ trade-registries│
└──────────────┘     └─────────────────┘

┌──────────────┐     ┌─────────────────┐
│ Gravatar     │◄────│ @agency/scraping│  enrich-company (contact photos)
│ (free)       │     │ gravatar.ts     │
└──────────────┘     └─────────────────┘
```

### Data Sources — News Intelligence
```
┌──────────────┐     ┌─────────────────┐
│ 35 RSS Feeds │◄────│ @agency/intel   │  news-collect (every 6h)
│ (free)       │     │ aggregator.ts   │  FiercePharma, MedTech Dive,
└──────────────┘     └─────────────────┘  FDA, Drugs.com, Medgadget...

┌──────────────┐     ┌─────────────────┐
│ Google News  │◄────│ @agency/intel   │  news-collect (every 6h)
│ RSS (free)   │     │ aggregator.ts   │  Topic queries + company names
└──────────────┘     └─────────────────┘

┌──────────────┐     ┌─────────────────┐
│ GNews API    │◄────│ @agency/intel   │  news-collect (every 6h)
│ (GNEWS_KEY)  │     │ aggregator.ts   │  100 req/day free
└──────────────┘     └─────────────────┘

┌──────────────┐     ┌─────────────────┐
│ OpenFDA      │◄────│ @agency/intel   │  news-collect (every 6h)
│ (free, 5 EP) │     │ openfda.ts      │  Approvals, recalls, shortages
└──────────────┘     └─────────────────┘

┌──────────────┐     ┌─────────────────┐
│ClinicalTrials│◄────│ @agency/intel   │  news-collect (every 6h)
│ .gov (free)  │     │ clinical-trials │  Pharma distribution trials
└──────────────┘     └─────────────────┘

┌──────────────┐     ┌─────────────────┐
│ EMA (free)   │◄────│ @agency/intel   │  news-collect (every 6h)
│              │     │ ema.ts          │  European medicines
└──────────────┘     └─────────────────┘

┌──────────────┐     ┌─────────────────┐
│ UN Comtrade  │◄────│ @agency/intel   │  intel-pipeline (trade flows)
│ (COMTRADE_KEY)│    │ comtrade.ts     │  Pharma HS codes import data
└──────────────┘     └─────────────────┘

┌──────────────┐     ┌─────────────────┐
│ Pexels API   │◄────│ @agency/intel   │  news-collect, news-backfill
│ (PEXELS_KEY) │     │ content-extract │  Stock photos for news (free)
│ (free)       │     │                 │  200 req/hr
└──────────────┘     └─────────────────┘

┌──────────────┐     ┌─────────────────┐
│ Company Sites│◄────│ @agency/intel   │  website-monitor (daily 05:00)
│ (scraping)   │     │ website-monitor │  Top 50 companies, change detection
└──────────────┘     └─────────────────┘
```

### Notifications
```
┌──────────────┐     ┌─────────────────────┐
│ Telegram Bot │◄────│ @agency/notifications│  sales-handoff, alerts
│ (BOT_TOKEN)  │     │ @agency/intel/alerts │  sendMessage API
└──────────────┘     └─────────────────────┘

┌──────────────┐     ┌─────────────────────┐
│ Slack Webhook│◄────│ @agency/notifications│  sales-handoff, alerts
│ (WEBHOOK_URL)│     │ @agency/intel/alerts │  Incoming webhook POST
└──────────────┘     └─────────────────────┘
```

### Job Queue
```
┌──────────────┐     ┌─────────────────┐
│ Inngest      │◄────│ @agency/queue   │  ALL background jobs
│ (EVENT_KEY)  │     │ 12 functions    │  Crons + event-driven
│ (SIGNING_KEY)│     │                 │  Vercel serverless
└──────────────┘     └─────────────────┘
```

---

## Inngest Functions — Schedule & Triggers

### Cron Jobs (automated, runs on Vercel)
| Function | Schedule | What it does | Services called |
|---|---|---|---|
| `news-collect` | `0 */6 * * *` (every 6h) | Collect news from all sources | 35 RSS, Google News, GNews, FDA, EMA, ClinicalTrials, Pexels, Anthropic Haiku |
| `news-backfill` | `0 1,7,13,19 * * *` (+1h after collect) | Extract content + translate | Website scraping, Anthropic Haiku (translate) |
| `website-monitor` | `0 5 * * *` (daily 05:00) | Scrape company websites for changes | Company websites (cheerio) |
| `intel-pipeline` | `0 */6 * * *` (every 6h) | Full intel processing | Anthropic Haiku, Google News |

### Event-Driven (triggered by other functions or API)
| Function | Trigger | What it does | Services called |
|---|---|---|---|
| `scrape-pipeline` | `prolife/scrape.started` | Scrape a data source | Google, Maps, SerpAPI, exhibition sites |
| `enrich-company` | `prolife/company.enrich` | AI classify + find contacts | Anthropic Haiku, Apollo (free), Hunter ($), Gravatar |
| `score-company` | `prolife/company.score` | Calculate 11-factor score | None (DB only) |
| `send-outreach` | `prolife/outreach.send` | Send personalized email | Anthropic Sonnet (generate), Resend (send) |
| `multichannel-sequence` | `prolife/sequence.start` | Email + LinkedIn sequence | Resend, Unipile |
| `follow-up` | `prolife/followup.schedule` | Send follow-up emails | Resend |
| `handle-reply` | `prolife/reply.received` | Classify reply + update | Anthropic Haiku |
| `sales-handoff` | `prolife/sales.handoff` | Notify sales team | Telegram, Slack |
| `news-enrich-companies` | `prolife/news.enrich-companies` | Create companies from news | Anthropic Haiku |

---

## Data Flow — End to End

```
                    ┌─────────────────────┐
                    │   DATA SOURCES      │
                    │   (scraping)        │
                    └─────────┬───────────┘
                              │
                              ▼
┌─────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│ Google/Maps │───►│                      │───►│                 │
│ Apollo      │    │  scrape-pipeline     │    │  Company (RAW)  │
│ Exhibitions │    │                      │    │  in Neon DB     │
│ Registries  │    └──────────────────────┘    └────────┬────────┘
└─────────────┘                                         │
                                                        ▼
                                              ┌──────────────────┐
                    ┌─────────────────┐       │                  │
                    │ Anthropic Haiku │◄──────│ enrich-company   │
                    │ Apollo (free)   │       │                  │
                    │ Hunter ($0.10)  │       │ Company (ENRICHED)│
                    └─────────────────┘       └────────┬─────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │  score-company   │
                                              │  11 factors      │
                                              │  Company (SCORED)│
                                              └────────┬─────────┘
                                                       │
                              ┌─────────────────────────┼──────────────┐
                              │                         │              │
                              ▼                         ▼              ▼
                    ┌──────────────────┐  ┌──────────────────┐  ┌──────────┐
                    │ send-outreach    │  │ multichannel     │  │ MANUAL   │
                    │ Anthropic Sonnet │  │ Email + LinkedIn │  │ review   │
                    │ + Resend         │  │ Resend + Unipile │  │          │
                    │ (OUTREACH_SENT)  │  │                  │  │          │
                    └────────┬─────────┘  └────────┬─────────┘  └──────────┘
                             │                     │
                             ▼                     ▼
                    ┌──────────────────────────────────┐
                    │ Resend webhook → handle-reply    │
                    │ Anthropic Haiku (classify reply)  │
                    │ Company (REPLIED → INTERESTED)    │
                    └──────────────┬───────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────┐
                    │ sales-handoff                     │
                    │ Telegram + Slack notification     │
                    │ Company (HANDED_OFF)              │
                    └──────────────────────────────────┘


    ═══ PARALLEL: News Intelligence Pipeline ═══

┌──────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│ 35 RSS feeds │───►│                      │───►│                 │
│ Google News  │    │  news-collect        │    │  NewsItem       │
│ GNews API    │    │  (every 6h)          │    │  in Neon DB     │
│ FDA/EMA/CT   │    │  + Anthropic Haiku   │    │  + images       │
└──────────────┘    │  + entity matching   │    └────────┬────────┘
                    │  + image extraction   │             │
                    └──────────────────────┘             │
                                                        ▼
                                              ┌──────────────────┐
                    ┌─────────────────┐       │  news-backfill   │
                    │ Anthropic Haiku │◄──────│  (+1h after)     │
                    │ (translate RU)  │       │  Full content    │
                    └─────────────────┘       │  + translation   │
                                              └────────┬─────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │ news-enrich-     │
                                              │ companies        │
                                              │ Auto-create      │
                                              │ companies from   │
                                              │ news entities    │
                                              └──────────────────┘

    ═══ PARALLEL: Website Monitoring ═══

┌──────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│ Company      │───►│  website-monitor     │───►│ NewsItem        │
│ websites     │    │  (daily 05:00)       │    │ (source:        │
│ (top 50)     │    │  SHA-256 diff        │    │  Company Website)│
└──────────────┘    └──────────────────────┘    └─────────────────┘
```

---

## Environment Variables Summary

| Variable | Service | Required | Cost |
|---|---|---|---|
| `DATABASE_URL` | Neon Postgres (pooled) | Yes | Paid |
| `DATABASE_URL_UNPOOLED` | Neon Postgres (direct) | Yes | Paid |
| `ANTHROPIC_API_KEY` | Claude Haiku/Sonnet | Yes | ~$0.80-3/M tokens |
| `BETTER_AUTH_SECRET` | Auth cookie signing | Yes | Free (self-hosted) |
| `BETTER_AUTH_URL` | Auth base URL | No | - |
| `INNGEST_EVENT_KEY` | Inngest queue | Yes (prod) | Paid |
| `INNGEST_SIGNING_KEY` | Inngest webhook verify | Yes (prod) | Paid |
| `RESEND_API_KEY` | Email sending | Yes | Paid per email |
| `NEXT_PUBLIC_APP_URL` | App base URL | Yes | - |
| `GNEWS_API_KEY` | GNews API | No | Free 100 req/day |
| `PEXELS_API_KEY` | Stock photos | No | Free 200 req/hr |
| `APOLLO_API_KEY` | Contact search | No | Free search |
| `HUNTER_API_KEY` | Email discovery | No | ~$0.10/credit |
| `UNIPILE_API_KEY` | LinkedIn API | No | Paid |
| `UNIPILE_BASE_URL` | LinkedIn API URL | No | - |
| `GOOGLE_PLACES_API_KEY` | Google Maps | No | Paid |
| `SERPAPI_KEY` | Google Search | No | Paid |
| `OPENCORPORATES_API_KEY` | Trade registries | No | Free/paid |
| `COMTRADE_API_KEY` | UN trade data | No | Free |
| `TELEGRAM_BOT_TOKEN` | Notifications | No | Free |
| `TELEGRAM_CHAT_ID` | Notifications | No | Free |
| `SLACK_WEBHOOK_URL` | Notifications | No | Free |
| `PROXY_URLS` | Proxy rotation | No | Paid |
