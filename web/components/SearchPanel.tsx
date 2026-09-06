"use client";

import { useState } from "react";
import {
  api,
  SearchResponse,
  STRATEGIES,
  STRATEGY_META,
  Strategy,
} from "@/lib/api";
import { Button, Card, EmptyState, ErrorNote, Spinner } from "./ui";

/** Questions that show the strategies genuinely disagreeing. */
const EXAMPLES = [
  "What percentage of overlap should I use between chunks?",
  "How should legal contracts be chunked compared to source code?",
  "What evidence shows document context reduces retrieval failures?",
  "What anti-patterns quietly destroy retrieval recall?",
];

function ScoreBar({ score, accent }: { score: number; accent: string }) {
  // Cosine similarity here lands roughly in 0.15-0.65, so the bar is scaled to
  // that band rather than 0-1, where every result would look identically short.
  const pct = Math.max(3, Math.min(100, ((score - 0.1) / 0.6) * 100));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
      <div className={`h-full rounded-full ${accent}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SearchPanel({ indexed }: { indexed: boolean }) {
  const [query, setQuery] = useState(EXAMPLES[0]);
  const [topK, setTopK] = useState(3);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function runSearch(text: string) {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.search(text, topK));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query);
          }}
          className="space-y-3"
        >
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Ask the document a question
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. What overlap percentage should I use?"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500"
            />
            <select
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              {[1, 3, 5, 10].map((k) => (
                <option key={k} value={k}>
                  top {k}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={loading || !indexed}>
              {loading ? <Spinner /> : null}
              {loading ? "Searching" : "Compare"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setQuery(example);
                  void runSearch(example);
                }}
                disabled={!indexed}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900 disabled:opacity-40 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-100"
              >
                {example.length > 52 ? `${example.slice(0, 52)}…` : example}
              </button>
            ))}
          </div>
        </form>
      </Card>

      {!indexed ? (
        <EmptyState
          title="No document indexed"
          hint="Open the Index tab and load a PDF to enable search."
        />
      ) : null}

      {error ? <ErrorNote message={error} /> : null}

      {data ? (
        <>
          <p className="text-xs text-slate-500">
            Query embedded in {data.embed_ms}ms · same vector sent to all three indexes
          </p>
          <div className="grid gap-4 lg:grid-cols-3">
            {STRATEGIES.map((strategy) => {
              const meta = STRATEGY_META[strategy];
              const column = data.strategies[strategy];
              return (
                <Card key={strategy} className="flex flex-col overflow-hidden">
                  <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                        <h3 className="text-sm font-semibold">{meta.label}</h3>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400">
                        {column.took_ms}ms
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">
                      {meta.blurb}
                    </p>
                  </div>

                  <div className="thin-scroll max-h-[32rem] space-y-3 overflow-y-auto p-3">
                    {column.results.map((hit, rank) => {
                      const key = `${strategy}-${hit.chunk_id}`;
                      const isOpen = expanded === key;
                      return (
                        <div
                          key={key}
                          className={`rounded-lg border border-slate-200 p-3 ring-1 ring-transparent transition-shadow hover:${meta.ring} dark:border-slate-800`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800">
                                #{rank + 1}
                              </span>
                              <span className="font-mono text-[11px] text-slate-500">
                                {hit.chunk_id}
                              </span>
                            </div>
                            <span className={`font-mono text-xs font-semibold ${meta.text}`}>
                              {hit.score.toFixed(3)}
                            </span>
                          </div>

                          <ScoreBar score={hit.score} accent={meta.accent} />

                          <p
                            className={`mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300 ${
                              isOpen ? "" : "line-clamp-4"
                            }`}
                          >
                            {hit.content}
                          </p>

                          <div className="mt-2 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-slate-400">
                              p{hit.source_page} · {hit.char_start}–{hit.char_end}
                            </span>
                            <button
                              onClick={() => setExpanded(isOpen ? null : key)}
                              className="text-[11px] text-slate-500 underline-offset-2 hover:underline"
                            >
                              {isOpen ? "Collapse" : "Expand"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {column.results.length === 0 ? (
                      <p className="px-1 py-6 text-center text-xs text-slate-400">
                        No chunks indexed for this strategy.
                      </p>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              What to look at
            </h4>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              The three columns share one query vector and one index — the only
              difference is where the document was cut. Compare the character
              ranges: when the columns return overlapping offsets, the strategies
              agree on where the answer lives and only disagree on how much
              context to carry. When the ranges are far apart, the boundary
              choice has changed what the retriever can see at all.
            </p>
          </Card>
        </>
      ) : null}
    </div>
  );
}
