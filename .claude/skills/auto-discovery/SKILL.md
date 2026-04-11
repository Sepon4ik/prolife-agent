# Auto-Discovery — Continuous Trend Monitoring & Research

## When to use

Use this skill when setting up **automated monitoring of competitors, trends, tools, and industry news** — or when doing deep research on a topic. Applies to staying current as a solo AI agency operator, monitoring competitor moves, tracking new tools/frameworks, and automating research workflows.

**Trigger keywords**: "мониторинг", "трекинг", "конкуренты", "тренды", "новости", "research", "что нового", "следить за", "автоматизация ресерча", "deep research", "competitive intelligence".

**This skill is NOT for**: web scraping for lead data (`web-scraping-scale`), or OSINT on specific people (`people-osint-enrichment`).

---

## The solo operator's discovery stack

As a solo AI agency, you can't manually track everything. Set up three layers:

```
Layer 1: Passive monitoring (runs automatically, alerts you)
Layer 2: Scheduled digests (daily/weekly summaries)
Layer 3: On-demand deep research (when you need to go deep on a topic)
```

---

## Layer 1: Passive Monitoring

### Website change detection — changedetection.io (22k stars)

Monitor competitor sites, pricing pages, tool docs for changes.

```bash
# Self-hosted via Docker
docker run -d --restart always -p 5000:5000 \
  -v changedetection-data:/datastore \
  ghcr.io/dgtlmoon/changedetection.io
```

**What to monitor:**
| URL pattern | Why | Check interval |
|---|---|---|
| Competitor pricing pages | Catch price/plan changes | Daily |
| Competitor changelog/blog | New features, positioning | Daily |
| GitHub releases (key tools) | Breaking changes, new features | 12h |
| Job boards (competitor hiring) | Signals expansion/pivot | Weekly |
| Industry news sites | Market shifts | Daily |

**Setup for ORFEO:**
```
Monitor list:
- https://www.apollo.io/pricing → pricing changes
- https://www.instantly.ai/pricing → pricing changes  
- https://www.clay.com/changelog → new features
- https://github.com/anthropics/anthropic-sdk-typescript/releases → SDK updates
- https://docs.anthropic.com/en/docs/about-claude/models → new models
- https://higgsfield.ai → P1 tool updates
```

**Notification**: webhook → Telegram bot (use the automation template in `Автоматизация/agency-template/telegram-bot/`).

### RSS + AI filtering — auto-news (860 stars)

Aggregate multiple sources with LLM-powered noise filtering.

```
Sources: Twitter lists, RSS feeds, YouTube channels, Reddit, HN
    ↓
LLM filter: "Is this relevant to AI agents, B2B outreach, or video generation?"
    ↓
Daily digest → Markdown file or Telegram message
```

**Key repo: finaldie/auto-news**

Setup:
1. Define source feeds (RSS, Twitter lists, Reddit subs)
2. Configure LLM filter prompt with your interests
3. Schedule daily runs via cron or Inngest
4. Output: daily markdown digest

**Filter prompt template:**
```
You are filtering news for a solo AI agency operator. 
Keep items about: AI agent frameworks, B2B outreach automation, 
email deliverability, video generation AI, web scraping tools, 
Next.js/React ecosystem, Anthropic/Claude updates.

Discard items about: consumer AI apps, crypto, gaming (unless mobile UA),
general tech news without AI relevance.

Score each item 1-10. Only keep items scoring 7+.
```

---

## Layer 2: Scheduled Digests

### GitHub trending tracker

Monitor GitHub trending for relevant repos weekly.

```typescript
// Inngest scheduled function
export const githubTrendingDigest = inngest.createFunction(
  { id: "github-trending-digest" },
  { cron: "0 9 * * 1" }, // Every Monday 9am
  async ({ step }) => {
    const topics = ["ai-agent", "web-scraping", "email", "video-generation", "rag"];
    
    for (const topic of topics) {
      const trending = await step.run(`fetch-${topic}`, async () => {
        const res = await fetch(
          `https://api.github.com/search/repositories?q=topic:${topic}&sort=stars&order=desc&per_page=10`
        );
        return res.json();
      });
      // Filter for repos created/updated in last 7 days
      // Send digest via Telegram
    }
  }
);
```

### Competitor feature tracking

Maintain a competitor matrix and update it monthly:

```markdown
<!-- competitors.md — update monthly -->
| Feature | ProLife | Apollo | Instantly | Clay |
|---|---|---|---|---|
| AI classification | Yes (Claude) | Yes | No | Yes |
| Multi-channel | Email only | Email+LinkedIn+Call | Email | Email+LinkedIn |
| Enrichment waterfall | 4 providers | Built-in DB | No | 100+ providers |
| Self-hosted option | No | No | No | No |
| Pricing | TBD | $99/mo | $30/mo | $134/mo |
```

### ArXiv monitoring (for AI research)

Track papers in relevant categories:

```bash
# Simple cron job: fetch daily ArXiv papers in cs.AI, cs.CL
curl "http://export.arxiv.org/api/query?search_query=cat:cs.AI+AND+(agent+OR+rag+OR+memory)&sortBy=submittedDate&sortOrder=descending&max_results=20"
```

Or use **JeremyChou28/Daily-Arxiv-Tools** for automated daily crawls with topic filtering.

---

## Layer 3: On-Demand Deep Research

### gpt-researcher (26.3k stars)

Autonomous research agent — give it a topic, get a structured report.

```bash
pip install gpt-researcher
```

```python
from gpt_researcher import GPTResearcher

