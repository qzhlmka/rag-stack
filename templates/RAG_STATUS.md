# RAG Status — <Project name>

Current phase: 0 — Intake
Route: <standard | OCR | A/V | mixed>
Last updated: <yyyy-mm-dd>

## Intake Brief (confirmed: no)
- End goal:
- Users / channel:
- Success metric:
- Interaction type:
- Conversation: single-turn | multi-turn
- Answer rules: citations [y/n], refusal [y/n], format
- Sources / modalities:
- Volume / freshness:
- Languages:
- Access control:
- Constraints: latency , cost/query , privacy
- Reviewers / cadence: <who> — AI judge daily, human queue weekly (40), golden refresh monthly
- Traffic / growth:
- Targets: Recall@5 0.85 | MRR 0.70 | Faithfulness 0.90 | Correctness 0.80 | Refusal 0.90

## Golden set
| Version | Items | Reviewed | Mix (fact/explain/multi/compare/vague/unans.) | Test split | Uploaded |
|---|---|---|---|---|---|
| <n>-golden-v1 | 0 | no | | none | no |

## Ingestion
- Pilot docs (pilot-docs.txt): <n files, which types> — ingest:check: <clean | issues>
- Full corpus: <n files, n chunks> — ingest:check: <clean | issues>
- Vector store: pgvector (Supabase) | <option chosen + reason, if large>

## Current pipeline config
- Loader(s):
- Chunking:
- Embeddings:
- Retrieval: vector | hybrid | + rerank, k=
- LLM (generate / judge):
- Prompts (Langfuse, production): rag-answer v_ | judge-* v_
- Graph nodes:

## Experiments
| Run | Scope | Change | Recall@5 | MRR | P@5 | Faith. | Correct | Refusal | Verdict |
|---|---|---|---|---|---|---|---|---|---|

## Node justifications (Phase 6)
| Node | Failure it fixes | Metric before → after |
|---|---|---|

## Review cadence (Phase 8)
- AI judge: daily (`review:judge`) — last run:
- Human queue: weekly (`review:queue` → annotate → `review:report`) — next due:
- Golden refresh + regression: monthly — next due:

## Review log
| Date | Reviewed | Human faith. | Human correct. | 👍 rate | Judge agreement | Top failure | Golden candidates | Action |
|---|---|---|---|---|---|---|---|---|

## Overrides
<any skipped phase/gate, who decided, risk noted>

## Next step
<single next action>
