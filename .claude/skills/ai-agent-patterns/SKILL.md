# AI Agent Architecture Patterns

## When to use
When designing or building AI-powered autonomous agents, multi-step pipelines, or intelligent automation systems.

## Core Agent Loop

Every AI agent follows this fundamental pattern:

```
┌─────────────────────────────────┐
│         OBSERVE                 │
│  (read input, check state)      │
├─────────────────────────────────┤
│         THINK                   │
│  (LLM reasons about next step)  │
├─────────────────────────────────┤
│         ACT                     │
│  (call tool, update state)      │
├─────────────────────────────────┤
│         EVALUATE                │
│  (check result, decide if done) │
└──────────┬──────────────────────┘
           │ not done
           └──→ loop back to OBSERVE
```

## Architecture Patterns (Pick One)

### 1. Linear Pipeline (what ProLife uses)
Best for: well-defined sequential workflows.

```
Scrape → Enrich → Score → Outreach → Follow-up → Handle Reply
```

Each step is an Inngest function. Steps are deterministic — always the same sequence.

**Pros:** Simple, debuggable, predictable costs.
**Cons:** Can't adapt to unexpected situations, no branching.

### 2. ReAct (Reasoning + Acting)
Best for: tasks that need flexible tool selection.

```
User Query → [Think → Act → Observe] loop → Final Answer
```

The LLM decides which tool to use at each step based on what it learned.

```typescript
// ReAct agent loop
let messages = [{ role: "user", content: task }];
for (let i = 0; i < MAX_ITERATIONS; i++) {
  const response = await claude.messages.create({
    model: "claude-sonnet-4-6",
    system: "You are an agent. Use tools to accomplish the task. When done, respond without tool use.",
    tools: availableTools,
    messages,
  });
  
  if (response.stop_reason === "end_turn") break; // Done
  
  // Execute tool calls
  const toolResults = await executeToolCalls(response);
  messages.push({ role: "assistant", content: response.content });
  messages.push({ role: "user", content: toolResults });
}
```

**Pros:** Flexible, adapts to unknown situations.
**Cons:** Unpredictable costs, can loop, harder to debug.

### 3. Plan-and-Execute
Best for: complex multi-step tasks that benefit from upfront planning.

```
Task → Plan (decompose into subtasks) → Execute each subtask → Synthesize
```

```typescript
// Step 1: Plan
const plan = await claude.messages.create({
  model: "claude-opus-4-6",
  system: "Break this task into 3-7 concrete subtasks.",
  messages: [{ role: "user", content: task }],
  output_config: { format: { type: "json_schema", schema: planSchema } },
});

// Step 2: Execute each subtask (can use cheaper model)
for (const subtask of plan.subtasks) {
  const result = await executeSubtask(subtask); // Uses Sonnet or Haiku
  results.push(result);
}

// Step 3: Synthesize
const final = await claude.messages.create({
  model: "claude-sonnet-4-6",
  messages: [{ role: "user", content: `Synthesize results: ${JSON.stringify(results)}` }],
});
```

### 4. Multi-Agent (Supervisor + Workers)
Best for: complex systems with distinct expertise areas.

```
[Supervisor] decides what to do
    ├── [Agent A] handles research
    ├── [Agent B] handles writing
    └── [Agent C] handles review
```

**Key principles:**
- Each agent has a narrow role, limited tools, and clear system prompt
- Supervisor uses the most capable model (Opus)
- Workers use cost-effective models (Haiku/Sonnet) based on task complexity
- File system or database serves as shared memory between agents

## State Management Patterns

### Event-Driven (Inngest — what ProLife uses)
```typescript
// Each step is a durable function with automatic retry
export const enrichCompany = inngest.createFunction(
  { id: "enrich-company", retries: 3, throttle: { limit: 5, period: "1s" } },
  { event: "prolife/enrich.started" },
  async ({ event, step }) => {
    const company = await step.run("get-company", () => prisma.company.findUnique(...));
    const scraped = await step.run("scrape", () => crawlPages(...));
    const classified = await step.run("classify", () => classifyCompany(...));
    await step.run("update", () => prisma.company.update(...));
    await step.sendEvent("trigger-next", { name: "prolife/score.calculate", data: {...} });
  }
);
```

**Benefits:**
- Each `step.run()` is checkpointed — if the function crashes, it resumes from the last completed step
- Automatic retry with backoff
- Throttling prevents API rate limits
- Events chain steps together (scrape → enrich → score → outreach)

### Memory Patterns for Agents

**Short-term (within session):** Message history in the conversation.

**Medium-term (across steps):** Database records (company.status tracks pipeline position).

**Long-term (across sessions):** 
- CLAUDE.md / skill files for domain knowledge
- Database for learned patterns (e.g., which email subjects get more replies)

## Error Handling & Recovery

### Retry with Exponential Backoff
```typescript
inngest.createFunction({
  retries: 3, // Inngest handles backoff automatically
  // Backoff: 1s → 2s → 4s
});
```

### Graceful Degradation
```typescript
// If AI classification fails, fall back to rule-based
const classification = await step.run("classify", async () => {
  try {
    return await classifyCompany(content, name, country);
  } catch (e) {
    console.error("AI classification failed, using fallback:", e);
    return fallbackClassification(name, country); // Rule-based
  }
});
```

### Human-in-the-Loop Escalation
```typescript
// If confidence is low, flag for human review
if (classification.confidence < 0.5) {
  await step.sendEvent("flag-for-review", {
    name: "prolife/review.needed",
    data: { companyId, reason: "Low confidence classification" },
  });
  return; // Don't proceed with automation
}
```

## Cost Optimization Strategies

1. **Model routing:** Haiku for classification ($0.001/company) → Sonnet for generation ($0.01/email)
2. **Prompt caching:** Cache system prompts + ICP criteria (90% savings on reads)
3. **Batch API:** Process enrichment in bulk (50% savings)
4. **Early termination:** If company is clearly irrelevant, skip expensive enrichment
5. **Token budgets:** Set max_tokens per call. Never leave unlimited.
6. **Cache AI results:** Store classifications in DB, don't re-classify the same company

## Anti-Patterns to Avoid

- **God agent:** One agent that does everything → split into specialists
- **Infinite loops:** Always set MAX_ITERATIONS on agent loops
- **No checkpointing:** If a 10-step pipeline fails at step 8, restart from step 8, not step 1
- **Expensive model for simple tasks:** Don't use Opus to extract an email from HTML
- **No cost tracking:** Log token usage per call. Set alerts on daily spend.
- **Synchronous chains:** Don't wait for enrichment to finish before starting the next scrape. Use event-driven async.
