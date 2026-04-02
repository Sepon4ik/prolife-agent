# B2B Outreach Automation — Best Practices

## When to use
When building or improving email outreach features, lead generation pipelines, or sales automation for B2B products.

## The Modern B2B Outreach Stack (2025-2026)

```
Data Sources → Enrichment → Scoring → Sequencing → Sending → Tracking → Handoff
```

### How the Best Tools Work

**Apollo.io:** Database of 275M contacts. Scores leads by intent signals + firmographics. Multi-channel sequences (email + LinkedIn + calls). $99-149/mo.

**Instantly.ai:** Unlimited email accounts. Auto-warmup. Campaign rotation across mailboxes. Smart sending (matches recipient timezone). $30-77/mo.

**Clay:** Waterfall enrichment (cascades through 100+ data providers). AI-powered personalization. Zapier-like workflow builder. $134-720/mo.

**Smartlead:** Multi-mailbox rotation. Unified inbox. AI-categorized replies. Sub-accounts for agencies. $39-94/mo.

**Lemlist:** Multi-channel (email + LinkedIn + calls). AI-generated personalized images/videos. $32-129/mo.

## Lead Scoring Framework

### ICP (Ideal Customer Profile) Scoring
Score companies on how well they match your ideal customer:

| Factor | Weight | Scoring Logic |
|--------|--------|--------------|
| **Geography** | 20% | Tier 1 markets = full score, Tier 2 = 75%, Tier 3 = 50% |
| **Company Type** | 15% | Exact match = full, adjacent = 50% |
| **Revenue** | 15% | Above threshold = full, 50-100% = partial |
| **Tech Stack** | 10% | Uses complementary tools = full |
| **Team Size** | 10% | In range = full |
| **Buying Signals** | 15% | Job postings, tech adoption, funding |
| **Engagement** | 15% | Website visits, content downloads, email opens |

### Intent Signals (what ProLife can add)
- Company recently hired for relevant roles (sales director, business development)
- Company is expanding to new markets
- Company website mentions "seeking partners" or "distribution opportunities"
- Company attended relevant trade shows
- Company follows competitors on social media

## Email Sequence Best Practices

### Sequence Structure (proven 4-touch framework)
```
Day 0:  Initial email — personalized, value-first, clear CTA
Day 3:  Follow-up 1 — add social proof, case study
Day 7:  Follow-up 2 — different angle, share insight
Day 14: Follow-up 3 — breakup email ("closing the loop")
```

### Email Copy Rules
1. **Subject line:** 3-5 words, lowercase, looks personal ("quick question about {company}")
2. **Opening line:** Reference something specific about them (NOT "I came across your company")
3. **Body:** 50-100 words max. One clear value prop. No attachments.
4. **CTA:** One specific ask ("15 min this Thursday?"). Not "let me know if interested."
5. **Signature:** Name + title only. No banners, logos, or HTML.
6. **Format:** Plain text. No images. No tracking pixels if possible.

### Personalization Tiers
- **Tier 1 (High priority leads):** Fully custom email with company-specific research
- **Tier 2 (Medium):** Template with personalized opening line + company name
- **Tier 3 (Low):** Template with {{company}}, {{industry}} variables

### A/B Testing
- Test subject lines (2 variants, 50/50 split)
- Test CTA styles (question vs statement)
- Test email length (50 words vs 100 words)
- Test sending time (morning vs afternoon)
- Minimum 100 sends per variant for statistical significance

## Reply Handling

### AI Classification Categories
```typescript
type ReplyIntent =
  | "interested"        // Wants to talk → HANDOFF to sales
  | "not_interested"    // Clear no → Mark and stop
  | "request_info"      // Wants more details → Send relevant content
  | "out_of_office"     // Auto-reply → Reschedule follow-up
  | "wrong_person"      // Referral opportunity → Ask for right contact
  | "unsubscribe"       // Legal requirement → Remove immediately
  | "unclear"           // Ambiguous → Flag for human review
```

### Automated Response Flows
```
interested → Notify sales (Telegram) + book meeting link
not_interested → Thank, remove from sequence, note reason
request_info → Send relevant case study/deck automatically
out_of_office → Pause sequence, resume when they're back
wrong_person → Ask for referral to right person
```

## Multi-Channel Strategy

Email alone gets 1-5% reply rate. Adding channels increases to 10-15%:

1. **Day -1:** View their LinkedIn profile (creates curiosity)
2. **Day 0:** Send email #1
3. **Day 2:** Connect on LinkedIn with personalized note
4. **Day 4:** Follow-up email #2
5. **Day 7:** LinkedIn message (if connected)
6. **Day 10:** Follow-up email #3
7. **Day 14:** Breakup email + LinkedIn voice message

## Metrics to Track

| Metric | Target | Red Flag |
|--------|--------|----------|
| **Delivery rate** | >95% | <90% = infrastructure issue |
| **Open rate** | >50% | <30% = bad subject lines or deliverability |
| **Reply rate** | >5% | <2% = bad copy or wrong audience |
| **Positive reply rate** | >2% | <0.5% = wrong ICP |
| **Bounce rate** | <3% | >5% = bad data, stop sending |
| **Spam complaint rate** | <0.1% | >0.3% = serious problem, pause immediately |
| **Unsubscribe rate** | <1% | >2% = too aggressive |

## Scaling Outreach

### Volume Benchmarks
- **Per email account:** 30-50 emails/day max (cold)
- **Per domain:** 2-3 email accounts
- **For 500 emails/day:** Need ~10-15 accounts across 5+ domains
- **Warmup period:** 2-4 weeks before going to full volume

### Mailbox Rotation
```
Domain: getprolife.com → accounts: outreach1@, partnerships@
Domain: prolife-global.com → accounts: hello@, team@
Domain: tryprolife.com → accounts: partners@, connect@
```

Each account sends 30-40/day. System rotates which account sends to which lead.

## CRM Integration Points

When building outreach into a SaaS:
- Sync company status bidirectionally with CRM
- Log all email activity as CRM activities
- Create CRM deals when reply is "interested"
- Track attribution (which sequence/email converted)
- Export engagement data for analytics
