# W03 RAG Pipeline — Required Agent Skills

> Skills identified from the W03 RAG Implementation Plan for building the Supabase + pgvector RAG pipeline.

---

## Skills Map by Phase

| Phase | Skill | Tier | Priority |
|---|---|---|---|
| Phase 1: Schema + HNSW index | `pgvector` | Cross-tool | 🔴 Must have |
| Phase 1: Supabase setup | `supabase-automation` | Mega bundle | 🔴 Must have |
| Phase 4: OpenAI embeddings | `openai-sdk` | Cross-tool | 🔴 Must have |
| Phase 2: PDF ingestion | `universal-scraping-architect` | Production teams | 🟡 Recommended |
| Phase 3+4: RAG pipeline patterns | `chromadb` | Cross-tool | 🟡 Recommended |
| Phase 2: Scanned PDF fallback | `pdf-ocr` | Cross-tool | 🟢 Optional |

---

## 🔴 Must Have Skills

### 1. pgvector
- **Skill ID:** `terminalskills/skills/pgvector/SKILL.md`
- **Repo:** Terminal Skills (Cross-tool)
- **Tags:** data, ai-ml, automation
- **Description:** Store and search vector embeddings in PostgreSQL with pgvector. Covers vector columns, indexing (IVFFlat, HNSW), similarity search, and RAG with Postgres.
- **Covers phases:** Phase 1 (HNSW index creation), Phase 5+6 (cosine similarity queries)

### 2. supabase-automation
- **Skill ID:** `antigravity-awesome-skills/skills/supabase-automation/SKILL.md`
- **Repo:** Antigravity Awesome Skills (Mega bundle)
- **Tags:** data, ai-ml, automation
- **Description:** Automate Supabase database queries, table management, project administration, storage, edge functions, and SQL execution.
- **Covers phases:** Phase 1 (table creation, schema setup)

### 3. openai-sdk
- **Skill ID:** `terminalskills/skills/openai-sdk/SKILL.md`
- **Repo:** Terminal Skills (Cross-tool)
- **Tags:** ai-ml, backend, marketing-content
- **Description:** Integrate OpenAI APIs into applications. Covers embeddings, batching, streaming, function calling, and retry patterns.
- **Covers phases:** Phase 4 (text-embedding-3-small, batch=100, exponential backoff)

---

## 🟡 Recommended Skills

### 4. universal-scraping-architect
- **Skill ID:** `alirezarezvani-claude-skills/engineering/universal-scraping-architect/skills/universal-scraping-architect/SKILL.md`
- **Repo:** Alireza Rezvani · claude-skills (Production teams)
- **Tags:** data, ai-ml, backend, documents
- **Description:** Document extraction, API parsing, and validation-heavy data pipelines using Firecrawl or local Python scripts.
- **Covers phases:** Phase 2 (pdfplumber extraction, cleaning pipeline)

### 5. chromadb
- **Skill ID:** `terminalskills/skills/chromadb/SKILL.md`
- **Repo:** Terminal Skills (Cross-tool)
- **Tags:** data, ai-ml
- **Description:** Store, search, and manage vector embeddings. Use as reference for RAG pipeline and semantic search patterns.
- **Covers phases:** Phase 3+4 (chunking + embedding pipeline patterns)

---

## 🟢 Optional Skills

### 6. pdf-ocr
- **Skill ID:** `terminalskills/skills/pdf-ocr/SKILL.md`
- **Repo:** Terminal Skills (Cross-tool)
- **Tags:** documents, design
- **Description:** Extract text from scanned PDFs using OCR. Only needed if the source PDF is image-based rather than text-based.
- **Covers phases:** Phase 2 (fallback if PDF is scanned)

---

## Installation Commands

```powershell
# pgvector
$req = '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"install_skill","arguments":{"id":"terminalskills/skills/pgvector/SKILL.md","ide":"cursor"}}}' ; $req | skills-mcp

# openai-sdk
$req = '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"install_skill","arguments":{"id":"terminalskills/skills/openai-sdk/SKILL.md","ide":"cursor"}}}' ; $req | skills-mcp

# supabase-automation
$req = '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"install_skill","arguments":{"id":"antigravity-awesome-skills/skills/supabase-automation/SKILL.md","ide":"cursor"}}}' ; $req | skills-mcp
```

---

*Generated during W03 RAG Pipeline build — Stage 2 of the W03 Meta-Prompting Playbook.*
