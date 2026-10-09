# Review loop — AI annotation, human annotation, golden set (Phase 8)

Goal: know every week how the RAG is doing on real chats, check that the AI
judges can be trusted, and keep the golden set growing from real failures.
Everything lives in Langfuse; scripts only automate the routine parts.

## Who annotates what

| Score | Written by | Source in Langfuse | Purpose |
|---|---|---|---|
| `user_feedback` (1/0) | Users via `POST /feedback` | API | What users think |
| `judge_faithfulness`, `judge_relevance` (0/0.5/1 + reason) | AI judges via `review:judge` (prompts in Langfuse) | API | Cheap coverage of many chats |
| `faithfulness`, `correctness` (0–1) | Humans in the annotation queue | ANNOTATION | Ground truth |
| `failure_category` | Humans | ANNOTATION | What to fix next |
| `add_to_golden` | Humans | ANNOTATION | Feeds the next golden version |

Score configs and the `chat-review` queue are created by `npm run langfuse:setup`.
Failure categories: none · retrieval_miss · wrong_source · chunk_incomplete ·
hallucination · should_have_refused · wrongly_refused · bad_source_text · out_of_scope.

## Daily — AI annotation

`npm run review:judge -- --days 1` (schedule it). Judges every unjudged
production chat with the Langfuse-managed `judge-faithfulness` and
`judge-relevance` prompts and writes the scores + reasons onto the trace.

## Weekly — human annotation (30–60 min)

1. `npm run review:queue -- --days 7 --n 40` adds to `chat-review`:
   all 👎 chats, all judge-flagged chats (< 1), and a random ~25% of
   judge-passed chats. The random slice is what tells you if the judge misses problems.
2. Reviewer opens Langfuse → Annotation Queues → `chat-review`. For each trace:
   read the question, the retrieved chunks (retrieve span) and the answer, then
   score `faithfulness`, `correctness`, `failure_category`, and tick
   `add_to_golden` for real failures worth testing forever.
3. `npm run review:report -- --days 7`:
   - judge-vs-human agreement (exact and pass/fail)
   - failure-cause tally
   - golden candidates → `golden/candidates-<date>.jsonl`
   - a row to paste into RAG_STATUS.md → Review log
4. Act on the result:
   - Top failure cause → next one-variable experiment (map in `phases.md` Phase 3/6).
   - Pass/fail agreement < 85% (with ≥20 pairs) → judge is unreliable. Read the
     disagreements, tighten the judge prompt in Langfuse (`staging` → eval → `production`),
     and do not use AI scores for decisions until agreement recovers.

## Monthly — golden set and regression

1. Finish candidates: write the correct reference answer, verify sources
   (physical PDF page), set type and language, remove TODOs. Drop weak ones.
2. Merge into a new file `golden/<project>-golden-v{n+1}.jsonl` (copy the previous
   version + reviewed candidates). Never edit a version already used in experiments.
3. `npm run golden:check -- golden/<project>-golden-v{n+1}.jsonl`:
   stale doc_ids (renamed/removed files), docs with no coverage, type mix,
   language mix, duplicates, test split.
4. Upload as the new dataset, then run retrieval + generation evals on both
   the old and new versions. Record both in RAG_STATUS.md.
5. Retire items whose source was removed from the corpus (only in the new version).

## Triggers outside the cadence

| Event | Action |
|---|---|
| Spike in 👎 or judge-flagged rate | Run the weekly loop now |
| New or changed documents | `ingest:check` → re-ingest → add golden items for new docs → regression |
| Prompt/model/retrieval change | Full regression before shipping |
| New user group, language or topic | Add real questions from it to the next golden version |

## What to log (RAG_STATUS.md → Review log)

| Date | Reviewed | Human faith. | Human correct. | 👍 rate | Judge agreement | Top failure | Golden candidates | Action |