async def research_topic(query: str):
    researcher = GPTResearcher(query=query, report_type="research_report")
    report = await researcher.conduct_research()
    return await researcher.write_report()

# Example: "Best practices for AI video ad creatives in mobile gaming UA 2026"
```

**Use cases for ORFEO:**
- Research a new market before pitching
- Analyze a competitor's positioning and messaging
- Survey the state of a technology before adopting it
- Research potential clients before outreach

### khoj (34k stars) — Self-hosted AI second brain

Personal AI assistant that can search the web, your documents, and schedule research.

```bash
docker run -p 42110:42110 ghcr.io/khoj-ai/khoj
```

**Features:**
- Web search + your local docs as knowledge base
- Scheduled automations ("every Monday, summarize AI agent news")
- Conversation memory across sessions
- Multiple LLM backends (Claude, GPT, local)

### Deep research with Claude Code

You already have the most powerful research tool — Claude Code itself. Pattern for systematic research:

```
1. Define the question clearly
2. Use WebSearch/WebFetch for current data
3. Use Agent tool to parallelize searches
4. Synthesize findings
5. Save conclusions to memory files
```

---

## Research workflow templates

### Template 1: "Should we adopt tool X?"

```markdown
## Research: [Tool Name]

### Questions to answer:
1. What problem does it solve that we can't solve now?
2. What's the maturity level? (stars, contributors, release cadence)
3. Does it fit our stack? (TS/Node, serverless-compatible, Vercel-friendly)
4. What's the cost? (free tier, scaling costs)
5. What are the alternatives? (compare 2-3)
6. Who's using it in production? (case studies, testimonials)
7. What's the migration/adoption effort? (hours/days/weeks)

### Decision: Adopt / Watch / Skip
### Reasoning: ...
```

### Template 2: "Competitive landscape for X"

```markdown
## Competitive Analysis: [Market/Feature]

### Players:
| Company | Positioning | Pricing | Key differentiator | Weakness |
|---|---|---|---|---|

### Market trends:
- ...

### Opportunity gaps:
- ...

### Implications for ProLife/ORFEO:
- ...
```

### Template 3: "Weekly discovery digest"

```markdown
## Week of [date]

### New tools worth watching:
- [tool] — [why relevant] — [action: star / try / skip]

### Competitor moves:
- [competitor] — [what changed] — [impact on us]

### Industry trends:
- [trend] — [source] — [relevance]

### Action items:
- [ ] ...
```

---

## Recommended setup for ORFEO (minimal viable monitoring)

### Immediate (30 min setup):
1. **changedetection.io** via Docker — monitor 5-10 competitor/tool URLs
2. **Telegram webhook** for alerts (reuse existing bot from `Автоматизация/`)

### Week 1:
3. **Weekly Claude Code research session** — use Agent tool to scan GitHub trending + HN + ArXiv
4. Save findings to memory files (already doing this)

### Month 1:
5. **auto-news** for daily AI digest with LLM filtering
6. **gpt-researcher** for on-demand deep dives

### Later (when needed):
7. **khoj** self-hosted for persistent research assistant
8. Custom Inngest functions for automated competitor tracking

---

## Anti-patterns

- **Monitoring everything**: Monitor only what affects your decisions. 10 focused URLs > 100 random ones.
- **No action triggers**: Every monitor needs a "so what" — what action do you take when something changes?
- **Research without output**: Every research session should produce a memory file, a decision, or an action item. Research that doesn't change behavior is waste.
- **Manual tracking**: If you're checking a site manually every week, automate it. That's what changedetection.io is for.
- **Tool hoarding**: Starring 50 repos is not progress. Try one, evaluate, adopt or skip, move on.

---

## When to update this skill

- When a monitoring tool is actually deployed and validated (add setup notes)
- When a research template proves useful and gets refined
- When a new discovery channel proves valuable (e.g., "Discord community X is the best signal source for Y")
- When monitoring reveals a pattern worth encoding (e.g., "competitor always ships pricing changes on Fridays")
