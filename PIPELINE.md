# ProLife Agent — Pipeline

```
Seeds/Config ──► SCRAPING ──► ENRICHMENT ──► SCORING ──► OUTREACH ──► HANDOFF
                    │              │             │            │
                    ▼              ▼             ▼            ▼
               raw companies   AI classify   A/B/C rank   email+LI
               raw contacts    geo+sector    11 factors   sequences
                                                          ⏸ DISABLED
                    
INTEL (parallel) ─────────────────────────────────────────► ALERTS
  RSS 30+ sources                                          Telegram
  Google News queries                                      Slack
  Website change detection                                 Email digest
  AI summarize + translate
  Entity match to companies

AUTH ──► LOGIN ──► SESSION ──► REVEAL (contacts behind gate, 30/day)
```

## Modules

| Module | Package | Inngest functions | Status | Notes |
|---|---|---|---|---|
| **Scraping** | `@agency/scraping` | `scrape-companies` | stable | 10 sources |
| **Enrichment** | `@agency/ai` | `enrich-company` | stable | Claude classification |
| **Scoring** | `@agency/ai` | `score-company` | stable | 11 factors, A/B/C |
| **Outreach** | `@agency/email`, `@agency/linkedin` | `send-outreach`, `follow-up` | DISABLED | Multi-channel sequencer |
| **Reply handling** | `@agency/email` | `handle-reply` | stable | Webhook-driven |
| **Sales handoff** | `@agency/notifications` | `sales-handoff` | stable | Telegram + Slack |
| **News collect** | `@agency/intel` | `news-collect` | stable | Cron 6h, 30+ RSS |
| **News backfill** | `@agency/intel` | `news-backfill` | stable | Images, translation |
| **News enrich** | `@agency/intel` | `news-enrich-companies` | stable | Entity match, auto-rescore |
| **Auth** | `@agency/auth` | — | stable | better-auth, raw pg Pool |
| **Reveal** | `@agency/db` (DAL) | — | stable | 30/day limit, audit log |
| **Billing** | — | — | NOT STARTED | Stripe, two tiers planned |

## Data flow

```
Company seeds (CSV/manual)
  → scrape-companies (Google, Maps, directories, registries, Apollo)
    → enrich-company (AI classify: sector, size, relevance)
      → score-company (11 factors → 0-100 score → A/B/C priority)
        → [DISABLED] send-outreach (email Day 1 → LI Day 2 → email Day 4 → LI Day 6)

RSS feeds (30+ medtech sources)
  → news-collect (cron 6h, fetch + AI summarize + inline images)
    → news-enrich-companies (entity match → link news to companies)
      → auto-rescore (intent signal boost)
        → alerts (Telegram/Slack if score crosses threshold)

Website URLs (top-20 companies by score)
  → website-change-detection (daily, SHA-256 hash diff)
    → creates NewsItem with source "Company Website"
```

## How to work on a module

1. Read this file for the big picture
2. Read `packages/<module>/` source code
3. Check Inngest dashboard for function status: `npx inngest-cli dev`
4. Make changes in the package
5. Test via `pnpm dev` + trigger function manually or via API
6. Update "Last session" in `.claude/CLAUDE.md`
