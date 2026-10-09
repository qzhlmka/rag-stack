---
name: "rag-stack"
description: Mandatory standard for building RAG systems with LangChain, LangGraph and Langfuse on Supabase pgvector, using a gated, eval-driven workflow (intake → golden eval set → pilot ingestion test → retrieval tuning → full ingestion → generation → orchestration → production → periodic annotation review). Use this skill WHENEVER the user asks to build, plan, design, scaffold, rebuild, debug, evaluate, monitor or extend any RAG system, retrieval pipeline, knowledge-base chatbot, AI tutor, document Q&A, semantic/vector search, embeddings pipeline, chat-quality review or annotation workflow, or AI assistant that answers from documents, transcripts, recordings or videos — even if LangChain, LangGraph, Langfuse or "RAG" are not mentioned.
---

# RAG Stack Standard

Build every RAG system the same way: clarify first, measure before building,
test on a pilot before embedding everything, and never advance a phase until
its gate passes. Langfuse is where everything is observed: traces, prompts,
datasets, experiments, scores, and human annotation.

## Non-negotiable stack

| Layer | Tool | Why it matters |
|---|---|---|
| Loading, splitting, embeddings, retrievers, LLM calls | **LangChain.js** (`@langchain/*`) | Every LLM/embedding call goes through LangChain so the Langfuse callback traces it |
| Orchestration — every runtime flow, even the minimal one | **LangGraph.js** | One graph shape from Phase 5 to production; nodes are traced spans |
| Tracing, prompt management, datasets, experiments, scores, annotation queues | **Langfuse** (JS/TS SDK v5) | Single place to track performance and review chats |
| Vector store | **Supabase pgvector** by default; larger corpora → options in `references/vector-stores.md` | Hybrid search, filters and access control in one Postgres |
| API / runtime / deploy | **Node.js + TypeScript + Fastify** on **Railway** | |
| LLM | Anthropic Claude via `@langchain/anthropic` (model ID from env) | |

Never substitute LlamaIndex, Haystack, LangSmith, a raw provider SDK, or a
hand-rolled framework unless the user explicitly asks. Never pick a vector
store other than pgvector on your own: if the size check says the corpus is
large, present the options from `references/vector-stores.md` and let the
user decide. If the user asks for Python, use the Python equivalents.

APIs in this stack change fast. Before writing code, check current docs for
package versions and import paths. Treat code in references/ as patterns.

## Langfuse is the source of truth

- **Prompts:** every prompt — answer, graders, judges — lives in Langfuse
  prompt management. No prompt text in code and no local fallback: a missing
  prompt fails loudly. Bootstrap with `npm run prompts:seed`. A prompt change
  is an experiment: label the candidate `staging`, eval with
  `PROMPT_LABEL=staging`, promote to `production` only if it wins.
- **Performance:** every eval is a Langfuse dataset run; every production chat
  is a trace with `sessionId`, `userId`, tags, and its prompt version linked.
- **Annotation:** AI judges score production chats; humans review a queue in
  Langfuse; both are compared periodically (`references/review-loop.md`).
- One-time setup per project: `npm run langfuse:setup` (score configs,
  annotation queue, prompt check). Details: `references/langfuse.md`.

## New projects

Scaffold from the rag-stack template repo layout when starting from scratch:
`src/` (config, clients, prompts, judges, retriever, ingest, graph, server),
`evals/`, `scripts/` (setup, seed, review loop), `prompts/`,
`supabase/migrations/`, `golden/`, `pilot-docs.txt`, `RAG_STATUS.md`. If the
repo already exists, work inside it.

## Session start protocol (every session)

1. Look for `RAG_STATUS.md` in the project root.
   - Missing → create it from `templates/RAG_STATUS.md` and start Phase 0.
   - Present → read it.
2. Tell the user in 3 lines max: current phase, latest metrics vs targets, next step.
   If a periodic review is due (see "Review cadence" in RAG_STATUS.md), say so on line 3.
3. Only do work that belongs to the current phase.
4. After any experiment, review or decision, update `RAG_STATUS.md` before ending.

If you cannot read/write files (e.g. plain chat), ask the user to paste their
current RAG_STATUS.md, and give them the updated version at the end.

## Phase 0 — Intake (MANDATORY)

Do not write code, schemas, SQL or eval sets until the Intake Brief is
confirmed. Ask in rounds of max 3 questions (use the ask_user_input tool when
available). Question bank and brief template: `references/intake.md`.

- Round 1 — Goal: end goal, users + channel, success metric
- Round 2 — How it works: interaction type, single vs multi-turn, answer rules
- Round 3 — Data: source types, volume + freshness, languages, access control, constraints
- Round 4 — Operations: who reviews chats, review cadence, expected traffic

