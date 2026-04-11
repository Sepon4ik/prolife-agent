# SaaS Multi-Tenant Patterns — Next.js + Prisma + Postgres

## When to use

When turning a single-customer product into a SaaS, or when starting a SaaS from scratch and you need to make tenant isolation decisions early. This is the bridge from "ProLife is hardcoded for ProLife AG" to "ProLife is a configurable AI SDR product that 50 customers can self-serve onto."

This skill is the **architectural bible** for multi-tenant SaaS in Pavel's stack. It assumes Next.js 15 + Prisma + Neon Postgres + better-auth/Clerk + Inngest + Stripe. The patterns generalize.

---

## The 4 isolation models — pick one before writing code

| Model | Tenant data lives in | Pros | Cons | Use when |
|---|---|---|---|---|
| **Pool (shared schema)** | Same tables, every row has `tenantId` column | Simple, cheap, fast iteration | Risk of data leak via missing WHERE clause; noisy neighbor performance | **Default for most SaaS** including ProLife. 95% of products should pick this. |
| **Bridge (shared DB, schema-per-tenant)** | Same database, separate Postgres schemas | Stronger isolation than pool, still one DB | Migration complexity (run on N schemas); more ops | When customers demand "our data is in its own schema" for compliance |
| **Silo (DB-per-tenant)** | Separate database per customer | Maximum isolation, can charge for it | High cost, complex deploy, hard to do cross-tenant analytics | Enterprise plans, regulated industries (HIPAA, banking) |
| **Hybrid** | Pool by default, silo for enterprise tier | Best of both | Most complex; needs feature flags and dual code paths | When you have product-market fit in mid-market AND a few enterprise asks |

**Pavel's default for ProLife and any new SaaS: Pool.** This skill focuses there. The other models are mentioned for awareness.

---

## The pool model — non-negotiable rules

Pool model = a single database, every tenant-scoped table has a `tenantId` (or `organizationId`, `workspaceId`) column. Every query filters by it. The risk: forgetting the filter once = leaking data between customers. Mitigate this with multiple layers of defense.

### Layer 1: Schema design

Every table that contains tenant data has `tenantId` as a non-null column with a foreign key to `Tenant`.

```prisma
model Tenant {
  id        String   @id @default(cuid())
  slug      String   @unique         // human-friendly URL slug
  name      String
  createdAt DateTime @default(now())

  members   Membership[]
  leads     Lead[]
  campaigns Campaign[]
  // ... every tenant-scoped relation
}

model Lead {
  id         String  @id @default(cuid())
  tenantId   String
  tenant     Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  email      String?
  // ...

  @@index([tenantId])
  @@index([tenantId, createdAt])
  @@unique([tenantId, email])  // emails are unique per tenant, not globally
}
```

Critical:
- `@@index([tenantId])` on every tenant-scoped table — every query starts with this filter
- All composite uniqueness includes `tenantId` first
- `onDelete: Cascade` on the tenant FK so deleting a tenant deletes their data

### Layer 2: Query layer enforcement

**Never use the raw Prisma client in app code.** Wrap it in a "tenant-aware" client that injects the tenant filter automatically.

```ts
// packages/db/src/tenant-client.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export function tenantDb(tenantId: string) {
  return {
    lead: {
      findMany: (args?: Parameters<typeof prisma.lead.findMany>[0]) =>
        prisma.lead.findMany({
          ...args,
          where: { ...args?.where, tenantId },
        }),
      findUnique: async (args: { where: { id: string } }) => {
        const lead = await prisma.lead.findUnique({ where: args.where });
        if (lead && lead.tenantId !== tenantId) return null;  // never leak
        return lead;
      },
      create: (args: { data: Omit<Prisma.LeadCreateInput, "tenant"> }) =>
        prisma.lead.create({
          data: { ...args.data, tenant: { connect: { id: tenantId } } },
        }),
      // ... similar wrappers for update, delete, count, aggregate
    },
    campaign: { ... },
    // ... every model
  };
}
```

