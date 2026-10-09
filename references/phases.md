# Phases 1–8 — Steps and gates

Each phase lists: steps, deliverables, gate. Update RAG_STATUS.md at the end
of every phase and after every experiment. Commands refer to the rag-stack
template repo.

---

## Phase 1 — Golden eval set (no embedding)

The golden set is the answer key. It is written from the raw documents, not
from the index, so it does not depend on chunking or embeddings.

Steps
1. Put the source files in `data/` with their **final filenames** — `doc_id` =
   filename without extension, and every golden reference depends on it.
2. Collect 20–30 real user questions (logs, support chats, teachers, consultants).
3. Draft the rest from the documents (Claude reads the files directly; see `golden-set.md`).
4. Label each item: question, expected answer, sources (`doc_id` + physical PDF
   page, or Markdown section, or media time range), type, language.
5. Human review every item. Remove ambiguous or wrong ones.
6. `npm run golden:check -- golden/<project>-golden-v1.jsonl` until clean.
7. `npm run golden:upload -- golden/<project>-golden-v1.jsonl <project>-golden-v1`.
8. If >80 items, tag 20% as `split: test` (held out).

Gate: ≥50 items (≥30 POC), reviewed, `golden:check` passes, uploaded.

---

## Phase 2 — Pilot ingestion + baseline retrieval

Test ingestion on a representative sample before paying to embed everything.
Problems found here (scanned pages, garbled text, bad chunks) are cheap to fix.

Steps
1. Choose the pilot in `pilot-docs.txt`: ~10–20% of the corpus covering every
   doc type, language and layout (e.g. one document per category, one long
   manual chapter, one table-heavy file, one scanned doc). Make sure ≥20 golden items
   point at pilot docs; add pilot docs until they do.
2. **Pre-embedding check:** `npm run ingest:check -- --pilot`. No API calls.
   - Fix every problem: NO TEXT pages → OCR route; GARBLED → different loader
     or OCR; DUPLICATE → remove; EMPTY files → fix or drop.
   - Read the 10 sample chunks in `reports/`: clean? complete sentences?
     maths/tables intact? If not, fix extraction before going further.
3. Embed the pilot: `npm run ingest -- --pilot --reset`.
   Simplest setup: RecursiveCharacterTextSplitter 1000/150, default embedding
   model, pgvector cosine top-k.
4. Baseline: `npm run eval:retrieval -- <dataset> p2-baseline-<date> --pilot`.
   Retrieval only — no LLM answer. Traces show retrieved chunks per item.

Gate: `ingest:check` clean on the pilot; baseline row recorded.
Do not write generation code. Do not embed the full corpus.

---

## Phase 3 — Retrieval tuning (on the pilot)

One variable per run, roughly in this order. Keep a change only if it improves
the primary metric without hurting the others by more than 0.02. Chunking or
embedding changes → `npm run ingest -- --pilot --reset` before the eval.

1. **Inspect failures first.** Worst 10 items (printout + Langfuse traces). Classify:
   chunk boundary cut the answer · wrong doc ranked higher · vocabulary
   mismatch · answer spread over chunks · bad source text (OCR/transcript).
2. **Chunking:** size/overlap sweep (300/50, 500/100, 800/150); structure-aware
   splitting by headings; parent-child (retrieve small, return parent).
3. **Metadata filters:** by category, year, tenant, doc type.
4. **Hybrid search:** `RETRIEVAL_MODE=hybrid` (pgvector + full-text, RRF).
   Usually the biggest win for names, codes, and mixed-language text.
5. **Reranker:** retrieve top 20–30, rerank to top 5.
6. **Embedding model:** try a multilingual model if non-English content underperforms.
7. **Query transformation:** rewriting, multi-query, HyDE — only if failures show vocabulary mismatch.

Gate: Recall@5 ≥ 0.85, MRR ≥ 0.70 with `--pilot` (and on the test split if it exists).

---

## Phase 4 — Full ingestion + scale check

Steps
1. `npm run ingest:check` on the full corpus. Fix every problem as in Phase 2.
2. Read the **Vector store** line and chunk count in the report:
   - Small pool (< ~1M chunks) → stay on Supabase pgvector.
   - Larger → present the options in `vector-stores.md` to the user, record
     their choice and reason in RAG_STATUS.md. Do not choose for them.
