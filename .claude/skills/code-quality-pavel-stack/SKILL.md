# Code Quality Standards — Pavel's Stack (Next.js 15 + TS + Prisma + Inngest)

## When to use

Every time code is written or modified in any of Pavel's projects: **ProLife Agent**, future SaaS products, or client work using this stack. This is the personal QA gate — **nothing is "done" until it passes this checklist**. Treat it as the contract between Claude and Pavel.

The stack this skill assumes:
- **Next.js 15** (App Router, RSC, Server Actions)
- **TypeScript strict mode** (no `any`, no `as` shortcuts)
- **Prisma** ORM + Neon Postgres (some projects may have Drizzle — checklist still applies)
- **better-auth / Clerk** for auth
- **Inngest** for background jobs and crons
- **Resend** for transactional email
- **Stripe** for billing
- **Tailwind CSS v4** + shadcn/ui
- **Vercel** for deploy
- **Sentry** + **PostHog** for observability

If a project uses a different piece (e.g. Drizzle instead of Prisma), the *patterns* still apply, only the syntax differs.

---

## The "ready" gate — never say done before checking

Before reporting any task as complete, Claude must mentally walk through this list. Items that fail are either fixed before reporting, or **explicitly called out** in the report ("I did X but did not test Y because Z").

### 1. TypeScript health
- [ ] `pnpm type-check` passes (or its equivalent — `tsc --noEmit`)
- [ ] No new `any`, `unknown` without narrowing, `// @ts-ignore`, `// @ts-expect-error`
- [ ] No `as Foo` casts unless the value comes from an external boundary that genuinely can't be typed (DB raw query, third-party JSON). When unavoidable, parse with Zod first.
- [ ] All function parameters and return types are inferable or explicit. Public exports always have explicit return types.