In every Server Action, Server Component, API route — get the tenantId from session, then use `tenantDb(tenantId)`. **Never import `prisma` directly outside of `packages/db`.**

```ts
// app/leads/page.tsx
import { auth } from "@/auth";
import { tenantDb } from "@agency/db";

export default async function LeadsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const db = tenantDb(session.tenantId);
  const leads = await db.lead.findMany({ orderBy: { score: "desc" }, take: 50 });

  return <LeadsTable leads={leads} />;
}
```

### Layer 3: Postgres Row-Level Security (RLS)

Even with the wrapper, a bug in one query can leak. Add **Postgres RLS** as a defense in depth. Even if app code forgets the filter, the database rejects it.

```sql
-- Run via a Prisma migration

ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "Lead"
  USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Campaign" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Campaign"
  USING ("tenantId" = current_setting('app.tenant_id', true));

-- Repeat for every tenant-scoped table
```

In the wrapper, `SET LOCAL app.tenant_id = '...'` at the start of every transaction:

```ts
export function tenantDb(tenantId: string) {
  return {
    async transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
      return prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
        return fn(tx);
      });
    },
    // wrappers above also set the GUC
  };
}
```

**Caveat:** RLS adds latency (Postgres planner re-evaluates per row). For high-QPS tables, you may want to skip RLS and rely on the wrapper + tests. This is a tradeoff to make consciously, not by accident.

### Layer 4: Test enforcement

A test that creates two tenants and verifies tenant A cannot read tenant B's data should run in CI. If it fails, deploy is blocked.

```ts
// __tests__/multitenant.test.ts
test("tenant A cannot read tenant B's leads", async () => {
  const tenantA = await createTestTenant();
  const tenantB = await createTestTenant();
  await tenantDb(tenantA.id).lead.create({ data: { email: "a@example.com" } });
  await tenantDb(tenantB.id).lead.create({ data: { email: "b@example.com" } });

  const aLeads = await tenantDb(tenantA.id).lead.findMany();
  expect(aLeads).toHaveLength(1);
  expect(aLeads[0].email).toBe("a@example.com");

  const bLeads = await tenantDb(tenantB.id).lead.findMany();
  expect(bLeads).toHaveLength(1);
  expect(bLeads[0].email).toBe("b@example.com");

  // The crucial assertion
  const aLeadsViaB = await tenantDb(tenantB.id).lead.findUnique({
    where: { id: aLeads[0].id }
  });
  expect(aLeadsViaB).toBeNull();
});
```

---

## Tenant identity in the request lifecycle

How does the app know which tenant the current request is for? Pick one:

### Option A: Subdomain
`acme.prolife.ai` → tenant slug = `acme`. Works well, looks pro, requires wildcard DNS + cert.

```ts
// middleware.ts
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const subdomain = host.split(".")[0];

  if (subdomain === "www" || subdomain === "app" || !subdomain) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.searchParams.set("tenant_slug", subdomain);
  return NextResponse.rewrite(url);
}
```

### Option B: Path prefix
`prolife.ai/acme/leads` → tenant slug from path. No DNS work. Simpler. Less branded.

```
app/
  [tenantSlug]/
    leads/page.tsx
    campaigns/page.tsx
```

### Option C: User session has a "current tenant"
User logs in, picks a workspace, all subsequent requests use that. Stored in JWT or session cookie. Path is `prolife.ai/leads`. **Recommended default for most SaaS** because it's the simplest.

```ts
// auth.ts (better-auth or Clerk)
export const auth = betterAuth({
  // ...
  user: {
    additionalFields: {
      currentTenantId: { type: "string", required: false },
    },
  },
});

// In server code:
export async function getTenantId() {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user.currentTenantId) throw new Error("No active tenant");
  return session.user.currentTenantId;
}
```

