"use client";

import { Fragment, useEffect, useState } from "react";
import {
  api,
  EvalRun,
  Job,
  pollJob,
  STRATEGIES,
  STRATEGY_META,
  Strategy,
} from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorNote, ProgressBar, Spinner } from "./ui";

function Verdict({ hit, rank }: { hit: boolean; rank: number | null }) {
  return hit ? (
    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
      <span aria-hidden>✓</span>
      <span className="text-[10px] text-slate-400">#{rank}</span>
    </span>
  ) : (
    <span className="text-rose-500 dark:text-rose-400" aria-label="miss">
      ✕
    </span>
  );
}

export function EvalPanel({
  indexed,
  isReference,
}: {
  indexed: boolean;
  isReference: boolean;
}) {
  const [run, setRun] = useState<EvalRun | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api.lastEval().then(setRun).catch(() => setRun(null));
  }, []);

  async function start() {
    setError(null);
    try {
      const { job_id } = await api.runEval();
      const finished = await pollJob(job_id, setJob);
      if (finished.state === "failed") {
        setError(finished.error ?? "Evaluation failed");
      } else {
        setRun(finished.result as EvalRun);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setJob(null);
    }
  }

  const busy = job?.state === "running" || job?.state === "pending";

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-sm font-semibold">Hit-Rate@3 benchmark</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Ten queries across four question types, each labelled with a
              verbatim answer phrase from the document. A strategy scores a hit
              when one of its top-3 chunks covers at least 80% of that answer
              span. Labelling by span rather than by chunk id keeps it fair:
              the three strategies cut at different offsets, so any single gold
              chunk id would belong to one strategy and penalise the other two.
            </p>
          </div>
          <Button onClick={start} disabled={busy || !indexed || !isReference}>
            {busy ? <Spinner /> : null}
            {busy ? "Running" : run ? "Re-run" : "Run benchmark"}
          </Button>
        </div>

        {busy && job ? (
          <div className="mt-4 space-y-2">
            <ProgressBar pct={job.pct} />
            <p className="font-mono text-[11px] text-slate-500">{job.message}</p>
          </div>
        ) : null}

        {indexed && !isReference ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            The gold answer spans were written for the reference document
            (IF-RES-2026-122). They cannot be scored against another PDF, so the
            benchmark is disabled. Re-index the reference document from the Index
            tab to run it.
          </div>
        ) : null}
      </Card>

      {error ? <ErrorNote message={error} /> : null}

      {!run ? (
        <EmptyState
          title="No benchmark run yet"
          hint="Run it to score all three strategies over the labelled query set."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {STRATEGIES.map((s) => {
              const meta = STRATEGY_META[s];
              const score = run.summary[s];
              const best =
                score.hit === Math.max(...STRATEGIES.map((x) => run.summary[x].hit));
              return (
                <Card key={s} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                      <h3 className="text-sm font-semibold">{meta.label}</h3>
                    </div>
                    {best ? <Badge tone="green">best</Badge> : null}
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-semibold tabular-nums">
                      {score.hit}
                      <span className="text-lg text-slate-400">/{score.total}</span>
                    </span>
                    <span className="text-sm text-slate-500">{score.pct}%</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full ${meta.accent}`}
                      style={{ width: `${score.pct}%` }}
                    />
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-medium">Query</th>
                    <th className="px-3 py-3 font-medium">Type</th>
                    {STRATEGIES.map((s) => (
                      <th key={s} className="px-3 py-3 text-center font-medium">
                        {STRATEGY_META[s].label}
                      </th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {run.results.map((result) => {
                    const isOpen = open === result.query_id;
                    return (
                      <Fragment key={result.query_id}>
                        <tr
                          onClick={() => setOpen(isOpen ? null : result.query_id)}
                          className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        >
                          <td className="max-w-md px-4 py-3">
                            <span className="font-mono text-[11px] text-slate-400">
                              {result.query_id}
                            </span>{" "}
                            <span className="text-slate-700 dark:text-slate-200">
                              {result.query_text}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">
                            {result.query_type}
                          </td>
                          {STRATEGIES.map((s) => (
                            <td key={s} className="px-3 py-3 text-center">
                              <Verdict
                                hit={result.strategies[s].hit}
                                rank={result.strategies[s].hit_rank}
                              />
                              <div className="font-mono text-[10px] text-slate-400">
                                {result.strategies[s].top_score.toFixed(2)}
                              </div>
                            </td>
                          ))}
                          <td className="px-2 text-slate-400">{isOpen ? "▾" : "▸"}</td>
                        </tr>
                        {isOpen ? (
                          <tr className="bg-slate-50 dark:bg-slate-950/60">
                            <td colSpan={6} className="px-4 py-4">
                              <p className="mb-3 text-xs text-slate-500">
                                <span className="font-medium text-slate-600 dark:text-slate-300">
                                  Gold answer span:
                                </span>{" "}
                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[11px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  {result.gold_anchor}
                                </span>{" "}
                                <span className="font-mono text-[10px] text-slate-400">
                                  chars {result.gold_span[0]}–{result.gold_span[1]}
                                </span>
                              </p>
                              <div className="grid gap-3 lg:grid-cols-3">
                                {STRATEGIES.map((s) => (
                                  <div key={s}>
                                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
                                      <span
                                        className={`h-2 w-2 rounded-full ${STRATEGY_META[s].dot}`}
                                      />
                                      {STRATEGY_META[s].label}
                                    </p>
                                    <div className="space-y-1.5">
                                      {result.strategies[s].results.map((hit) => (
                                        <div
                                          key={hit.chunk_id}
                                          className={`rounded-md border p-2 ${
                                            hit.is_gold
                                              ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                                              : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                                          }`}
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="font-mono text-[10px] text-slate-500">
                                              {hit.chunk_id}
                                            </span>
                                            <span className="font-mono text-[10px] text-slate-400">
                                              {hit.score.toFixed(3)} ·{" "}
                                              {hit.char_start}–{hit.char_end}
                                            </span>
                                          </div>
                                          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                                            {hit.content}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Reading these numbers honestly
            </h4>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              <li>
                · Ten queries over one 16-page document is too small a sample to
                separate these strategies with confidence. A one-query swing moves
                a score by 10 points.
              </li>
              <li>
                · There is no hybrid BM25 stage and no reranker here — the two
                changes the source document argues matter more than the boundary
                choice. These numbers measure boundaries in isolation, which is
                deliberately the narrow question.
              </li>
              <li>
                · Scored with {run.provider.label} at {run.provider.dim} dims. A
                different embedding model can reorder the strategies, so the
                comparison holds only for this pairing.
              </li>
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