### Routing (decide after Round 3)

| Sources include | Route |
|---|---|
| Audio or video | **STOP the standard flow.** Say: "This needs the audio/video pipeline — switching to the A/V guideline." Follow `references/av-pipeline.md` for Phases 1–4. Phases 5–8 continue as normal. |
| Scanned PDFs, images, photos of documents | `references/ocr-pipeline.md` for ingestion, then the standard flow. |
| Text only (PDF/DOCX/web/MD/sheets) | Standard flow. |

Mixed sources → apply every matching route. Write the route into the brief.

Gate: user explicitly confirms the Intake Brief written to RAG_STATUS.md.

## Phases and gates

Detailed steps per phase: `references/phases.md`.

| # | Phase | Gate to advance |
|---|---|---|
| 0 | Intake | Intake Brief confirmed by user |
| 1 | Golden eval set | ≥50 items (≥30 POC), human-reviewed, `golden:check` passes, uploaded as a Langfuse dataset. No embedding needed — built from the raw docs. |
| 2 | Pilot ingestion + baseline | `ingest:check` clean on the pilot docs (no empty/garbled/duplicate pages, chunks read well); pilot embedded; baseline retrieval run logged. No generation code. |
| 3 | Retrieval tuning (on pilot) | Recall@5 ≥ 0.85, MRR ≥ 0.70 on pilot-scoped golden items |
| 4 | Full ingestion + scale check | `ingest:check` clean on the full corpus; vector store decided (pgvector if small, else user-chosen option); full corpus embedded; full-scope retrieval still meets targets (drop ≤ 0.05 vs pilot) |
| 5 | Generation | Faithfulness ≥ 0.90, Correctness ≥ 0.80, Correct refusal ≥ 0.90 |
| 6 | LangGraph orchestration | Every added node justified by an eval failure; no regression |
| 7 | Production | Latency + cost budgets met; traces have session/user IDs; `/feedback` wired; `langfuse:setup` done |
| 8 | Monitor, annotate, improve | Ongoing cadence — see below |

Targets are defaults. Use the targets agreed in the Intake Brief if set.

## Phase 8 — Periodic review (ongoing)

Full procedure: `references/review-loop.md`. Default cadence (adjust in the brief):

| When | Do | Command |
|---|---|---|
| Daily (cron) | AI judges annotate recent chats | `npm run review:judge` |
| Weekly | Build the human queue (👎 + judge-flagged + random judge-passed), humans annotate in Langfuse | `npm run review:queue` |
| Weekly | Report: judge-vs-human agreement, failure causes, golden candidates | `npm run review:report` |
| Monthly | Golden set health + new version from candidates; full regression run | `npm run golden:check`, `golden:upload`, evals |
| Before every change | Full regression; block if any primary metric drops > 0.02 | evals |

If judge-vs-human agreement falls below 85%, fix the judge prompt in Langfuse
before trusting AI scores again. Log every review as a row in RAG_STATUS.md.

## Hard rules

- No embedding of the full corpus before the Phase 3 gate passes on the pilot.
- No generation code before Phase 4 passes.
- No LangGraph nodes beyond `retrieve → generate` without an eval failure that justifies them.
- No prompt text in code; prompts only in Langfuse.
- One variable per experiment. Name runs `p{phase}-{change}-{yyyymmdd}`.
- Every experiment is a Langfuse dataset run, not a local-only script output.
- After every experiment, show a table: change, metrics, delta vs baseline and vs best, verdict (keep/revert).
- Gate fails → propose the next single experiment. Do not advance.
- Golden set versions are frozen once experiments start; changes go into `-v2`, `-v3`…
- If the user wants to skip a phase or gate: state the risk once in one
  sentence, then follow their decision and log it under "Overrides".
- Once the golden set exceeds 80 items, hold out 20% as a test split and report both.

## Reference map

| Need | Read |
|---|---|
| Intake questions, brief template | `references/intake.md` |
| Step-by-step for each phase | `references/phases.md` |
| Building and maintaining the golden set | `references/golden-set.md` |
| Metric definitions, judge prompts, eval code | `references/evals.md` |
| Loaders, splitters, embeddings, Supabase store, hybrid search, reranking | `references/langchain.md` |
| pgvector limits and options for large corpora | `references/vector-stores.md` |
| Graph patterns and when to add nodes | `references/langgraph.md` |
| Tracing, prompts, datasets, experiments, scores, annotation setup | `references/langfuse.md` |
| Periodic annotation and golden-set review loop | `references/review-loop.md` |
| Audio/video sources | `references/av-pipeline.md` |
| Scanned docs/images | `references/ocr-pipeline.md` |
| Status file | `templates/RAG_STATUS.md` |
| Retrieval eval runner | `templates/eval-runner.ts` |
