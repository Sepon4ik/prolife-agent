# ProLife Agent

AI-powered SDR SaaS + industry intelligence platform for medtech. Deployed on Vercel.

## Session protocol

**START**: Read this file + `PIPELINE.md` + `git log --oneline -10`. If working on a specific module, read its package README.
**END**: Update "Last session" section below with what was done/not done/next step.

## Quick start

```bash
cd ~/Documents/Claude/Projects/Prolife
ANTHROPIC_API_KEY=sk-ant-... pnpm dev   # .env doesn't reliably load this key
```

## Stack

Turbo monorepo, pnpm 9.15, Next.js 14, React 18, TypeScript strict, Prisma 6 (Neon Postgres), Inngest, Resend, better-auth, Vercel.

## Packages

| Package | What it does | Key files |
|---|---|---|
| `@agency/ai` | Claude Sonnet/Haiku — classification, email gen, contact discovery | `src/` |
| `@agency/auth` | better-auth (email+password, 7-day sessions) | `src/client.ts`, `src/server.ts` |
| `@agency/db` | Prisma ORM, 19 models, DAL layer | `prisma/schema.prisma`, `src/dal/` |
| `@agency/email` | Resend outreach + multi-mailbox rotation | `src/` |
| `@agency/env` | Env validation (zod) | `src/index.ts` |
| `@agency/intel` | News intelligence: 30+ RSS, AI summarize, entity match, feed health | `src/` |
| `@agency/linkedin` | Unipile API, hard rate limits (15 conn/25 msg/80 views per day) | `src/` |
| `@agency/notifications` | Telegram + Slack alerts | `src/` |
| `@agency/queue` | Inngest: 10 functions (scrape, enrich, score, outreach, news-collect, etc.) | `src/` |
| `@agency/scraping` | 10 data sources (Google, Maps, directories, regulatory, Apollo, Hunter) | `src/` |
| `@agency/ui` | Shared components (KpiCard, StatusBadge, ScoreBadge, etc.) | `src/` |

App: `apps/prolife` — Next.js dashboard at `/dashboard/*`, login at `/login`.

## Critical rules

1. **NEVER `prisma db push`** — it tries to DROP better-auth `user` table. Use `npx prisma@6 generate` only. Auth tables managed via raw SQL.
2. **ANTHROPIC_API_KEY** — pass as shell env var, `.env` file doesn't load it reliably.
3. **Outreach is DISABLED** — emails/LinkedIn must NOT send until Pavel explicitly says "включай".
4. **better-auth uses raw pg Pool**, NOT prisma adapter. Config in `@agency/auth`. ProLife User model = `ProlifeUser` with `@@map("prolife_user")`.
5. **No CSV export** — managed service model, data moat by design.

## Auth setup

- better-auth tables (`user`, `session`, `account`, `verification`) via raw SQL, not Prisma schema
- Raw `pg` Pool with `DATABASE_URL_UNPOOLED`, SSL `rejectUnauthorized: false`
- Prisma adapter does NOT work (ignores modelMapping when another User model exists)

## Business context

- First client: $500/mo pilot, $1000/mo target
- ProLife Intel can sell standalone: $99-249/mo
- Two planned Stripe tiers: Agent $500/mo + Intel $99-249/mo

## Known issues

- Dev server webpack cache corrupts on concurrent API calls — `rm -rf .next/` + restart
- `prisma db push` conflict with better-auth (see rule #1)
- Vercel deploy needs `BETTER_AUTH_SECRET` env var

## Last session (2026-04-11)

**Done:**
- Auth system (better-auth + login + middleware + session in sidebar)
- Contact reveal system (30/day limit, RevealLog audit)
- News pipeline improvements (backfill 50, eager retry, inline images, feed health)
- Competitive intel (website change monitoring, 6 new medtech RSS, Google News queries)
- ARCHITECTURE.md created

**Next:**
- Pipeline UI redesign (table + kanban toggle, filters, grouped by priority) — use `lead-ui-density` skill
- Stripe billing integration
- Score decay (30-day half-life)
- Job posting monitoring
- Telegram digest delivery
