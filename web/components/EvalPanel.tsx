"use client";

import { Fragment, useEffect, useState } from "react";
import { api, EvalRun, Job, pollJob, STRATEGIES, STRATEGY_META } from "@/lib/api";
import { OffsetRibbon, RibbonSpan } from "./OffsetRibbon";
import {
  Button,
  EmptyState,
  ErrorNote,
  Note,
  ProgressBar,
  Rule,
  SectionHead,
  Sheet,
  Spinner,
} from "./ui";

function Verdict({ hit, rank }: { hit: boolean; rank: number | null }) {
  return hit ? (
    <span className="inline-flex items-baseline gap-1" title={`found at rank ${rank}`}>
      <span className="font-display text-lg leading-none text-gold">✓</span>
      <span className="font-mono text-[10px] text-ink-faint">{rank}</span>
    </span>
  ) : (
    <span className="font-display text-lg leading-none text-miss/50" aria-label="miss">
      ·
    </span>
  );
}

export function EvalPanel({
  indexed,
  isReference,
  docChars,
}: {
  indexed: boolean;
  isReference: boolean;
  docChars: number;
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
      if (finished.state === "failed") setError(finished.error ?? "Evaluation failed");
      else setRun(finished.result as EvalRun);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setJob(null);
    }
  }

  const busy = job?.state === "running" || job?.state === "pending";
  const best = run ? Math.max(...STRATEGIES.map((s) => run.summary[s].hit)) : 0;

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-[28px] leading-tight tracking-tight">
              Ten questions with known answers.
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
              Each query is labelled with a verbatim answer phrase from the
              document. A strategy scores a hit when one of its top-3 chunks
              covers at least 80% of that span. Labelling by span rather than by
              chunk id is what keeps it fair — the three strategies cut at
              different offsets, so any single gold chunk id would belong to one
              of them and penalise the other two.
            </p>
          </div>
          <Button onClick={start} disabled={busy || !indexed || !isReference}>
            {busy ? <Spinner /> : null}
            {busy ? "Scoring" : run ? "Run again" : "Run benchmark"}
          </Button>
        </div>

        {busy && job ? (
          <div className="mt-5 space-y-2">
            <ProgressBar pct={job.pct} />
            <p className="font-mono text-[11px] text-ink-muted">{job.message}</p>
          </div>
        ) : null}

        {indexed && !isReference ? (
          <div className="mt-5">
            <Note tone="warn">
              The gold answer spans belong to the reference document
              (IF-RES-2026-122) and cannot be scored against another PDF. Load
              the reference document from the Index tab to run the benchmark.
            </Note>
          </div>
        ) : null}
      </section>

      {error ? <ErrorNote message={error} /> : null}

      {!run ? (
        <EmptyState
          title="No benchmark has been run."
          hint="Score all three strategies over the labelled query set."
        />
      ) : (
        <>
          <section>
            <SectionHead aside={`${run.provider.label} · top-${run.top_k} · ≥${Math.round(run.span_coverage * 100)}% span coverage`}>
              Hit-rate at 3
            </SectionHead>

            <div className="grid gap-px bg-rule sm:grid-cols-3">
              {STRATEGIES.map((s, col) => {
                const meta = STRATEGY_META[s];
                const score = run.summary[s];
                return (
                  <div
                    key={s}
                    className="animate-rise bg-paper p-5"
                    style={{ animationDelay: `${col * 70}ms` }}
                  >
                    <div className="flex items-baseline justify-between">
                      <h3
                        className="font-display text-xl tracking-tight"
                        style={{ color: meta.accent }}
                      >
                        {meta.label}
                      </h3>
                      {score.hit === best ? (
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gold">
                          strongest
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-3 font-display text-6xl leading-none tnum" style={{ color: meta.accent }}>
                      {score.hit}
                      <span className="text-3xl text-ink-faint">/{score.total}</span>
                    </p>

                    {/* Ten ticks: a count, not a percentage bar — with n=10 a
                        continuous bar implies precision the sample cannot carry */}
                    <div className="mt-4 flex gap-1">
                      {Array.from({ length: score.total }).map((_, i) => (
                        <div
                          key={i}
                          className="h-6 flex-1 rounded-[1px]"
                          style={{
                            background: i < score.hit ? meta.accent : "var(--color-sunk)",
                            border: i < score.hit ? "none" : "1px solid var(--color-rule)",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <SectionHead aside="click a row to see all three strategies' top-3">
              Query by query
            </SectionHead>

            <Sheet>
              {/* The verdict columns cannot compress below their glyph width, so
                  the table scrolls inside its own container rather than forcing
                  the page body to scroll sideways on a narrow screen. */}
              <div className="thin-scroll overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left">
                <thead>
                  <tr className="border-b border-rule-strong">
                    <th className="px-5 py-3 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                      Question
                    </th>
                    <th className="hidden px-3 py-3 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint sm:table-cell">
                      Type
                    </th>
                    {STRATEGIES.map((s) => (
                      <th
                        key={s}
                        className="px-3 py-3 text-center text-[10px] font-medium uppercase tracking-[0.14em]"
                        style={{ color: STRATEGY_META[s].accent }}
                      >
                        {STRATEGY_META[s].label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {run.results.map((result) => {
                    const isOpen = open === result.query_id;
                    const lanes = Object.fromEntries(
                      STRATEGIES.map((s) => [
                        s,
                        result.strategies[s].results.map(
                          (h, i): RibbonSpan => ({
                            start: h.char_start,
                            end: h.char_end,
                            rank: i + 1,
                            gold: h.is_gold,
                            label: `${h.chunk_id} · ${h.score.toFixed(3)}`,
                          }),
                        ),
                      ]),
                    ) as Record<(typeof STRATEGIES)[number], RibbonSpan[]>;

                    return (
                      <Fragment key={result.query_id}>
                        <tr
                          onClick={() => setOpen(isOpen ? null : result.query_id)}
                          className={`cursor-pointer border-b border-rule transition-colors hover:bg-sunk/60 ${
                            isOpen ? "bg-sunk/60" : ""
                          }`}
                        >
                          <td className="max-w-md px-5 py-3.5">
                            <span className="font-mono text-[10px] text-ink-faint">
                              {result.query_id}
                            </span>
                            <span className="ml-2 text-[13px]">{result.query_text}</span>
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-3.5 text-[11px] text-ink-faint sm:table-cell">
                            {result.query_type}
                          </td>
                          {STRATEGIES.map((s) => (
                            <td key={s} className="px-3 py-3.5 text-center">
                              <Verdict
                                hit={result.strategies[s].hit}
                                rank={result.strategies[s].hit_rank}
                              />
                            </td>
                          ))}
                        </tr>

                        {isOpen ? (
                          <tr className="border-b border-rule bg-sunk/30">
                            <td colSpan={5} className="px-5 py-5">
                              <p className="mb-4 font-display text-[17px] italic leading-snug">
                                “{result.gold_anchor}”
                                <span className="ml-2 font-sans text-[11px] not-italic text-ink-faint tnum">
                                  gold span · chars{" "}
                                  {result.gold_span[0].toLocaleString()}–
                                  {result.gold_span[1].toLocaleString()}
                                </span>
                              </p>

                              <div className="mb-5">
                                <OffsetRibbon
                                  total={docChars}
                                  lanes={lanes}
                                  goldSpan={result.gold_span}
                                />
                              </div>

                              <div className="grid gap-px bg-rule lg:grid-cols-3">
                                {STRATEGIES.map((s) => (
                                  <div key={s} className="bg-paper p-3.5">
                                    <p
                                      className="font-display text-base"
                                      style={{ color: STRATEGY_META[s].accent }}
                                    >
                                      {STRATEGY_META[s].label}
                                    </p>
                                    <Rule className="mb-2.5 mt-1.5" animate={false} />
                                    <div className="space-y-2.5">
                                      {result.strategies[s].results.map((hit) => (
                                        <div
                                          key={hit.chunk_id}
                                          className={
                                            hit.is_gold
                                              ? "border-l-2 border-gold pl-2.5"
                                              : "border-l-2 border-rule pl-2.5"
                                          }
                                        >
                                          <div className="flex items-baseline justify-between gap-2">
                                            <span className="font-mono text-[10px] text-ink-muted">
                                              {hit.chunk_id}
                                            </span>
                                            <span className="font-mono text-[10px] text-ink-faint tnum">
                                              {hit.score.toFixed(3)}
                                            </span>
                                          </div>
                                          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-muted">
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
            </Sheet>
          </section>

          <section className="max-w-3xl">
            <SectionHead>Reading these numbers honestly</SectionHead>
            <div className="space-y-3 font-display text-[17px] leading-[1.65] text-ink-muted">
              <p>
                Ten queries over one 16-page document is too small a sample to
                separate three strategies with confidence.{" "}
                <em className="text-ink">A single query swings a score by ten
                points.</em>
              </p>
              <p>
                There is no hybrid BM25 stage here and no reranker — the two
                changes the source document argues matter more than the boundary
                choice. This measures boundaries in isolation, which is
                deliberately the narrow question.
              </p>
              <p>
                Scored with {run.provider.label} at {run.provider.dim} dimensions.
                A different embedding model can reorder the strategies, so the
                result holds for this pairing and not in general.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
