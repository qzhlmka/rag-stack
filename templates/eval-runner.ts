/**
 * Retrieval eval runner — Phases 2–4 and every regression run.
 * Usage: npx tsx eval-runner.ts <dataset-name> <run-name> [k]
 * Verify Langfuse/LangChain APIs against current docs before use.
 */
import "./instrumentation"; // starts OTel + LangfuseSpanProcessor
import { LangfuseClient } from "@langfuse/client";
import { sdk } from "./instrumentation";
import { retriever } from "./retriever"; // your current retriever under test

type Src = { doc_id?: string; page?: number; section?: string; media_id?: string; start?: number; end?: number };

const [datasetName, runName, kArg] = process.argv.slice(2);
const K = Number(kArg ?? 5);
const langfuse = new LangfuseClient();

const iou = (a: Src, b: Src) => {
  const inter = Math.max(0, Math.min(a.end!, b.end!) - Math.max(a.start!, b.start!));
  const union = Math.max(a.end!, b.end!) - Math.min(a.start!, b.start!);
  return union > 0 ? inter / union : 0;
};

const isHit = (r: Src, e: Src) =>
  e.media_id
    ? r.media_id === e.media_id && iou(r, e) >= 0.5
    : r.doc_id === e.doc_id &&
      (e.page === undefined || r.page === e.page) &&
      (e.section === undefined || (r.section ?? "").startsWith(e.section));

function scores(retrieved: Src[], expected: Src[], k: number) {
  const top = retrieved.slice(0, k);
  const found = expected.filter(e => top.some(r => isHit(r, e))).length;
  const first = retrieved.findIndex(r => expected.some(e => isHit(r, e)));
  return {
    recall: expected.length ? found / expected.length : 0,
    mrr: first >= 0 ? 1 / (first + 1) : 0,
    precision: top.filter(r => expected.some(e => isHit(r, e))).length / k,
  };
}

const answerable = (item: any) => item.expectedOutput?.answerable !== false;

async function main() {
  const dataset = await langfuse.dataset.get(datasetName);
  const items = dataset.items.filter(answerable); // unanswerables are scored in generation evals
  const t0 = Date.now();

  // dataset.runExperiment() always runs every item; experiment.run() accepts a filtered list
  // and still links results to the dataset run when items come from a Langfuse dataset.
  const result = await langfuse.experiment.run({
    name: runName.replace(/-\d{8}$/, ""),
    runName,
    metadata: { k: K },
    data: items,
    task: async (item: any) => {
      const docs = await retriever.invoke(item.input.question);
      return { sources: docs.map(d => d.metadata as Src) };
    },
    evaluators: [
      async ({ output, expectedOutput }: any) => {
        const s = scores(output.sources, expectedOutput.sources, K);
        return [
          { name: `recall_at_${K}`, value: s.recall },
          { name: "mrr", value: s.mrr },
          { name: `precision_at_${K}`, value: s.precision },
        ];
      },
    ],
  });

  // Local summary row for RAG_STATUS.md
  const rows = result.itemResults.map((r: any) => scores(r.output.sources, r.expectedOutput.sources, K));
  const avg = (f: (x: any) => number) => (rows.reduce((a, x) => a + f(x), 0) / rows.length).toFixed(2);

  console.log(`\nItems scored: ${rows.length} | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`| ${runName} | <change> | ${avg(x => x.recall)} | ${avg(x => x.mrr)} | ${avg(x => x.precision)} | – | – | – | <verdict> |`);

  // Worst items for failure analysis
  const worst = result.itemResults
    .map((r: any) => ({ q: r.input.question, ...scores(r.output.sources, r.expectedOutput.sources, K) }))
    .sort((a: any, b: any) => a.recall - b.recall || a.mrr - b.mrr)
    .slice(0, 10);
  console.log("\nWorst 10 (inspect before next experiment):");
  worst.forEach((w: any, i: number) => console.log(`${i + 1}. R=${w.recall.toFixed(2)} MRR=${w.mrr.toFixed(2)} — ${w.q}`));

  await sdk.shutdown();
}

main().catch(e => { console.error(e); process.exit(1); });
