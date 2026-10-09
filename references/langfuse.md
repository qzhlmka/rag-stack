# Langfuse patterns (JS/TS SDK v5)

Verify against https://langfuse.com/docs and the JS reference before use.

## Setup

```bash
npm i @langfuse/client @langfuse/langchain @langfuse/otel @opentelemetry/sdk-node
```

`.env`
```
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

`instrumentation.ts` (import first in the app entry point)
```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

export const sdk = new NodeSDK({ spanProcessors: [new LangfuseSpanProcessor()] });
sdk.start();
```

Client
```ts
import { LangfuseClient } from "@langfuse/client";
export const langfuse = new LangfuseClient();
```

## Tracing LangChain / LangGraph

```ts
import { CallbackHandler } from "@langfuse/langchain";

const handler = new CallbackHandler({ sessionId, userId, tags: [env, version] });
await graph.invoke({ question }, { callbacks: [handler] });
```

Every production call must set `sessionId` and `userId`.
Flush before short-lived scripts exit (`await sdk.shutdown()`).

## Prompt management

- All runtime prompts and judge prompts live in Langfuse: `rag-answer`,
  `grade-documents`, `rewrite-query`, `judge-faithfulness`, …
- Fetch by name; use labels (`production`, `staging`) to promote versions.
  The repo reads the label from `PROMPT_LABEL` (default `production`).
- No hardcoded fallback prompts in code: a missing prompt must fail loudly.
  Bootstrap new prompts with `npm run prompts:seed` (from `prompts/*.json`).
- Link each generation to its prompt version so traces show which version ran:

```ts
const lfPrompt = await langfuse.prompt.get("rag-answer", { type: "chat", label: "production" });
const template = ChatPromptTemplate.fromMessages(lfPrompt.getLangchainPrompt())
  .withConfig({ metadata: { langfusePrompt: lfPrompt } });
const answer = await template.pipe(llm).invoke({ question, context }, { callbacks: [handler] });
```

```ts
const prompt = await langfuse.prompt.get("rag-answer", { type: "chat", label: "production" });
const messages = prompt.compile({ question, context });
```

## Datasets (golden set)

```ts
await langfuse.api.datasets.create({ name: "myproject-golden-v1" });

for (const item of items) {
  await langfuse.api.datasetItems.create({
    datasetName: "myproject-golden-v1",
    input: item.input,
    expectedOutput: item.expectedOutput,
    metadata: item.metadata,
  });
}
```

## One-time project setup

```bash
npm run prompts:seed     # create prompts from prompts/*.json (skip existing)
npm run langfuse:setup   # score configs + chat-review annotation queue + prompt check
```

## Tracking performance — where to look

| Question | Langfuse view |
|---|---|
| Is this change better? | Datasets → `<dataset>` → Runs → compare runs side by side |
| Why did item X fail? | Run → item → trace → `retrieve` span (chunks) and `generate` span (prompt version, context, answer) |
| How is production doing? | Dashboards: trace count, p95 latency, cost, `user_feedback`, `judge_*` and human scores over time |
| Did a prompt version change quality? | Filter traces / scores by prompt name + version |
| What do users dislike? | Traces filtered by `user_feedback = 0` |

Build one dashboard per project with: daily chats, p95 latency, cost per chat,
👍 rate, mean `judge_faithfulness`, mean human `correctness`.

## Experiments (every phase 2+ run)

```ts
const dataset = await langfuse.dataset.get("myproject-golden-v1");

const result = await dataset.runExperiment({
  name: "p3-hybrid",
  runName: "p3-hybrid-20261008",
  description: "pgvector + FTS with RRF, k=5",
  metadata: { chunk: "800/150", embed: "text-embedding-3-small", k: 5 },
  task: async (item) => runRetrieval(item.input.question),
  evaluators: [recallEvaluator, mrrEvaluator],          // item-level
  runEvaluators: [averageEvaluator("recall_at_5")],     // run-level
});
```

Item evaluator shape:
```ts
const recallEvaluator = async ({ output, expectedOutput }) => ({
  name: "recall_at_5",
  value: retrievalScores(output.sources, expectedOutput.sources, 5).recall_at_k,
});
```

`dataset.runExperiment()` always runs every item. To run a subset (e.g.
retrieval evals that exclude unanswerables), use
`langfuse.experiment.run({ data: dataset.items.filter(...), ... })` — results
still link to the dataset run.

Compare runs side by side in the Langfuse UI (Datasets → Runs).

## Scores

- User feedback: `langfuse.score.create({ traceId, name: "user_feedback", value: 1 | 0, comment })`
- Online LLM-as-judge: configure evaluators in the Langfuse UI on a sample of
  production traces (e.g. 10%) for faithfulness and relevance.

## Annotation (Phase 8)

- Score configs (created by `langfuse:setup`): `faithfulness`, `correctness`
  (numeric 0–1), `failure_category` (categorical), `add_to_golden` (boolean).
- Annotation queue `chat-review`, filled weekly by `review:queue`.
- API: `langfuse.api.annotationQueues.createQueueItem(queueId, { objectId: traceId, objectType: "TRACE" })`,
  `langfuse.api.scores.getMany({ name, source: "ANNOTATION", fromTimestamp })`.
- AI judge scores on production traces use distinct names (`judge_faithfulness`,
  `judge_relevance`) so they can be compared with human scores.

Full procedure: `review-loop.md`.
