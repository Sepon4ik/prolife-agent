# Stripe SaaS Billing — Next.js + Prisma

## When to use
When implementing subscription billing, pricing pages, payment flows, or usage-based billing for a SaaS product.

## Stripe Data Model

```
Product (e.g., "ProLife Agent")
  └── Price (e.g., "$99/mo", "$249/mo", "$499/mo")
        └── Subscription (per customer)
              └── Invoice (monthly)
                    └── Payment Intent (charge)
```

## Recommended Plan Structure

```typescript
const PLANS = {
  starter: {
    name: "Starter",
    priceId: "price_xxx", // from Stripe Dashboard
    price: 99,
    limits: {
      companies: 500,
      emailsPerMonth: 1000,
      scrapingJobs: 10,
      users: 2,
    },
  },
  pro: {
    name: "Pro", 
    priceId: "price_yyy",
    price: 249,
    limits: {
      companies: 5000,
      emailsPerMonth: 10000,
      scrapingJobs: 100,
      users: 10,
    },
  },
  enterprise: {
    name: "Enterprise",
    priceId: "price_zzz", 
    price: 499,
    limits: {
      companies: -1, // unlimited
      emailsPerMonth: -1,
      scrapingJobs: -1,
      users: -1,
    },
  },
} as const;
```

## Prisma Schema Additions

```prisma
model Tenant {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  
  // Stripe billing
  stripeCustomerId     String?  @unique
  stripeSubscriptionId String?
  stripePriceId        String?
  stripeCurrentPeriodEnd DateTime?
  plan                 String   @default("free") // free, starter, pro, enterprise
  
  // Usage tracking
  companiesCount       Int      @default(0)
  emailsSentThisMonth  Int      @default(0)
  usageResetAt         DateTime @default(now())
  
  // ... existing fields
}
```

## Checkout Flow (Server Action)

```typescript
// app/api/billing/checkout/route.ts
import Stripe from "stripe";
import { prisma } from "@agency/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const { priceId, tenantId } = await req.json();
  
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });

  // Create or retrieve Stripe customer
  let customerId = tenant.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { tenantId },
    });
    customerId = customer.id;
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { stripeCustomerId: customerId },
    });
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?billing=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?billing=cancelled`,
    metadata: { tenantId },
  });

  return Response.json({ url: session.url });
}
```

## Webhook Handler

```typescript
// app/api/webhooks/stripe/route.ts
import Stripe from "stripe";
import { prisma } from "@agency/db";
import { NextRequest, NextResponse } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
      );
      await prisma.tenant.update({
        where: { stripeCustomerId: session.customer as string },
        data: {
          stripeSubscriptionId: subscription.id,
          stripePriceId: subscription.items.data[0].price.id,
          stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
          plan: getPlanFromPriceId(subscription.items.data[0].price.id),
        },
      });
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          invoice.subscription as string
        );
        await prisma.tenant.update({
          where: { stripeCustomerId: invoice.customer as string },
          data: {
            stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
            emailsSentThisMonth: 0, // Reset monthly usage
            usageResetAt: new Date(),
          },
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await prisma.tenant.update({
        where: { stripeCustomerId: subscription.customer as string },
        data: {
          plan: "free",
          stripeSubscriptionId: null,
          stripePriceId: null,
        },
      });
      break;
    }

    case "invoice.payment_failed": {
      // Send notification, start dunning grace period
      const invoice = event.data.object as Stripe.Invoice;
      console.warn(`Payment failed for customer ${invoice.customer}`);
      // TODO: Send email notification, trigger grace period
      break;
    }
  }

  return NextResponse.json({ received: true });
}

function getPlanFromPriceId(priceId: string): string {
  for (const [plan, config] of Object.entries(PLANS)) {
    if (config.priceId === priceId) return plan;
  }
  return "free";
}
```

## Feature Gating Middleware

```typescript
// lib/billing.ts
import { prisma } from "@agency/db";

export async function checkUsageLimit(
  tenantId: string,
  feature: "companies" | "emailsPerMonth" | "scrapingJobs"
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      plan: true,
      companiesCount: true,
      emailsSentThisMonth: true,
      _count: { select: { scrapingJobs: true } },
    },
  });

  const plan = PLANS[tenant.plan as keyof typeof PLANS] ?? PLANS.starter;
  const limit = plan.limits[feature];

  if (limit === -1) return { allowed: true, current: 0, limit: -1 };

  let current: number;
  switch (feature) {
    case "companies": current = tenant.companiesCount; break;
    case "emailsPerMonth": current = tenant.emailsSentThisMonth; break;
    case "scrapingJobs": current = tenant._count.scrapingJobs; break;
  }

  return { allowed: current < limit, current, limit };
}

// Usage in API routes:
const usage = await checkUsageLimit(tenantId, "emailsPerMonth");
if (!usage.allowed) {
  return Response.json({ 
    error: `Monthly email limit reached (${usage.current}/${usage.limit}). Upgrade your plan.` 
  }, { status: 403 });
}
```

## Customer Portal (Self-Service)

```typescript
// Let customers manage their own subscription
export async function POST(req: Request) {
  const { tenantId } = await req.json();
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });

  if (!tenant.stripeCustomerId) {
    return Response.json({ error: "No billing account" }, { status: 400 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
  });

  return Response.json({ url: session.url });
}
```

## Pricing Page Component Pattern

```tsx
function PricingCard({ plan, current, onSelect }: {
  plan: typeof PLANS[keyof typeof PLANS];
  current: boolean;
  onSelect: () => void;
}) {
  return (
    <div className={`rounded-xl border p-6 ${current ? "border-primary-500 bg-primary-500/5" : "border-white/10"}`}>
      <h3 className="text-lg font-bold">{plan.name}</h3>
      <div className="mt-2">
        <span className="text-4xl font-bold">${plan.price}</span>
        <span className="text-gray-400">/mo</span>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-gray-300">
        <li>{plan.limits.companies === -1 ? "Unlimited" : plan.limits.companies} companies</li>
        <li>{plan.limits.emailsPerMonth === -1 ? "Unlimited" : plan.limits.emailsPerMonth} emails/mo</li>
        <li>{plan.limits.users === -1 ? "Unlimited" : plan.limits.users} team members</li>
      </ul>
      <button
        onClick={onSelect}
        disabled={current}
        className="mt-6 w-full py-2 rounded-lg bg-primary-600 text-white font-medium disabled:opacity-50"
      >
        {current ? "Current Plan" : "Upgrade"}
      </button>
    </div>
  );
}
```

## Key Implementation Rules

1. **Never trust client-side plan data.** Always verify subscription status server-side via Stripe API or webhook-synced DB.
2. **Webhook idempotency.** Store `event.id` and skip duplicates.
3. **Handle subscription gaps.** Check `stripeCurrentPeriodEnd > now()` before gating features.
4. **Dunning grace period.** Don't immediately revoke access on failed payment. Give 3-7 days.
5. **Proration.** Use `proration_behavior: "create_prorations"` for mid-cycle upgrades.
6. **Test with Stripe CLI:** `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
