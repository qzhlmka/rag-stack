# LangGraph.js patterns

Verify imports against current `@langchain/langgraph` docs before use.

## Principle

Start minimal (`retrieve → generate`). Add nodes only when Phase 5/6 evals
show the failure they fix (see the table in `phases.md`, Phase 6).
Every node's prompt lives in Langfuse and is linked to its generation
(`getChatPrompt(name).pipe(llm)` in the template repo).

## State

```ts
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import type { Document } from "@langchain/core/documents";
import type { BaseMessage } from "@langchain/core/messages";

export const RagState = Annotation.Root({
  question: Annotation<string>,
  history: Annotation<BaseMessage[]>({ reducer: (_, b) => b, default: () => [] }),
  query: Annotation<string>,                       // possibly rewritten
  docs: Annotation<Document[]>({ reducer: (_, b) => b, default: () => [] }),
  answer: Annotation<string>,
  rewrites: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  grounded: Annotation<boolean>,
});
```

## Minimal graph (Phase 5)

```ts
const retrieve = async (s: typeof RagState.State) => ({
  docs: await retriever.invoke(s.query ?? s.question),
});

const generate = async (s: typeof RagState.State) => {
  const prompt = await langfuse.prompt.get("rag-answer", { type: "chat" });
  const messages = prompt.compile({ question: s.question, context: formatDocs(s.docs) });
  const res = await llm.invoke(messages);
  return { answer: res.content as string };
};

export const graph = new StateGraph(RagState)
  .addNode("retrieve", retrieve)
  .addNode("generate", generate)
  .addEdge(START, "retrieve")
  .addEdge("retrieve", "generate")
  .addEdge("generate", END)
  .compile();
```

`formatDocs` must include a source label per chunk so the model can cite:
`[1] (user-guide-v3, p.14) …text…`

## Corrective graph (Phase 6, add pieces only as justified)

```
START → condense_question? → retrieve → grade_documents
   grade_documents ─(enough relevant)→ generate → check_grounding
   grade_documents ─(none relevant & rewrites<2)→ rewrite_query → retrieve
   grade_documents ─(none relevant & rewrites≥2)→ refuse → END
   check_grounding ─(grounded)→ END
   check_grounding ─(not grounded)→ generate (once) or refuse
```

```ts
const routeAfterGrade = (s: typeof RagState.State) =>
  s.docs.length > 0 ? "generate" : s.rewrites < 2 ? "rewrite_query" : "refuse";

builder.addConditionalEdges("grade_documents", routeAfterGrade, {
  generate: "generate", rewrite_query: "rewrite_query", refuse: "refuse",
});
```

Use a small fast model (Haiku-class) with structured output for graders
(`llm.withStructuredOutput(zodSchema)`), and the main model for generation.

## Invocation with tracing

```ts
const result = await graph.invoke(
  { question },
  { callbacks: [new CallbackHandler({ sessionId, userId, tags: ["prod", "v1.3"] })] },
);
```

## Multi-turn

Persist history with a LangGraph checkpointer (Postgres checkpointer on
Supabase) keyed by `thread_id` = session ID. Condense follow-ups into a
standalone question before retrieval.

## Rules

- Cap every loop (rewrites ≤ 2, regenerations ≤ 1).
- Each node does one job and is traced as its own span.
- Re-run the full eval after adding or changing any node.
