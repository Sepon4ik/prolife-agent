# Lead Data Fusion — Merging contact intelligence from multiple sources

## When to use

When building any feature that brings together information about a person or company from **more than one source**: scraping + Apollo + LinkedIn + email enrichment + CRM imports + manual entry. This is the universal problem of B2B data tools and the heart of what ProLife Agent does.

This skill answers:
- How do I know two records are the same lead?
- How do I merge them without losing information or trusting the wrong source?
- How do I show the final unified profile to a human?
- How do I handle conflicts (Apollo says one job title, LinkedIn says another)?
- How do I track *where* each field came from so I can debug?

---

## The fundamental problem

You collected data on a lead from:
1. Web scraping (their company site has a "Team" page)
2. Apollo (paid B2B database)
3. Hunter.io (email finder)
4. LinkedIn (manual or LinkedIn Sales Navigator scrape)
5. Common Room or Clay enrichment
6. Reply data from a previous outreach email

Each source has overlapping but inconsistent fields, different update frequencies, different reliability, different formats. Some have email but no name. Some have name + company but no email. Some have a phone number that's three years old. Some have a job title that says "Software Engineer" while another says "Senior Software Engineer at Acme."

The naive approach — last write wins — destroys information and trust. The right approach is:

```
Raw signals from N sources  →  Deduplication / matching  →
Per-field provenance tracking  →  Conflict resolution rules  →
Unified profile  →  Display layer with drill-down to sources
```

---

## Layer 1: Identity and matching

### What makes two records the "same lead"?

You need a **deterministic matching ladder**: try strong signals first, fall back to weaker ones, never collapse two records when uncertain.

**Strong identity signals (collapse on match):**
1. **Verified email address.** Same `email` (lowercased, trimmed) → almost certainly same person. Exceptions: shared inboxes (`info@`, `sales@`, `team@`) — these need company-level matching, not person-level.
2. **LinkedIn URL** (canonicalized — strip query params, trailing slashes, locale prefixes). Same `linkedin.com/in/<slug>` → same person.
3. **Phone number** (E.164 normalized) — strong but not foolproof (numbers get reassigned).

**Medium identity signals (collapse only when 2+ match):**
4. Same `(first_name, last_name, company_domain)` triple
5. Same `(full_name, employer_id)` where employer is from an authoritative source
6. Same Twitter/X handle, GitHub username, etc.

**Weak signals (never collapse alone, use to suggest merges):**
7. Same name + same city
8. Same name + same job title

### The matching algorithm

```ts
async function findExistingLead(candidate: RawLeadData): Promise<Lead | null> {
  // Strong signals first
  if (candidate.email) {
    const byEmail = await db.lead.findFirst({
      where: { emails: { some: { value: normalizeEmail(candidate.email) } } },
    });
    if (byEmail) return byEmail;
  }

  if (candidate.linkedinUrl) {
    const byLinkedIn = await db.lead.findFirst({
      where: { linkedinUrl: canonicalizeLinkedIn(candidate.linkedinUrl) },
    });
    if (byLinkedIn) return byLinkedIn;
  }

  // Medium: 2-of-N rule
  const matches = await db.lead.findMany({
    where: {
      AND: [
        { firstName: candidate.firstName },
        { lastName: candidate.lastName },
        { company: { domain: candidate.companyDomain } },
      ],
    },
  });
  if (matches.length === 1) return matches[0];

  // Ambiguous — do NOT auto-merge. Return null and create new, flag for human review later.
  return null;
}
```

### Normalization helpers
```ts
const normalizeEmail = (e: string) => e.trim().toLowerCase();

const canonicalizeLinkedIn = (url: string) => {
  const u = new URL(url);
  // Strip locale prefix (/en/, /de/) and query
  const path = u.pathname
    .replace(/^\/[a-z]{2}\//, "/")
    .replace(/\/$/, "");
  return `https://linkedin.com${path}`;
};

const normalizePhone = (raw: string) => {
  // Use libphonenumber-js — it handles all the quirks
  const parsed = parsePhoneNumber(raw, "US");  // default region per ICP
  return parsed?.format("E.164") ?? null;
};
```

---

## Layer 2: Per-field provenance

Once you've decided two records are the same lead and need to merge, **never overwrite a field without recording where the new value came from and when**.

The data model:

```prisma
model Lead {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Computed/canonical fields (the "best guess" the UI shows by default)
  firstName     String?
  lastName      String?
  email         String?
  jobTitle      String?
  companyDomain String?
  linkedinUrl   String?

  // The source-of-truth: every field-value-source-timestamp tuple
  fieldSnapshots LeadFieldSnapshot[]

  company Company? @relation(fields: [companyDomain], references: [domain])
}