3. If the store changes: implement it as a LangChain retriever with the same
   interface (`src/retriever.ts`) so graph and evals stay unchanged.
4. Embed everything with the winning Phase 3 config: `npm run ingest -- --reset`.
5. Full-scope eval: `npm run eval:retrieval -- <dataset> p4-full-<date>` (no `--pilot`).
   More documents = more distractors; a small drop is normal.
6. If a golden doc was not in the pilot and now fails, inspect it like Phase 3 step 1.

Gate: ingest check clean; store decided; full-scope Recall@5 / MRR meet
targets and are within 0.05 of the pilot result. If not, run Phase 3
experiments on the full corpus.

---

## Phase 5 — Generation

Steps
1. `npm run prompts:seed` (once) → creates `rag-answer` and judge prompts in
   Langfuse. From now on edit prompts only in Langfuse.
   Answer prompt must: answer only from context, cite sources, refuse when not found, set format.
2. Minimal LangGraph: `retrieve → generate → END` (`src/graph.ts`).
3. Calibrate judges: hand-grade 20 items, compare with judge scores; ≥85%
   agreement before trusting them (`evals.md`).
4. `npm run eval:generation -- <dataset> p5-prompt-v1-<date>`.
5. Iterate: prompt version (via `staging` label + `PROMPT_LABEL=staging`),
   then context formatting, then model choice. One change per run.

Gate: Faithfulness ≥ 0.90, Correctness ≥ 0.80, Correct refusal ≥ 0.90.

---

## Phase 6 — LangGraph orchestration

Add a node only when evals show a failure mode it fixes:

| Failure seen in evals | Node to add |
|---|---|
| Irrelevant chunks reach the LLM | `grade_documents` |
| Recall drops on vague/short questions | `rewrite_query` loop (max 2) |
| Hallucination on low-context items | `check_grounding` → regenerate or refuse |
| Multi-turn follow-ups fail ("what about the second one?") | `condense_question` using chat history |
| Different question types need different sources | `route_question` |
| Answer needs live data (DB, API) | tool node |

Every new prompt the node needs goes into Langfuse first (`prompts/*.json` + seed).
After each node: re-run the full eval. Revert if no improvement or regression.

Gate: every node justified in RAG_STATUS.md; no metric regression.

---

## Phase 7 — Production

Steps
1. Fastify `POST /ask` (returns `traceId`), `POST /feedback` (👍/👎 → `user_feedback` score).
   Stream tokens if the UI needs it.
2. Langfuse callback with `sessionId`, `userId`, tags `ask`, `env:<NODE_ENV>`, `v<version>`.
3. `npm run langfuse:setup` → score configs + `chat-review` annotation queue.
4. Enforce access control in retrieval (tenant filter in SQL, RLS in Supabase).
5. Measure p50/p95 latency and cost per query on 50 golden items; load-test at 2–3× expected peak.
6. Reliability: ≥2 replicas with `/health`, retries + timeout + fallback on the
   LLM call, Supabase connection pooler, per-user rate limit.
7. Deploy on Railway with env vars from `.env.example` (`NODE_ENV=production`).
8. Schedule `npm run review:judge` daily (Railway cron or similar).

Gate: latency and cost budgets met; traces show session/user IDs and prompt
versions; feedback reaches Langfuse; setup done.

---

## Phase 8 — Monitor, annotate, improve (ongoing)

Follow `review-loop.md`. Summary:
1. Daily: AI judges annotate new chats (`review:judge`).
2. Weekly: `review:queue` → humans annotate in Langfuse → `review:report`
   (judge agreement, failure causes, golden candidates). Log a row in RAG_STATUS.md.
3. Fix the top failure cause with a normal one-variable experiment.
4. Monthly: finish candidates → `golden:check` → upload as the next version
   → full regression on old and new versions.
5. Before any change ships: full regression; block if any primary metric drops > 0.02.
6. Corpus changes: `ingest:check` on new files, re-ingest, regression run.
