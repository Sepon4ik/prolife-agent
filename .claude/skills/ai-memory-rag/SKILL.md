# AI Memory & RAG — Persistent Knowledge for Agents

## When to use

Use this skill when building or designing **memory systems for AI agents** — persistent context, knowledge retrieval, conversation memory, or RAG pipelines. Applies to ProLife Agent's memory layer, any agent that needs to remember across sessions, or systems that need to retrieve knowledge from documents/databases.

**Trigger keywords**: "память агента", "RAG", "knowledge base", "vector search", "embeddings", "agent memory", "long-term memory", "retrieval", "knowledge graph", "запоминание", "контекст между сессиями".

**This skill is NOT for**: Claude Code's own memory system (that's file-based in `~/.claude/`), or general database design (`code-quality-pavel-stack`).

---

## The core decision: which memory architecture?

There are 4 distinct patterns. Pick based on your requirements:

| Pattern | Best for | Complexity | Example |
|---|---|---|---|
| **File-based** | Solo tools, dev workflows | Low | Claude Code's `MEMORY.md` + files |
| **Key-value memory** | Agent personalization, user prefs | Low-Medium | mem0 |
| **Vector RAG** | Document Q&A, knowledge bases | Medium | LlamaIndex + Qdrant |
| **Knowledge Graph** | Complex reasoning, entity relationships | High | GraphRAG, LightRAG |

**For ProLife Agent**: start with **key-value memory (mem0)** for per-lead/per-company context, add **Vector RAG** later for document-based knowledge (industry reports, product catalogs).

---

## Pattern 1: Key-Value Memory (mem0)

### What it is
A universal memory layer that stores facts about entities (users, companies, leads) as structured memories. The agent can add, search, and retrieve memories without managing embeddings directly.

### When to choose
- Agent needs to remember facts about specific entities across sessions
- You want drop-in SDK, not infrastructure management
- Memory is mostly factual (not large documents)

### Key repo: mem0ai/mem0 (52k stars)

```bash
pip install mem0ai
# or for Node.js/TS:
npm install mem0ai
```

### Architecture
```
Agent conversation → mem0.add() → Auto-extracts facts → Stores in vector DB
                  → mem0.search() → Retrieves relevant memories → Injects into prompt
```

### Integration pattern for ProLife (TypeScript)
```typescript
import { MemoryClient } from "mem0ai";

const mem0 = new MemoryClient({ apiKey: process.env.MEM0_API_KEY });

// After processing a lead interaction
async function rememberLeadContext(leadId: string, interaction: string) {
  await mem0.add(interaction, {
    user_id: leadId,
    metadata: { type: "lead_interaction" },
  });
}

// Before generating outreach email
async function recallLeadContext(leadId: string, query: string) {
  const memories = await mem0.search(query, { user_id: leadId });
  return memories.map((m) => m.memory).join("\n");
}

// In the outreach agent
const context = await recallLeadContext(lead.id, `What do we know about ${lead.companyName}?`);
const email = await claude.messages.create({
  model: "claude-haiku-4-5-20251001",
  system: `You are writing a follow-up email. Here's what we know about this lead:\n${context}`,
  messages: [{ role: "user", content: `Write follow-up to ${lead.name} at ${lead.companyName}` }],
});
```

### Self-hosted alternative
mem0 can run locally with Qdrant:
```bash
docker run -p 6333:6333 qdrant/qdrant
```
```typescript
import { Memory } from "mem0ai";
const memory = new Memory({
  vector_store: { provider: "qdrant", config: { host: "localhost", port: 6333 } },
  llm: { provider: "anthropic", config: { model: "claude-haiku-4-5-20251001" } },
});
```

### Pricing
- **Cloud**: Free tier (1K memories), Pro $23/mo (100K memories)
- **Self-hosted**: Free (you pay for Qdrant hosting + LLM calls)

---

## Pattern 2: Letta (ex-MemGPT) — Self-Managing Memory

### What it is
An agent framework where the agent itself manages its own memory — deciding what to remember, what to forget, and how to organize knowledge. Three-tier architecture: core memory (always in context), recall memory (searchable conversation history), archival memory (long-term knowledge store).

### When to choose
- Building a conversational agent that needs to feel "alive" across sessions
- Agent should autonomously decide what's worth remembering
- You want the agent to have a persistent "personality" or accumulated knowledge

### Key repo: letta-ai/letta (15k+ stars)

### Architecture
```
User message → Agent reads core memory (always in prompt)
             → Agent searches recall memory (recent conversations)
             → Agent searches archival memory (long-term facts)
             → Agent responds + optionally updates its own memory