A user can be a member of multiple tenants. They pick which one is "current" via a workspace switcher in the UI.

---

## Memberships and roles

A user is not directly tied to a tenant — they have **memberships**. A membership has a role.

```prisma
model User {
  id          String       @id @default(cuid())
  email       String       @unique
  memberships Membership[]
}

model Tenant {
  id          String       @id @default(cuid())
  slug        String       @unique
  memberships Membership[]
  // ...
}

model Membership {
  id       String         @id @default(cuid())
  userId   String
  user     User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenantId String
  tenant   Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  role     MembershipRole
  createdAt DateTime      @default(now())

  @@unique([userId, tenantId])
}

enum MembershipRole {
  OWNER
  ADMIN
  MEMBER
  VIEWER
}
```

Authorization helper:

```ts
export async function requireRole(tenantId: string, allowedRoles: MembershipRole[]) {
  const session = await auth();
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: session.user.id, tenantId } },
  });
  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new Error("Forbidden");
  }
}
```

Use it at the top of every Server Action and protected route.

```ts
"use server";
export async function deleteCampaign(tenantId: string, campaignId: string) {
  await requireRole(tenantId, ["OWNER", "ADMIN"]);
  await tenantDb(tenantId).campaign.delete({ where: { id: campaignId } });
}
```

---

## Configurable AI prompts (the ProLife unlock)

The biggest blocker turning ProLife into a SaaS: prompts are hardcoded for ProLife AG. Different customers will have different ICPs, products, tones. Solution: **prompts as data, scoped by tenant**.

```prisma
model PromptTemplate {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name      String   // "outreach_initial", "follow_up_1", "icp_extractor", "intent_classifier"
  template  String   // The prompt with variable placeholders {{firstName}}, {{companyName}}, ...
  variables Json     // Schema of expected variables
  version   Int      @default(1)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, name, version])
  @@index([tenantId, name, isActive])
}
```

The runtime resolver:

```ts
// packages/ai/src/prompts.ts
export async function renderPrompt(
  tenantId: string,
  name: string,
  vars: Record<string, string>
): Promise<string> {
  const template = await prisma.promptTemplate.findFirst({
    where: { tenantId, name, isActive: true },
    orderBy: { version: "desc" },
  });

  if (!template) {
    // Fallback to global default if customer hasn't customized
    return renderDefault(name, vars);
  }

  return Mustache.render(template.template, vars);  // simple, safe templating
}
```

Customer-facing UI: a "Prompt Studio" where customers can:
1. View the default prompts shipped with ProLife
2. Fork them into their own version (creates a tenant-scoped record)
3. Edit, save, publish a new version
4. Compare AI outputs A/B between versions before publishing
5. Roll back to previous versions

Each invocation in app code:

```ts
const prompt = await renderPrompt(tenantId, "outreach_initial", {
  firstName: lead.firstName,
  companyName: lead.companyName,
  productPitch: tenant.productPitch,
  // ...
});

const response = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1000,
  messages: [{ role: "user", content: prompt }],
});
```

**Track prompt version in usage logs** so you can correlate prompt versions with reply rates → real evals.

---

## Tenant-scoped configuration

Beyond prompts, customers will want to configure many things. Don't add a column to `Tenant` for each. Use a key-value table.

```prisma
model TenantSetting {
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  key      String
  value    Json

  @@id([tenantId, key])
}
```

Examples of keys: `outreach.daily_send_limit`, `outreach.sending_window_start`, `enrichment.providers_enabled`, `branding.logo_url`, `notifications.slack_webhook`. Wrap with a typed accessor:

```ts
export async function getSetting<T>(tenantId: string, key: string, fallback: T): Promise<T> {
  const setting = await prisma.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId, key } },
  });
  return (setting?.value as T) ?? fallback;
}
```

---

## Stripe subscriptions and feature gating