model LeadFieldSnapshot {
  id        String   @id @default(cuid())
  leadId    String
  lead      Lead     @relation(fields: [leadId], references: [id])
  fieldName String   // "jobTitle", "email", ...
  value     String   // serialized value
  source    String   // "apollo", "scraping", "linkedin", "manual", "reply"
  sourceId  String?  // the upstream record ID for traceability
  observedAt DateTime
  confidence Float?  // 0-1, source-reported when available

  @@index([leadId, fieldName, observedAt])
}
```

Whenever a new piece of data arrives:
1. Insert a new `LeadFieldSnapshot` row (never UPDATE — this table is append-only).
2. Recompute the canonical field on `Lead` by running the conflict-resolution rules below.

This gives you a free **audit trail**, **explainability** ("why does the lead say jobTitle = X?"), and **rollback** ("Apollo had it wrong last week, ignore Apollo for that field").

---

## Layer 3: Conflict resolution rules

When the same field has multiple values from different sources, pick the "best" one using a **layered policy**:

### Default policy: scored merge

```ts
type SourceScore = {
  freshness: number;   // newer = higher
  reliability: number; // per-source baseline (manual=10, linkedin=8, apollo=7, scraping=4)
  confidence: number;  // 0-1 from the source itself if reported
};

function pickBest(snapshots: LeadFieldSnapshot[]): string {
  return snapshots
    .map((s) => ({
      value: s.value,
      score:
        sourceWeight(s.source) *
        freshnessDecay(s.observedAt) *
        (s.confidence ?? 1),
    }))
    .sort((a, b) => b.score - a.score)[0].value;
}

const SOURCE_WEIGHTS: Record<string, number> = {
  manual: 10,        // user typed it — almost always right
  reply: 9,          // they signed an email with that title → very strong
  linkedin: 8,       // they wrote it themselves on their profile
  apollo: 7,         // good but stale
  hunter: 6,         // good for emails, weak for everything else
  clearbit: 6,
  scraping: 4,       // best-effort, often parses noise as data
  inferred: 2,       // derived by AI — low trust
};

function sourceWeight(source: string) {
  return SOURCE_WEIGHTS[source] ?? 1;
}

// Linear decay over 12 months: a 1-year-old value is half the weight of fresh
function freshnessDecay(observedAt: Date) {
  const ageDays = (Date.now() - observedAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0.1, 1 - ageDays / 365);
}
```

### Field-specific overrides

Some fields don't follow the default rule.

| Field | Rule |
|---|---|
| `email` | Always prefer **verified** > syntactically valid > cataloged. If multiple verified, prefer the one matching the `companyDomain`. |
| `jobTitle` | Prefer LinkedIn (self-reported) over Apollo (third-party). Prefer most recent. If a reply email signature has a title, that beats everything. |
| `phone` | Prefer **manual / reply > Apollo > scraped**. Phone numbers from scraping are almost always wrong. |
| `companyName` | Prefer the official source for that domain (their own site or LinkedIn company page) over any aggregator. |
| `firstName / lastName` | Prefer **manual or reply signature**, never trust scraping for names — first/last splitting is wrong half the time for non-Western names. |
| `companyDescription` | Concatenate, don't replace — different sources describe different aspects. AI-summarize the union. |
| `tags` / `tech_stack` | Union of all sources. Never replace. |
| `social URLs` | Union — a person can have multiple. Don't pick one. |

### Manual overrides win forever

If a user manually edited a field, **lock that field** against future automated overwrites until they explicitly clear the lock. Add a `Lead.manualOverrides: Json` column listing locked field names.

---

## Layer 4: The unified profile

After fusion, every Lead row exposes:
1. **Canonical fields** (`firstName`, `email`, `jobTitle`, ...) — what the UI shows by default
2. **Per-field provenance** (via `fieldSnapshots` join) — what the UI shows when expanded
3. **Last-updated** per field (not just per row)
4. **Confidence score** per field (the score from the merge)

Server function to fetch a "rich profile":

```ts
export type RichLeadProfile = {
  id: LeadId;
  fields: Record<string, {
    value: string | null;
    source: string;
    observedAt: Date;
    confidence: number;
    alternativeValues: Array<{ value: string; source: string; observedAt: Date }>;
  }>;
};

