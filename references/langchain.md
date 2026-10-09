# LangChain.js patterns

Verify package names and imports against current docs before use.

Rule: every LLM and embedding call goes through LangChain (`ChatAnthropic`,
`OpenAIEmbeddings`, retrievers, runnables) so the Langfuse callback traces it.
No raw provider SDK calls in the pipeline. For stores other than pgvector see
`vector-stores.md`; keep the retriever interface and metadata identical.

## Packages

```bash
npm i langchain @langchain/core @langchain/community @langchain/textsplitters \
  @langchain/anthropic @langchain/openai @supabase/supabase-js
```

## Loading

| Source | Loader |
|---|---|
| PDF | `PDFLoader` (`@langchain/community/document_loaders/fs/pdf`) |
| DOCX | `DocxLoader` |
| Web | `CheerioWebBaseLoader` or fetch + own parsing |
| Notion | `NotionAPILoader` |
| CSV / Sheets | `CSVLoader`, or convert rows to text records with headers |

Always normalise metadata after loading:

```ts
docs = docs.map((d, i) => ({
  ...d,
  metadata: {
    doc_id, source: d.metadata.source,
    page: d.metadata.loc?.pageNumber,
    section: inferSection(d.pageContent), // from headings if available
    lang, tenant_id,
  },
}));
```

## Splitting

```ts
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 150 });
const chunks = await splitter.splitDocuments(docs);
chunks.forEach((c, i) => (c.metadata.chunk_index = i));
```

Structure-aware option (Phase 3): split by Markdown headings first
(`RecursiveCharacterTextSplitter.fromLanguage("markdown", …)`), then by size;
prepend the heading path to each chunk ("User Guide > 2. Setup > 2.1 …").

## Embeddings

Default: `OpenAIEmbeddings({ model: "text-embedding-3-small" })` (1536 dims).
For corpora heavy in non-English languages, test a multilingual model (e.g. Cohere
multilingual or Voyage multilingual) in Phase 3. Changing the model means
re-embedding everything and matching the vector dimension in SQL.

## Supabase setup

```sql
create extension if not exists vector;

create table documents (
  id bigserial primary key,
  content text,
  metadata jsonb,
  embedding vector(1536),
  fts tsvector generated always as (to_tsvector('simple', content)) stored
);
create index on documents using hnsw (embedding vector_cosine_ops);
create index on documents using gin (fts);
create index on documents using gin (metadata);

-- vector search used by SupabaseVectorStore
create or replace function match_documents(
  query_embedding vector(1536), match_count int default 5, filter jsonb default '{}'
) returns table (id bigint, content text, metadata jsonb, similarity float)
language sql stable as $$
  select id, content, metadata, 1 - (embedding <=> query_embedding) as similarity
  from documents
  where metadata @> filter
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

Use `'simple'` text search config for mixed-language corpora (no English stemming
mangling words in other languages).

```ts
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

const store = new SupabaseVectorStore(embeddings, {
  client: supabase, tableName: "documents", queryName: "match_documents",
});
await store.addDocuments(chunks);
const retriever = store.asRetriever({ k: 5, filter: { tenant_id } });
```

## Hybrid search (Phase 3) — vector + full-text with RRF

```sql
create or replace function hybrid_search(
  query_text text, query_embedding vector(1536),
  match_count int default 5, filter jsonb default '{}',
  rrf_k int default 60, candidates int default 30
) returns table (id bigint, content text, metadata jsonb, score float)
language sql stable as $$
with vec as (
  select id, row_number() over (order by embedding <=> query_embedding) as r
  from documents where metadata @> filter
  order by embedding <=> query_embedding limit candidates
),
txt as (
  select id, row_number() over (order by ts_rank_cd(fts, websearch_to_tsquery('simple', query_text)) desc) as r
  from documents
  where metadata @> filter and fts @@ websearch_to_tsquery('simple', query_text)
  limit candidates
)
select d.id, d.content, d.metadata,
  coalesce(1.0/(rrf_k+vec.r),0) + coalesce(1.0/(rrf_k+txt.r),0) as score
from vec full outer join txt using (id)
join documents d using (id)
order by score desc limit match_count;
$$;
```

Wrap it in a custom retriever (extend `BaseRetriever`, call `supabase.rpc("hybrid_search", …)`,
return `Document[]`) so it plugs into the graph like any LangChain retriever.

## Reranking (Phase 3)

Retrieve 20–30 candidates, rerank to 5 with Cohere Rerank
(`@langchain/cohere` `CohereRerank`) or Voyage rerank. Measure added latency.

## Access control

Always pass `tenant_id` (or user scope) as a filter, and enable Supabase RLS
on `documents` for any client-side access. Never rely on the prompt for access control.