### Tenant ↔ Stripe customer mapping

```prisma
model Tenant {
  // ...
  stripeCustomerId    String?
  stripeSubscriptionId String?
  plan                Plan      @default(FREE)
  planExpiresAt       DateTime?
}

enum Plan {
  FREE
  STARTER
  PRO
  ENTERPRISE
}
```

### Feature gating by plan

Don't sprinkle `if (tenant.plan === "PRO")` checks across the codebase. Centralize:

```ts
// packages/billing/src/features.ts
export const PLAN_LIMITS = {
  FREE:       { maxLeadsPerMonth: 100,    maxCampaigns: 1,   aiCreditsPerMonth: 1_000 },
  STARTER:    { maxLeadsPerMonth: 1_000,  maxCampaigns: 5,   aiCreditsPerMonth: 25_000 },
  PRO:        { maxLeadsPerMonth: 10_000, maxCampaigns: 25,  aiCreditsPerMonth: 250_000 },
  ENTERPRISE: { maxLeadsPerMonth: Infinity, maxCampaigns: Infinity, aiCreditsPerMonth: 1_000_000 },
} as const;

export type Feature = keyof typeof PLAN_LIMITS["FREE"];

export async function checkLimit(
  tenantId: string,
  feature: Feature,
  current: number
): Promise<{ allowed: boolean; limit: number; remaining: number }> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const limit = PLAN_LIMITS[tenant.plan][feature];
  return {
    allowed: current < limit,
    limit,
    remaining: Math.max(0, limit - current),
  };
}
```

Call it before mutations that consume the limit:

```ts
const used = await tenantDb(tenantId).lead.count({
  where: { createdAt: { gte: startOfMonth() } },
});
const check = await checkLimit(tenantId, "maxLeadsPerMonth", used);
if (!check.allowed) {
  throw new Error(`Monthly lead limit reached (${check.limit}). Upgrade your plan.`);
}
```

### Stripe webhook handler

Webhooks are the source of truth. Update `Tenant.plan` from `customer.subscription.created`, `updated`, `deleted` events. **Do not update plan from the success page redirect** — it can lag.

See the existing `stripe-saas-billing` skill for the full webhook patterns.

---

## Inngest jobs in a multi-tenant world

Every background job must include `tenantId` in the event payload AND scope its DB access by it.

```ts
// Trigger
await inngest.send({
  name: "lead/enrich",
  data: { tenantId: tenant.id, leadId: lead.id },
});

// Handler
export const enrichLead = inngest.createFunction(
  { id: "enrich-lead", retries: 3, concurrency: { limit: 10, key: "event.data.tenantId" } },
  { event: "lead/enrich" },
  async ({ event, step }) => {
    const { tenantId, leadId } = event.data;
    const db = tenantDb(tenantId);

    const lead = await step.run("load", () => db.lead.findUnique({ where: { id: leadId } }));
    if (!lead) return; // tenant isolation guarantees null if mismatched

    const enriched = await step.run("enrich", () => enrichWithApollo(lead));
    await step.run("save", () => db.lead.update({ where: { id: leadId }, data: { enrichment: enriched } }));
  }
);
```

Two crucial details:
- **`concurrency: { limit: 10, key: "event.data.tenantId" }`** — caps concurrent jobs per tenant, so one customer's huge import doesn't starve everyone else (noisy neighbor mitigation).
- **Always scope DB access via `tenantDb`** — never raw `prisma` inside a job.

---

## Per-tenant queues / quotas

For expensive operations (AI calls, scraping, email sends) you want both global and per-tenant rate limits.

- **Global** caps via Inngest concurrency at the function level
- **Per-tenant** caps via `concurrency.key`
- **Hard quotas** enforced before scheduling: `checkLimit` then `inngest.send`

Add a per-tenant **usage** table to track consumption for billing analytics:

```prisma
model Usage {
  id        String   @id @default(cuid())
  tenantId  String
  metric    String   // "ai_tokens", "emails_sent", "scrapes_run"
  amount    Int
  recordedAt DateTime @default(now())

  @@index([tenantId, metric, recordedAt])
}
```

---

## Onboarding flow

Going from "anyone signs up" to "they have a working tenant with a configured product":

1. **Sign up** → User created, no tenant yet
2. **Create workspace** → Tenant created, user becomes OWNER
3. **Pick ICP / use case** → Pre-fills prompts and settings from a template
4. **Connect integrations** → OAuth flows for Gmail, Slack, etc. — store tokens **encrypted** in `TenantIntegration` table
5. **Import or seed first leads** → Either CSV upload, scrape from URL, or skip
6. **First campaign** → Walk through creating one campaign end-to-end
7. **Activate** → Schedule the first send

Each step: a route under `/onboarding/<step>`. The user can go back. State is in `Tenant.onboardingState: Json`.

---

## Migrating an existing single-tenant app to multi-tenant

When you're starting from "ProLife is hardcoded for ProLife AG" and need to make it multi-tenant **without breaking the production usage**:

### Step 1: Add `Tenant` and `Membership` tables, no-op
- Migration adds the tables
- Create one Tenant row for the existing customer
- Create Membership rows for existing users → that Tenant
- Existing code unchanged

### Step 2: Add `tenantId` columns, backfill, NOT NULL
- For each tenant-scoped table: `ALTER TABLE Lead ADD COLUMN tenantId TEXT;`
- Backfill: `UPDATE Lead SET tenantId = '<the_one_tenant_id>';`
- Constraint: `ALTER TABLE Lead ALTER COLUMN tenantId SET NOT NULL;`
- Add the FK and the index
- Existing code still works (it doesn't filter, so it sees everything — which is still correct, since there's only one tenant)

### Step 3: Introduce `tenantDb` wrapper
- New file in `packages/db`
- Refactor one feature at a time to use it
- Tests prove no behavior change

### Step 4: Add tenant resolution to middleware/auth
- Sessions now include `currentTenantId`
- For existing single tenant: hardcode it
- Now you can sign up new users → new tenants → they're isolated

### Step 5: Configurable prompts and settings
- Move hardcoded ProLife strings into `PromptTemplate` and `TenantSetting`
- Existing tenant gets the original values copied in
- New tenants get sensible defaults

### Step 6: Self-serve sign-up + onboarding
- Open the door

### Step 7: Stripe subscriptions
- Plans, limits, gating, webhooks
- Migrate existing customer to a "founder plan" with no limits

This is a 4-6 week project for ProLife. Each step ships independently.

---

## What NOT to build (yet)

When SaaS-ifying ProLife, do NOT build these on day one. They are tempting but premium-feature work that should wait until you have paying customers asking for them:

- SSO / SAML (only Enterprise plans)
- SCIM provisioning (only Enterprise)
- Audit logs UI (start with Sentry breadcrumbs)
- White-labeling
- Custom domains per tenant
- Granular RBAC beyond OWNER/ADMIN/MEMBER/VIEWER
- Workspace-to-workspace data export tools
- API rate-limiting per key (can use a global Cloudflare rule first)
- SOC 2 prep (start informal compliance, document later)

Build these only when a customer says "we'll pay you for it." Until then, simpler is faster is better.

---

## Reference

- Sister skill: `stripe-saas-billing` — billing webhook patterns
- Sister skill: `lead-data-fusion` — what fills the multi-tenant lead tables
- Sister skill: `code-quality-pavel-stack` — the QA gate for any change to multi-tenant code
- Plugin: `anthropic-skills:saas-builder` — Turborepo + Next + Neon scaffold
- Plugin: `engineering:system-design` — for higher-level architecture decisions
- Real-world examples to study: Linear's workspaces, Vercel's teams, Clerk's organizations, Supabase's project model