### 2. Lint and format
- [ ] `pnpm lint` passes with zero warnings
- [ ] Prettier-clean (formatter applied)
- [ ] Imports ordered consistently (the project's eslint-plugin-import config)
- [ ] No commented-out code blocks left behind

### 3. Tests
- [ ] Unit tests pass for changed code paths
- [ ] At least one happy-path test exists for any new exported function or API route
- [ ] Edge cases identified and tested: empty input, null, max-length, unicode, malformed input
- [ ] If the change affects a critical user flow (auth, billing, sending email/outreach), an integration test or E2E test exists or has been updated

### 4. Runtime correctness
- [ ] `pnpm build` succeeds (catches RSC/client boundary mistakes invisible to type checker)
- [ ] No console errors when the affected page is loaded in dev
- [ ] No new entries in the network tab that 404 or 500
- [ ] `dev` server logs are clean (no React hydration warnings, no Prisma N+1 warnings, no Next.js metadata warnings)

### 5. Database
- [ ] If the schema changed: `prisma migrate dev` ran cleanly, the generated migration is committed, the migration name is descriptive (`add_lead_score_index`, not `migration_3`)
- [ ] No raw SQL in app code unless wrapped in a typed function in `packages/db`
- [ ] No N+1 in any new query — use `include` / `select` / dataloader pattern
- [ ] Indexes added for any new `where` clause that hits >1k rows
- [ ] If a column was added that needs backfill, a backfill Inngest job exists

### 6. Security
- [ ] No secrets in source code, including in test fixtures
- [ ] All Server Actions and API routes validate input with Zod before touching the DB
- [ ] All Server Actions and API routes that mutate data check authentication AND authorization (does this user own this resource?)
- [ ] No SSRF, no SQL injection (Prisma protects but raw queries don't), no XSS in rendered HTML
- [ ] User input that becomes a URL or filename is sanitized
- [ ] PII (emails, names, scraped data) is not logged in plaintext to Sentry / PostHog

### 7. Observability
- [ ] New errors call `Sentry.captureException(err, { extra: { ... } })` with relevant context
- [ ] New user-facing events (signup, key actions) call `posthog.capture('event_name', { props })`
- [ ] Long-running operations log progress with structured fields (not `console.log("yay")`)

### 8. Documentation
- [ ] If env vars were added: `.env.example` updated AND added to `turbo.json` `globalEnv`
- [ ] If a public function was added/changed: JSDoc with one-line summary
- [ ] If the change affects setup or deploy: README in the affected package updated
- [ ] If a new dependency was added: justified in the PR/commit message (size, alternatives considered)

### 9. Deployment readiness
- [ ] Vercel preview build passes
- [ ] No new env vars need to be added to Vercel project (or, if they do, the list is in the report)
- [ ] No breaking changes to public API routes / webhook handlers without versioning
- [ ] Database migrations are forward-compatible (existing prod code can run against the new schema)

### 10. The "obvious miss" check
Before reporting done, ask:
- What did I assume that might not be true?
- What's the worst input a user could send to the code I just wrote?
- If this code runs at 3am with no one watching, does it fail loud or fail silent?
- Did I change anything that other parts of the codebase silently depend on?

---

## TypeScript discipline

### Use Zod at all boundaries
Every external input gets parsed by a Zod schema before it touches any business logic. Never trust `req.body`, never trust `searchParams`, never trust DB raw query results, never trust scraped JSON.

```ts
import { z } from "zod";

const CreateLeadSchema = z.object({
  email: z.string().email(),
  companyDomain: z.string().min(3).max(255),
  source: z.enum(["scraping", "manual", "import"]),
  enrichment: z.record(z.string(), z.unknown()).optional(),
});

export async function createLead(input: unknown) {
  const data = CreateLeadSchema.parse(input);  // throws ZodError on bad input
  return db.lead.create({ data });
}
```

### Discriminated unions over optional fields
When a value is "one of these shapes," use discriminated unions, not optional fields with implicit relationships.

```ts
// BAD
type LeadEvent = {
  type: string;
  emailOpened?: { messageId: string };
  emailClicked?: { messageId: string; url: string };
  replyReceived?: { content: string };
};

// GOOD
type LeadEvent =
  | { type: "email_opened"; messageId: string }
  | { type: "email_clicked"; messageId: string; url: string }
  | { type: "reply_received"; content: string };
```

### Brand types for IDs
Don't let a `userId` and a `leadId` be assignable to each other. They're both strings, but they shouldn't be interchangeable.

```ts
type Brand<T, B> = T & { __brand: B };
type UserId = Brand<string, "UserId">;
type LeadId = Brand<string, "LeadId">;

function getLead(id: LeadId): Promise<Lead> { ... }

const userId: UserId = "..." as UserId;
getLead(userId);  // ❌ TypeScript error — can't pass UserId where LeadId expected
```

### Never `Promise<any>` from a server action
Every server action's return type is explicit and serializable.

```ts
"use server";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function createLead(input: unknown): Promise<ActionResult<{ id: LeadId }>> {
  try {
    const lead = await createLeadInternal(input);
    return { success: true, data: { id: lead.id } };
  } catch (err) {
    Sentry.captureException(err);
    return { success: false, error: "Failed to create lead" };
  }
}
```

---

## Next.js 15 specific rules

### Server vs Client boundary
- **Default to Server Components.** Add `"use client"` only when you need state, effects, or browser APIs.
- Server Components must NOT import from a file that has `"use client"` at the top — it leaks the client bundle into the server.
- Pass data, not functions, from Server to Client. If you need to call a function from the client, expose it as a Server Action.
- Don't fetch in `useEffect`. Fetch on the server, pass props to client.

### Server Actions are mutations only
Server Actions are for **mutations** (POST). For data fetching, prefer Server Components or Route Handlers (`route.ts`). Don't use a Server Action as a "function I can call from the client" — that's an anti-pattern that hides intent.

### Streaming + Suspense
For pages with slow data (enrichment, scraping results, AI generations), use Suspense boundaries. Wrap slow components in `<Suspense fallback={<Skeleton />}>` so the shell renders instantly.

```tsx
export default function LeadDetailPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <LeadHeader id={params.id} />  {/* fast, blocks the shell */}
      <Suspense fallback={<SignalsSkeleton />}>
        <LeadSignals id={params.id} />  {/* slow, streams in */}
      </Suspense>
      <Suspense fallback={<EmailsSkeleton />}>
        <LeadEmails id={params.id} />  {/* slow, streams in */}
      </Suspense>
    </div>
  );
}
```

### Metadata is generateMetadata, never useMetadata
Metadata is server-side. Use `generateMetadata()` in `page.tsx` / `layout.tsx`. Never set `<title>` from a client component.

---

## Prisma rules (or Drizzle — pattern is the same)

### Always use `select`, never default-fetch the whole model
```ts
// BAD — fetches every column, including 50KB JSON enrichment blob
const lead = await db.lead.findUnique({ where: { id } });

// GOOD — only what the caller needs
const lead = await db.lead.findUnique({
  where: { id },
  select: { id: true, email: true, score: true, status: true },
});
```

This eliminates accidental N+1 over wide rows and makes the code self-documenting about what data the call site uses.

### N+1 is a deploy blocker
Any loop that calls Prisma is suspicious. Use `findMany` + map, or `include` for relations.

```ts
// BAD — N queries
for (const lead of leads) {
  const company = await db.company.findUnique({ where: { id: lead.companyId } });
}

// GOOD — 1 query
const leads = await db.lead.findMany({
  where: { ... },
  include: { company: { select: { name: true, domain: true } } },
});
```

### Transactions for related writes
Anything that writes to >1 table in one logical operation goes inside `db.$transaction()`. No exceptions.

### Migrations are immutable once shipped
Once a migration is in `main`, never edit it. If it was wrong, write a new corrective migration. This is non-negotiable for prod stability.

---

## Inngest rules

### Functions are idempotent
Background jobs may retry. Every function must produce the same result if called twice with the same event. Use natural keys (`leadId + step`) and `step.run()` to memoize sub-steps.

```ts
export const enrichLead = inngest.createFunction(
  { id: "enrich-lead", retries: 3 },
  { event: "lead/created" },
  async ({ event, step }) => {
    const data = await step.run("fetch-public-data", () => fetchPublic(event.data.leadId));
    const enriched = await step.run("ai-extract", () => aiExtract(data));
    await step.run("save", () => db.lead.update({ where: { id: event.data.leadId }, data: { enrichment: enriched } }));
  }
);
```

### `step.run` is mandatory for any side effect
If it sends an HTTP request, hits the DB, or calls an LLM — it goes inside `step.run()`. Otherwise the retry will replay the side effect.

### Long jobs use `step.sleep` and `step.waitForEvent`
Don't busy-wait. Don't `setInterval`. Inngest pauses the execution and resumes it.

---

## Stripe rules

### Webhook handlers are the source of truth
Don't update the database from the success page. Update it from `checkout.session.completed` webhook. The success page can lag behind by seconds.

### Idempotency keys on every charge
Pass an idempotency key to Stripe. If the request retries, Stripe returns the same charge instead of double-charging.

### Test mode in dev, live mode behind env flag
Never accidentally use live keys in development. The env loader (`@agency/env`) must validate that NODE_ENV=production matches `STRIPE_SECRET_KEY` starting with `sk_live_`.

---

## Tailwind v4 + shadcn

### Design tokens via CSS variables, not Tailwind config
In Tailwind v4, the source of truth for colors/spacing is CSS variables in `globals.css`. Don't add custom colors in `tailwind.config.ts` — add them as `--color-name: oklch(...)` in the CSS.

### shadcn components are copy-paste, customize freely
Don't `npm install` a wrapper around shadcn. The whole point is the components live in your codebase. Modify them. Don't be shy.

### One source of typography
There should be exactly one `<h1>` per page. Headings hierarchy is sacred for both SEO and a11y.

---

## Common smells — fix on sight

| Smell | Fix |
|---|---|
| `useState` for data that should be a URL param | Use `useSearchParams` so the state is shareable and back-button-friendly |
| `useEffect` for data fetching | Move to a Server Component, or use TanStack Query if it must be client |
| `try { } catch (e) { console.log(e) }` | Use Sentry, or rethrow. Silent catches hide bugs forever. |
| A 500-line file | Split. The cost of an extra file is much less than the cost of a hard-to-read 500-line file. |
| A function that does both "fetch" and "transform" | Split. Fetchers return raw, transformers are pure. |
| Magic numbers in JSX | Extract to a const at the top of the file, or to the design tokens. |
| `// TODO` left without a date or owner | Either fix it now or write `// TODO(2026-04-15): explain why deferred` |
| `any` used to silence the type checker | Almost always wrong. Either type properly or use `unknown` + parse. |
| Server Action that doesn't validate input | Add Zod parse line 1 of the function. |
| Component that does its own data fetching AND its own rendering AND its own mutations | Split into a container (data) + presentational (render) |

---

## When the user says "fix the bug" or "add this feature"

The mental flow:
1. **Read the relevant files first.** Never propose changes to code I haven't read.
2. **Run the existing tests** to confirm baseline before changing anything.
3. **Reproduce the bug** if it's a bug fix. A change that doesn't include "I saw the broken behavior, then I saw the fixed behavior" is just hope.
4. **Make the smallest change** that fixes the issue. Don't refactor in passing.
5. **Run the gate above.** Type-check, lint, build, test.
6. **Report back with what was changed, what was tested, and what was NOT tested** (with a reason).

---

## What to do when I'm not sure

If I'm modifying code I don't fully understand, **stop and ask**, don't guess. The cost of asking one clarifying question is much less than the cost of "I refactored this function and now the cron is broken in prod." Pavel trusts confident execution but he trusts honest uncertainty more than fake confidence.

Acceptable: "I can do this two ways — A or B — A is faster but B handles the edge case where X. Which do you prefer?"
Unacceptable: silent guess that turns out wrong.

---

## Reference

- Existing skills: `claude-agent-sdk`, `stripe-saas-billing`, `ai-agent-patterns`, `b2b-outreach-automation`
- Project context: `~/Documents/Claude/Projects/Prolife/CLAUDE.md`
- Test commands by repo:
  - ProLife: `pnpm type-check`, `pnpm lint`, `pnpm build`, `pnpm test`
