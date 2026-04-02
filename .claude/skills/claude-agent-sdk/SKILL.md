# Claude Agent SDK & API — Complete Reference

## When to use
When building AI-powered agents, multi-step workflows, or any feature that uses Claude API for classification, generation, structured output, or autonomous tool use.

## Agent SDK vs Client SDK

**Client SDK** (`@anthropic-ai/sdk`): You implement the tool loop yourself. Good for simple request/response with tool use.

**Agent SDK** (`@anthropic-ai/claude-agent-sdk`): Claude handles tools autonomously. Good for complex multi-step tasks.

```typescript
// Client SDK: manual tool loop
let response = await client.messages.create({ tools, messages });
while (response.stop_reason === "tool_use") {
  const result = await executeTools(response);
  response = await client.messages.create({ tools, messages: [...messages, result] });
}

// Agent SDK: autonomous execution
for await (const message of query({
  prompt: "Find and fix the bug",
  options: { allowedTools: ["Read", "Edit", "Bash"] }
})) {
  console.log(message);
}
```

## Model Selection Matrix

| Task | Model | Cost (in/out per MTok) | Why |
|------|-------|------------------------|-----|
| Classification, routing, extraction | Haiku 4.5 | $1/$5 | Cheapest, fast, good enough |
| Content generation, coding | Sonnet 4.6 | $3/$15 | Best speed/quality ratio |
| Complex reasoning, supervision | Opus 4.6 | $5/$25 | Most capable, 1M context |
| Bulk processing | Any + Batch API | 50% of above | Async, up to 100K requests |

**Rule of thumb:** Start with Haiku. If quality is insufficient, upgrade to Sonnet. Use Opus only for supervisor agents or complex multi-step reasoning.

## Structured Output Patterns

### Tool Use (current codebase pattern)
```typescript
const result = await ai.classify<T>({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 1024,
  system: "...",
  tools: [{
    name: "classify_company",
    description: "Classify a company based on website content",
    input_schema: zodToJsonSchema(MySchema) as any,
  }],
  tool_choice: { type: "tool", name: "classify_company" },
  messages: [{ role: "user", content: prompt }],
  stream: false,
});
```

### JSON Schema Output (newer, recommended for simple extraction)
```typescript
const response = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 1024,
  messages: [{ role: "user", content: prompt }],
  output_config: {
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: { name: { type: "string" }, score: { type: "number" } },
        required: ["name", "score"],
        additionalProperties: false,
      },
    },
  },
});
```

## Extended Thinking (Chain-of-Thought)

Give Claude a scratchpad for complex reasoning. The thinking tokens are not shown to users but improve quality.

```typescript
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 16000,
  thinking: { type: "enabled", budget_tokens: 10000 },
  messages: [{ role: "user", content: "Complex reasoning question" }],
});

for (const block of response.content) {
  if (block.type === "thinking") console.log("Reasoning:", block.thinking);
  if (block.type === "text") console.log("Answer:", block.text);
}
```

**With tool use:** You MUST pass thinking blocks back in subsequent messages.

## Prompt Caching

Cache system prompts, tool definitions, and large documents. 90% cost savings on cache hits.

```typescript
const response = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 1024,
  cache_control: { type: "ephemeral" }, // Auto-caching
  system: [
    { type: "text", text: "System instructions..." },
    { type: "text", text: largeDomainKnowledge, 
      cache_control: { type: "ephemeral", ttl: "1h" } }, // 1-hour cache
  ],
  messages: [{ role: "user", content: query }],
});
```

**Requirements:** Min 4,096 tokens (Opus) / 2,048 (Sonnet/Haiku) to cache. Max 4 cache breakpoints per request.

**Pricing:** Cache write = 1.25x base (5-min) or 2x (1-hour). Cache read = 0.1x base.

## Batch API (50% Cost Savings)

For non-real-time bulk processing (enriching 1000 companies, generating emails).

```typescript
const batch = await client.messages.batches.create({
  requests: companies.map((company, i) => ({
    custom_id: `company-${company.id}`,
    params: {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: `Classify: ${company.name}...` }],
    },
  })),
});
// Poll batch.id for results — typically completes within 24 hours
```

## Multi-Agent Architecture

### Supervisor + Specialist Workers
```
[Supervisor - Opus 4.6] — decomposes task, delegates, validates
    ├── [Research Agent - Sonnet 4.6] — WebSearch, WebFetch
    ├── [Classifier Agent - Haiku 4.5] — structured extraction
    ├── [Writer Agent - Sonnet 4.6] — content generation
    └── [Reviewer Agent - Sonnet 4.6] — quality check
```

### With Agent SDK Subagents
```typescript
for await (const message of query({
  prompt: "Research and qualify this company",
  options: {
    allowedTools: ["Read", "Write", "WebSearch", "Agent"],
    agents: {
      "researcher": {
        description: "Deep research on companies",
        prompt: "Find info about the company. Cite sources.",
        tools: ["WebSearch", "WebFetch", "Read"],
      },
      "qualifier": {
        description: "Lead qualification scoring",
        prompt: "Score the company against ICP criteria.",
        tools: ["Read"],
      },
    },
  },
})) { ... }
```

## Production Patterns

### Cost Control
- Set `max_tokens` per call (never leave unlimited)
- Set `budget_tokens` for extended thinking
- Cap agent iteration loops (e.g., max 10 tool calls)
- Use Haiku for 80% of calls, Sonnet for 15%, Opus for 5%

### Guardrails
- Input validation before LLM calls (prompt injection, PII)
- Output filtering after generation (PII detection, content moderation)
- Agent SDK hooks for audit logging every tool call

### Observability
- Log every API call: model, tokens used, latency, cost
- Trace multi-step agent workflows with correlation IDs
- Alert on error rate > 1% or latency P95 > 10s
- Track cost per tenant/feature

## Tool Definition Best Practices

```typescript
{
  name: "search_companies",
  description: "Search the database for companies matching criteria. Use when the user asks to find or filter companies. Returns max 50 results. Supports filtering by country, type, priority, and status. Does NOT support full-text search of company descriptions.",
  input_schema: {
    type: "object",
    properties: {
      country: { type: "string", description: "ISO country name, e.g. 'Germany'" },
      type: { type: "string", enum: ["DISTRIBUTOR", "PHARMACY_CHAIN", "RETAIL", "HYBRID"] },
      priority: { type: "string", enum: ["A", "B", "C"] },
      limit: { type: "number", description: "Max results (default 20, max 50)" }
    }
  }
}
```

**Rules:**
- 3-4+ sentence descriptions explaining what, when, and limitations
- Use enums for constrained values
- Add `description` to every property
- Consolidate related operations into fewer tools with an `action` parameter
- Return only high-signal data in tool responses (not entire database rows)
