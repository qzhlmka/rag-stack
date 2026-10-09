# Vector store choice

Default: **Supabase pgvector**. Only consider anything else when the size
check (`npm run ingest:check`, Phase 4) or the Phase 7 load test says so.
Never switch on your own — present the options, the user decides, and the
decision + reason goes into RAG_STATUS.md.

## Sizing rule of thumb

| Chunks (full corpus, incl. 12-month growth) | Recommendation |
|---|---|
| < ~1M | **pgvector on Supabase.** Small pool. Hybrid search, filters, RLS and app data in one Postgres. |
| ~1M – 10M | **Large.** Option A (scale pgvector) usually first; Option B/C if ops or latency are a concern. |
| > ~10M, or sustained hundreds of retrieval QPS | **Very large.** Dedicated store (Option B/C/D). |

Memory guide: each vector ≈ dims × 4 bytes (1536 dims ≈ 6 KB); the HNSW index
needs roughly the same again and should fit in RAM for fast queries.
1M chunks × 1536 dims ≈ 6 GB vectors + index. `halfvec` roughly halves it.

Also move up a tier if Phase 7 shows retrieval p95 > ~200 ms after
reasonable tuning (bigger compute, index params).

## Options for large corpora

| | A. Scale pgvector | B. Qdrant | C. Pinecone (serverless) | D. Weaviate / Milvus (Zilliz) |
|---|---|---|---|---|
| Change to code | None (SQL + compute) | New retriever | New retriever | New retriever |
| Hybrid search | Postgres FTS + RRF (already built) | Native sparse + dense | Sparse-dense vectors; needs a sparse encoder | Weaviate: built-in BM25 hybrid; Milvus: sparse + dense |
| Metadata filters | SQL/JSONB | Strong, payload indexes | Supported, more limited syntax | Supported |
| Multi-tenancy | RLS + tenant filter / partitions | Payload filter or collection per tenant | Namespaces | Native tenants (Weaviate) / partitions |
| Ops | Supabase managed | Cloud or self-host | Fully managed | Cloud or self-host |
| Joins with app data | Same DB | Separate | Separate | Separate |
| LangChain.js | `SupabaseVectorStore` / custom retriever | `@langchain/qdrant` | `@langchain/pinecone` | `@langchain/weaviate` / community Milvus |
| Good when | You want one database and can pay for compute | Need hybrid + filters at scale, open-source | Want zero ops, elastic scale | Want native hybrid (Weaviate) or very large scale (Milvus) |

Option A levers, cheapest first: larger Supabase compute; `halfvec` storage;
HNSW tuning (`m`, `ef_construction`, query `ef_search`); partition by tenant
or category; read replica for retrieval; pgvectorscale-style extensions where
your host supports them. Verify current Supabase docs for what is available.

Verify package names and pricing in current docs before recommending.

## How to present it

1. Show: chunk count now and in 12 months, vector storage estimate, expected peak QPS, latency budget.
2. Recommend one option with a one-line reason, and list one alternative.
3. Ask the user to choose. Record in RAG_STATUS.md → "Vector store".

## Migrating without breaking evals

1. Implement the new store as a LangChain `BaseRetriever` exposing the same
   metadata (`doc_id`, `page`/`section` or `media_id`/`start`/`end`, `tenant_id`).
2. Re-ingest the full corpus into it (`ingest.ts` writes through the new store).
3. Run the full retrieval and generation evals on the same golden version.
4. Switch only if metrics hold (drop ≤ 0.02) and latency/cost targets are met.
