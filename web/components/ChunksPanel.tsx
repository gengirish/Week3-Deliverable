"use client";

import { useEffect, useState } from "react";
import { api, ChunkRow, ChunkStats, STRATEGIES, STRATEGY_META, Strategy } from "@/lib/api";
import { EmptyState, ErrorNote, Rule, SectionHead, Sheet, Spinner, Stat } from "./ui";

/**
 * Token counts drawn in document order — reading left to right is reading
 * through the document. This is where each strategy's character shows: fixed is
 * a flat line by construction, semantic is jagged wherever the topic turns.
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
    <div className="flex h-20 items-end gap-[2px]" aria-hidden>
      {counts.map((count, i) => (
        <div
          key={i}
          className="animate-span flex-1 rounded-[1px]"
          style={{
            height: `${Math.max(3, (count / max) * 100)}%`,
            background: accent,
            opacity: 0.85,
            animationDelay: `${i * 12}ms`,
          }}
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
        title="Nothing is indexed yet."
        hint="Open the Index tab and load a document to explore its chunks."
      />
    );
  }

  const globalMax = stats
    ? Math.max(...STRATEGIES.flatMap((s) => stats.token_counts[s] ?? [1]))
    : 1;

  return (
    <div className="space-y-10">
      <section>
        <SectionHead aside="bar height = token count · left to right = document order">
          The shape of each strategy
        </SectionHead>

        <div className="grid gap-px bg-rule lg:grid-cols-3">
          {STRATEGIES.map((s, col) => {
            const meta = STRATEGY_META[s];
            const summary = stats?.summary[s];
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
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                    {meta.rule}
                  </span>
                </div>
                <div className="mt-2 h-0.5 animate-rule" style={{ background: meta.accent }} />

                {summary ? (
                  <>
                    <div className="mt-4 flex items-end justify-between">
                      <Stat
                        label="chunks"
                        value={summary.chunks}
                        accent={meta.accent}
                      />
                      <div className="flex gap-5 text-right">
                        <Stat label="avg" value={summary.avg_tokens} />
                        <Stat label="range" value={`${summary.min_tokens}–${summary.max_tokens}`} />
                      </div>
                    </div>

                    <div className="mt-5">
                      <SizeProfile
                        counts={stats!.token_counts[s] ?? []}
                        accent={meta.accent}
                        max={globalMax}
                      />
                      <Rule className="mt-1" animate={false} />
                    </div>

                    <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
                      {meta.blurb}
                    </p>
                  </>
                ) : (
                  <div className="flex h-40 items-center">
                    <Spinner className="text-ink-faint" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {error ? <ErrorNote message={error} /> : null}

      <section>
        <SectionHead
          aside={loading ? "loading…" : `${chunks.length} chunks`}
        >
          Browse the text
        </SectionHead>

        <div className="mb-4 flex gap-6">
          {STRATEGIES.map((s) => (
            <button
              key={s}
              onClick={() => setStrategy(s)}
              className={`pb-1 font-display text-lg tracking-tight transition-all active:scale-95 ${
                strategy === s ? "" : "text-ink-faint hover:text-ink-muted"
              }`}
              style={
                strategy === s
                  ? {
                      color: STRATEGY_META[s].accent,
                      boxShadow: `inset 0 -2px 0 0 ${STRATEGY_META[s].accent}`,
                    }
                  : undefined
              }
            >
              {STRATEGY_META[s].label}
            </button>
          ))}
        </div>

        <Sheet>
          <div className="thin-scroll max-h-[34rem] overflow-y-auto">
            {chunks.map((chunk, i) => (
              <article
                key={chunk.chunk_id}
                className="group border-b border-rule px-5 py-4 transition-colors last:border-b-0 hover:bg-sunk/50"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className="font-display text-lg leading-none"
                    style={{ color: STRATEGY_META[strategy].accent }}
                  >
                    {i + 1}
                  </span>
                  <span className="font-mono text-[11px] font-medium">{chunk.chunk_id}</span>
                  <span className="font-mono text-[11px] text-ink-faint tnum">
                    {chunk.token_count} tok · page {chunk.source_page} ·{" "}
                    {chunk.char_start.toLocaleString()}–{chunk.char_end.toLocaleString()}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-ink-muted">
                  {chunk.content}
                </p>
              </article>
            ))}
          </div>
        </Sheet>
      </section>
    </div>
  );
}
