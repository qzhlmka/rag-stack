# Building the golden eval set

The golden set decides every later decision. Spend the time here.

## Item schema (Langfuse dataset item)

```json
{
  "input": { "question": "What are the three steps of the onboarding process?" },
  "expectedOutput": {
    "answer": "Short reference answer written by a human expert.",
    "sources": [{ "doc_id": "user-guide-v3", "section": "2.1", "page": 14 }],
    "answerable": true
  },
  "metadata": {
    "type": "factual",
    "difficulty": "easy",
    "language": "en",
    "split": "dev",
    "origin": "real_user"
  }
}
```

For A/V sources, `sources` uses `{ "media_id", "start", "end" }` in seconds
(see `av-pipeline.md`).

## Composition (target mix for 50–100 items)

| Type | Share | Example |
|---|---|---|
| Factual lookup | 30% | single fact from one passage |
| Explanation / how-to | 20% | needs a full section |
| Multi-hop / synthesis | 15% | combine 2+ chunks or docs |
| Comparison | 10% | A vs B |
| Paraphrased / vague | 10% | user wording differs from doc wording |
| Unanswerable | 10–15% | plausible question not covered by sources |

Also cover: every major document/topic, every language used, short and long questions.

## Process

1. **Real questions first.** 20–30 from actual users if they exist.
2. **Claude-assisted drafting.** For a sample of chunks across all docs, have
   Claude generate 1–2 questions per chunk with answer and source reference,
   plus paraphrased variants. Prompt it to avoid copying the chunk's wording.
3. **Unanswerables.** Generate questions that sound in-domain but are not
   covered. Verify by searching the corpus.
4. **Human review (mandatory).** A domain expert checks each item:
   question realistic? answer correct and complete? source correct?
   Reject anything ambiguous.
5. **Upload** to Langfuse (see `langfuse.md`). Version names: `-golden-v1`, `-v2`…
6. **Freeze.** Do not edit v1 after experiments start; create v2 instead so
   results stay comparable.

## Pitfalls

- Questions copied from chunk text inflate retrieval scores. Paraphrase.
- Source references at document level only make Recall meaningless when docs
  are long. Reference section/page or chunk-level spans.
- Re-chunking changes chunk IDs. Reference stable locations
  (doc_id + page/section, or timestamps), and map retrieved chunks to them
  at eval time.

## Validate before every upload

`npm run golden:check -- golden/<file>.jsonl [--poc]` — schema, TODOs,
duplicates, `doc_id`s that no longer exist in `data/`, docs with no items,
type/language mix, test split. Fix all errors before `golden:upload`.

## Maintenance (Phase 8)

- New versions come from reviewed production failures (`review:report` →
  `golden/candidates-<date>.jsonl`) plus questions for new documents.
- Monthly: build `-v{n+1}` = previous version + reviewed candidates − items
  whose source was removed. Run evals on both versions when switching.
- Keep at least 10% unanswerable and keep the type mix close to the table above
  as the set grows; real-user share should grow over time.
- See `review-loop.md` for the full cadence.
