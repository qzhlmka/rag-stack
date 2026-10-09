# Evals — metrics, judges, reporting

## Retrieval metrics (Phases 2–4, and every regression run)

A retrieved chunk is a **hit** if it matches an expected source:
same `doc_id` and overlapping `page`/`section` (text), or temporal IoU ≥ 0.5
with an expected segment (A/V, see `av-pipeline.md`).

| Metric | Definition | Use |
|---|---|---|
| Hit@k | 1 if any of top-k is a hit | quick sanity |
| Recall@k | expected sources found in top-k ÷ total expected sources | **primary** |
| MRR | mean of 1 / rank of first hit (0 if none) | ranking quality |
| Context precision@k | hits in top-k ÷ k | noise sent to the LLM |

Unanswerable items are excluded from retrieval metrics.

```ts
type Src = { doc_id: string; page?: number; section?: string };

const isHit = (r: Src, e: Src) =>
  r.doc_id === e.doc_id &&
  (e.page === undefined || r.page === e.page) &&
  (e.section === undefined || r.section?.startsWith(e.section));

export function retrievalScores(retrieved: Src[], expected: Src[], k = 5) {
  const top = retrieved.slice(0, k);
  const found = expected.filter(e => top.some(r => isHit(r, e))).length;
  const firstRank = retrieved.findIndex(r => expected.some(e => isHit(r, e)));
  return {
    hit_at_k: found > 0 ? 1 : 0,
    recall_at_k: expected.length ? found / expected.length : 0,
    mrr: firstRank >= 0 ? 1 / (firstRank + 1) : 0,
    precision_at_k: top.filter(r => expected.some(e => isHit(r, e))).length / k,
  };
}
```

## Generation metrics (Phases 5–8)

LLM-as-judge with a different, cheaper model than the generator where
possible. Each judge returns JSON `{ "score": 0|0.5|1, "reason": "..." }`.

| Metric | Question the judge answers |
|---|---|
| Faithfulness | Is every claim in the answer supported by the retrieved context? |
| Answer correctness | Does the answer match the reference answer in substance? |
| Citation accuracy | Do the cited sources actually contain the cited claims? |
| Correct refusal | (unanswerable items) Did it decline instead of inventing? |
| Answer relevance | Does it address the question asked? |

### Judge prompts

Faithfulness
```
You are grading a RAG answer for faithfulness.
CONTEXT:
{{context}}
ANSWER:
{{answer}}
List each factual claim in ANSWER. For each, decide if CONTEXT supports it.
Score 1 if all claims are supported, 0.5 if minor unsupported details, 0 if any
key claim is unsupported or contradicted.
Return only JSON: {"score": <0|0.5|1>, "reason": "<one sentence>"}
```

Answer correctness
```
QUESTION: {{question}}
REFERENCE ANSWER: {{reference}}
CANDIDATE ANSWER: {{answer}}
Score 1 if the candidate contains the key points of the reference with no
contradictions, 0.5 if partially correct, 0 if wrong or missing key points.
Ignore style and length.
Return only JSON: {"score": <0|0.5|1>, "reason": "<one sentence>"}
```

Correct refusal
```
The QUESTION cannot be answered from the knowledge base.
QUESTION: {{question}}
ANSWER: {{answer}}
Score 1 if the answer clearly says it cannot find this in the sources (it may
suggest next steps). Score 0 if it gives a substantive answer.
Return only JSON: {"score": <0|1>, "reason": "<one sentence>"}
```

Calibrate judges once: hand-grade 20 items, compare with judge scores.
If agreement < 85%, tighten the judge prompt before trusting it.

Judge prompts live only in Langfuse prompt management (`judge-faithfulness`,
`judge-correctness`, `judge-refusal`, `judge-relevance`), seeded from
`prompts/*.json`. The same judges score production chats in Phase 8
(`review:judge`) — re-check their agreement with humans every week there.

Pilot vs full scope: in Phases 2–3 run retrieval evals with `--pilot` (only
items whose sources are in `pilot-docs.txt`); from Phase 4 on, run full scope.

## Reporting format (after every experiment)

```markdown
| Run | Change | Recall@5 | MRR | P@5 | Faith. | Correct | Refusal | Δ vs best | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| p3-hybrid-20261008 | + FTS + RRF | 0.79 | 0.66 | 0.41 | – | – | – | +0.11 R@5 | keep |
```

Then: top 3 failure patterns in the remaining misses, and the proposed next
single experiment.

## Regression rule

Before shipping any change in Phases 7–8: run the full golden set.
Block if any primary metric drops by more than 0.02 vs the current production run.
