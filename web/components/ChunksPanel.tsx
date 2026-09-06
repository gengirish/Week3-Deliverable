"use client";

import { useEffect, useState } from "react";
import {
  api,
  ChunkRow,
  ChunkStats,
  STRATEGIES,
  STRATEGY_META,
  Strategy,
} from "@/lib/api";
import { Card, EmptyState, ErrorNote, Spinner } from "./ui";

/**
 * Token counts drawn in document order. Reading left to right is reading
 * through the document, which makes the character of each strategy visible:
 * fixed is a flat line, semantic is jagged wherever the topic turns.
 */
function SizeProfile({
  counts,
  accent,
  max,
}: {
  counts: number[];
  accent: string;
  max: number;
}) {
  if (counts.length === 0) return null;
  return (
    <div className="flex h-16 items-end gap-px" aria-hidden>
      {counts.map((count, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm ${accent} opacity-80`}
          style={{ height: `${Math.max(4, (count / max) * 100)}%` }}
          title={`${count} tokens`}
        />
      ))}
    </div>
  );
}

export function ChunksPanel({ indexed }: { indexed: boolean }) {
  const [stats, setStats] = useState<ChunkStats | null>(null);
  const [strategy, setStrategy] = useState<Strategy>("fixed");
  const [chunks, setChunks] = useState<ChunkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!indexed) return;
    api.chunkStats().then(setStats).catch((e) => setError(String(e.message ?? e)));
  }, [indexed]);

  useEffect(() => {
    if (!indexed) return;
    setLoading(true);
    api
      .chunks(strategy, 200)
      .then((r) => setChunks(r.chunks))
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, [strategy, indexed]);

  if (!indexed) {
    return (
      <EmptyState
        title="No document indexed"
        hint="Open the Index tab and load a PDF to explore its chunks."
      />
    );
  }

  const globalMax = stats
    ? Math.max(...STRATEGIES.flatMap((s) => stats.token_counts[s] ?? [1]))
    : 1;

  return (
    <div className="space-y-6">
      {error ? <ErrorNote message={error} /> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {STRATEGIES.map((s) => {
          const meta = STRATEGY_META[s];
          const summary = stats?.summary[s];
          return (
            <Card key={s} className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                <h3 className="text-sm font-semibold">{meta.label}</h3>
              </div>
              {summary ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tabular-nums">
                      {summary.chunks}
                    </span>
                    <span className="text-xs text-slate-500">chunks</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {[
                      ["avg", summary.avg_tokens],
                      ["min", summary.min_tokens],
                      ["max", summary.max_tokens],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-md bg-slate-50 py-1.5 dark:bg-slate-800/60"
                      >
                        <dt className="text-[10px] uppercase tracking-wide text-slate-400">
                          {label}
                        </dt>
                        <dd className="font-mono text-xs font-semibold tabular-nums">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                      Size profile, in document order
                    </p>
                    <SizeProfile
                      counts={stats!.token_counts[s] ?? []}
                      accent={meta.accent}
                      max={globalMax}
                    />
                  </div>
                </>
              ) : (
                <Spinner className="text-slate-400" />
              )}
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <span className="text-xs font-medium text-slate-500">Browse chunks</span>
          <div className="flex gap-1">
            {STRATEGIES.map((s) => (
              <button
                key={s}
                onClick={() => setStrategy(s)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  strategy === s
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {STRATEGY_META[s].label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-slate-400">
            {loading ? "loading…" : `${chunks.length} shown`}
          </span>
        </div>

        <div className="thin-scroll max-h-[34rem] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {chunks.map((chunk) => (
            <div key={chunk.chunk_id} className="px-4 py-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] font-medium">{chunk.chunk_id}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800">
                  {chunk.token_count} tok
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  page {chunk.source_page} · {chunk.char_start}–{chunk.char_end}
                </span>
              </div>
              <p className="line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {chunk.content}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