export async function getRichProfile(id: LeadId): Promise<RichLeadProfile> {
  const lead = await db.lead.findUniqueOrThrow({
    where: { id },
    include: { fieldSnapshots: { orderBy: { observedAt: "desc" } } },
  });

  const grouped = groupBy(lead.fieldSnapshots, "fieldName");

  return {
    id: lead.id,
    fields: mapValues(grouped, (snapshots) => {
      const best = pickBest(snapshots);
      const winning = snapshots.find((s) => s.value === best)!;
      return {
        value: best,
        source: winning.source,
        observedAt: winning.observedAt,
        confidence: scoreOf(winning),
        alternativeValues: snapshots
          .filter((s) => s.value !== best)
          .map((s) => ({ value: s.value, source: s.source, observedAt: s.observedAt })),
      };
    }),
  };
}
```

---

## Layer 5: Company-level fusion (separate problem, similar shape)

People belong to companies. Companies have their own fusion problem:
- Same domain, different names ("Acme Inc.", "Acme Corporation", "Acme")
- Subsidiaries vs parent — when do we collapse?
- Recent rebrand → old name still in scraped data

Match key for companies: **canonicalized domain** (lowercase, strip `www.`, strip subdomain unless meaningful). Same canonical domain = same company. Edge cases: `linkedin.com/company/acme` → use the LinkedIn slug as a secondary key.

Maintain `Company.aliases: string[]` for known former names. When matching by name (the weak fallback), check aliases too.

---

## What goes in `LeadEvent` (separate from snapshots)

Snapshots are "what we know about the lead." Events are "what happened to the lead." Don't mix them.

```prisma
model LeadEvent {
  id        String   @id @default(cuid())
  leadId    String
  type      String   // email_sent, email_opened, email_clicked, email_replied, status_changed, enrichment_completed
  data      Json
  createdAt DateTime @default(now())
}
```

Events drive the timeline view. Snapshots drive the profile view. They're orthogonal.

---

## AI extraction patterns (when source data is unstructured)

When a source returns free text (the "About" page of a company, a LinkedIn bio, a reply email body), use Claude to extract structured fields. The output schema:

```ts
const ExtractedFields = z.object({
  jobTitle: z.string().nullable(),
  department: z.string().nullable(),
  seniority: z.enum(["c_level", "vp", "director", "manager", "ic", "unknown"]),
  responsibilities: z.array(z.string()).optional(),
  toolsMentioned: z.array(z.string()).optional(),
  intentSignals: z.array(z.object({
    signal: z.string(),
    strength: z.enum(["weak", "medium", "strong"]),
  })).optional(),
});
```

Always:
- Pass the schema in the prompt as a strict JSON example
- Use Claude's structured-output / tool-use mode (not freeform JSON)
- Validate the response with Zod before saving
- Mark the source as `inferred` with low weight in the merge so manual data always wins

---

## Anti-patterns

1. **`UPDATE lead SET ... WHERE id = ?` from a job that processes one source.** Always insert a snapshot, then recompute. UPDATE destroys provenance.
2. **Storing JSON blobs as the only source of truth.** A 50KB Apollo JSON in `enrichment` column is not searchable, not indexable, not auditable. Extract fields you care about into columns AND keep the blob for debugging.
3. **Trusting any single source's "last_updated" field as the absolute truth.** Apollo says it's fresh because it ran a scraper yesterday — but the underlying LinkedIn page was last edited 3 years ago.
4. **Auto-collapsing on weak matches.** "Same name + same city" is weak. If you collapse, you'll merge two real people into one frankenlead. Always require strong or 2-of-medium.
5. **Letting AI inference overwrite human data.** AI extracted "VP of Engineering" but the user manually set "Director of Engineering" last week. Manual wins, always.
6. **Throwing away conflicts.** When two sources disagree, both values are interesting. Keep both, surface the conflict in the UI.
7. **Recomputing canonical fields on every read.** Compute on write (snapshot insert), cache on the Lead row. Reads should be cheap.

---

## Operational checklist when adding a new data source

When adding a new enrichment provider:

1. Define which fields this source provides
2. Assign it a `SOURCE_WEIGHTS` value (default 5, adjust based on testing)
3. Map its raw response to your `LeadFieldSnapshot` schema
4. Add a Zod parser for its response shape (don't trust the API)
5. Add it to the matching ladder if it has strong identity signals (verified emails, LinkedIn URLs)
6. Add an Inngest job that ingests new records → matches → snapshots → recomputes canonical
7. Add a manual rerun command for backfilling existing leads

---

## Reference

- Sister skill: `lead-ui-density` — how to display the unified profile to a human
- Sister skill: `b2b-outreach-automation` — how scoring and sequencing use the canonical fields
- Sister skill: `people-osint-enrichment` — how to gather raw signals before fusion
- Project: `~/Documents/Claude/Projects/Prolife/` — production implementation lives in `packages/db/prisma/schema.prisma` and `packages/enrichment/`