```

### When NOT to use
- Simple fact storage (use mem0 instead — less overhead)
- Document Q&A (use vector RAG instead)
- You need predictable behavior (Letta agents are autonomous, less controllable)

---

## Pattern 3: Vector RAG — Document Retrieval

### What it is
Convert documents into embeddings, store in a vector database, retrieve relevant chunks when answering questions. The classic RAG pattern.

### When to choose
- Agent needs to answer questions from a corpus of documents
- Product catalogs, knowledge bases, support docs, industry reports
- You need factual grounding with source attribution

### Architecture
```
Ingestion:  Documents → Chunking → Embedding → Vector DB
Query:      User question → Embedding → Vector search → Top-K chunks → LLM + chunks → Answer
```

### Vector DB comparison

| DB | Language | Hosting | Best for | Stars |
|---|---|---|---|---|
| **Qdrant** | Rust | Self-host or Cloud | Production, filtering, multi-tenancy | 22k |
| **Chroma** | Python | Local or Cloud | Prototyping, simple use cases | 17k |
| **Pgvector** | SQL ext | Any Postgres (Neon, Supabase) | Already using Postgres | 13k |
| **Pinecone** | Managed | Cloud only | Zero-ops, enterprise | N/A |

**For ProLife (Neon Postgres)**: start with **pgvector** — no new infrastructure. Add Qdrant when you need advanced filtering or scale.

### pgvector with Prisma (ProLife stack)
```prisma
// schema.prisma
model DocumentChunk {
  id        String   @id @default(cuid())
  content   String
  embedding Unsupported("vector(1536)")
  metadata  Json
  sourceId  String
  source    Document @relation(fields: [sourceId], references: [id])
  createdAt DateTime @default(now())

  @@index([embedding], type: Hnsw(m: 16, efConstruction: 64))
}
```

```typescript
// Search with raw SQL (Prisma doesn't support vector ops natively)
async function searchDocuments(query: string, limit = 5) {
  const embedding = await getEmbedding(query); // OpenAI or Voyage
  const results = await prisma.$queryRaw`
    SELECT id, content, metadata,
           1 - (embedding <=> ${embedding}::vector) as similarity
    FROM "DocumentChunk"
    WHERE 1 - (embedding <=> ${embedding}::vector) > 0.7
    ORDER BY embedding <=> ${embedding}::vector
    LIMIT ${limit}
  `;
  return results;
}
```

### Embedding models comparison

| Model | Dimensions | Cost/1M tokens | Quality | Best for |
|---|---|---|---|---|
| **Voyage 3** | 1024 | $0.06 | Best for code + text | ProLife (code + business docs) |
| **OpenAI text-embedding-3-small** | 1536 | $0.02 | Good general | Budget option |
| **OpenAI text-embedding-3-large** | 3072 | $0.13 | Better quality | When quality matters |
| **Cohere embed-v3** | 1024 | $0.10 | Good multilingual | Multi-language content |

### Chunking strategies

| Strategy | Chunk size | Overlap | Best for |
|---|---|---|---|
| **Fixed-size** | 512 tokens | 50 tokens | Simple, predictable |
| **Semantic** | Variable | By meaning | Better retrieval quality |
| **Recursive** | 500-1000 chars | 100 chars | LlamaIndex default, good balance |
| **Document-aware** | By section/heading | None | Structured docs (MDX, HTML) |

**Rule of thumb**: 512 tokens with 50-token overlap is the safe default. Switch to semantic chunking only if retrieval quality is measurably poor.

---

## Pattern 4: Knowledge Graph RAG

### What it is
Instead of (or in addition to) vector search, build a graph of entities and relationships extracted from documents. Query the graph for multi-hop reasoning.

### When to choose
- Questions require connecting information across multiple documents
- Entity relationships matter (company A partners with company B, person X works at company Y)
- You need to trace reasoning paths, not just find similar chunks

### Key repos

| Repo | Stars | Approach |
|---|---|---|
| **microsoft/graphrag** | 25k+ | Full pipeline: extract entities → build graph → community summaries → query |
| **HKUDS/LightRAG** | 20k+ | Simpler: dual-level retrieval (entity + relation), faster setup |
| **graphiti-project/graphiti** | growing | Temporal knowledge graph — tracks how facts change over time |

### When to use GraphRAG vs LightRAG

| Factor | GraphRAG | LightRAG |
|---|---|---|
| Setup complexity | High (many steps) | Low (few lines) |
| Query types | Global summaries, themes | Entity lookups, local facts |
| Cost | Higher (community summaries) | Lower |
| Best for | "What are the main themes across all docs?" | "What companies partner with X?" |

**For ProLife**: LightRAG is the right starting point — simpler, cheaper, and the queries are entity-focused (companies, contacts, relationships).

---

## Decision matrix: which pattern for which ProLife feature

| Feature | Pattern | Why |
|---|---|---|
| Per-lead context (interactions, preferences) | mem0 | Simple key-value, entity-scoped |
| Product catalog Q&A for outreach | pgvector RAG | Structured docs, Postgres native |
| Company relationship mapping | LightRAG | Entity + relationship graph |
| Agent self-improvement (learning from outcomes) | mem0 + feedback loop | Store what worked/didn't per lead type |
| Industry knowledge base | pgvector RAG | Large corpus, similarity search |

---

## Implementation roadmap for ProLife

### Phase 1 (now): mem0 for lead context
- Store interaction summaries per lead
- Retrieve context before generating outreach
- Cost: ~$0 (self-hosted) or $23/mo (cloud)

### Phase 2 (when product catalog exists): pgvector RAG
- Embed product descriptions and specs
- Auto-include relevant product info in outreach
- Cost: $0 (pgvector in Neon) + embedding costs (~$0.02/1M tokens)

### Phase 3 (when relationship mapping needed): LightRAG
- Build company/contact knowledge graph
- Enable queries like "who at company X knows someone at company Y"
- Cost: LLM calls for entity extraction

---

## Anti-patterns

- **RAG everything**: Not every agent needs RAG. If the knowledge fits in a system prompt (< 50K tokens), just put it there.
- **Embedding without chunking strategy**: Throwing entire documents into a vector DB gives poor retrieval. Always chunk thoughtfully.
- **Ignoring hybrid search**: Vector search alone misses exact matches. Combine with keyword search (BM25) for best results.
- **No relevance threshold**: Always filter by similarity score (> 0.7). Returning irrelevant chunks is worse than returning nothing.
- **Overbuilding early**: Don't build a knowledge graph when mem0 + 10 memories would solve the problem. Add complexity only when simpler patterns fail.

---

## When to update this skill

- When mem0 or LightRAG release breaking API changes
- When a new pattern proves itself in ProLife (e.g., "pgvector worked great for X")
- When a new embedding model significantly outperforms current options
- When Prisma adds native vector support (watch prisma/prisma#14578)
