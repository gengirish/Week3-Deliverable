"use client";

import { useState } from "react";
import { api, SearchResponse, STRATEGIES, STRATEGY_META } from "@/lib/api";
import { OffsetRibbon, RibbonSpan } from "./OffsetRibbon";
import {
  Button,
  EmptyState,
  ErrorNote,
  Rule,
  SectionHead,
  Sheet,
  Spinner,
} from "./ui";

/** Questions where the three strategies visibly disagree. */
const EXAMPLES = [
  "What percentage of overlap should I use between chunks?",
  "How should legal contracts be chunked compared to source code?",
  "What evidence shows document context reduces retrieval failures?",
  "What anti-patterns quietly destroy retrieval recall?",
];

export function SearchPanel({
  indexed,
  docChars,
}: {
  indexed: boolean;
  docChars: number;
}) {
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

  const lanes = data
    ? (Object.fromEntries(
        STRATEGIES.map((s) => [
          s,
          data.strategies[s].results.map(
            (hit, i): RibbonSpan => ({
              start: hit.char_start,
              end: hit.char_end,
              rank: i + 1,
              label: `${hit.chunk_id} · ${hit.score.toFixed(3)}`,
            }),
          ),
        ]),
      ) as Record<(typeof STRATEGIES)[number], RibbonSpan[]>)
    : null;

  return (
    <div className="space-y-10">
      <section>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query);
          }}
        >
          <label
            htmlFor="q"
            className="block font-display text-[28px] leading-tight tracking-tight"
          >
            Ask the document a question.
          </label>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-muted">
            One question, embedded once, sent to three indexes that differ only
            in where the text was cut.
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              id="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. What overlap percentage should I use?"
              className="flex-1 rounded-sm border-0 border-b-2 border-rule-strong bg-transparent px-1 py-2.5 text-[16px] outline-none transition-colors placeholder:text-ink-faint focus:border-ink"
            />
            <select
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="rounded-sm border border-rule-strong bg-surface px-3 py-2 text-[13px]"
              aria-label="Results per strategy"
            >
              {[1, 3, 5, 10].map((k) => (
                <option key={k} value={k}>
                  top {k}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={loading || !indexed}>
              {loading ? <Spinner /> : null}
              {loading ? "Retrieving" : "Compare"}
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setQuery(example);
                  void runSearch(example);
                }}
                disabled={!indexed}
                className="text-left text-[12px] text-ink-muted underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink disabled:opacity-40"
              >
                {example.length > 44 ? `${example.slice(0, 44)}…` : example}
              </button>
            ))}
          </div>
        </form>
      </section>

      {!indexed ? (
        <EmptyState
          title="Nothing is indexed yet."
          hint="Open the Index tab and load a document to begin."
        />
      ) : null}

      {error ? <ErrorNote message={error} /> : null}

      {data && lanes ? (
        <>
          {/* The anchor: three strategies reaching into one document */}
          <section className="animate-rise">
            <Sheet className="p-5">
              <OffsetRibbon total={docChars} lanes={lanes} />
            </Sheet>
          </section>

          <section>
            <SectionHead
              aside={`query embedded in ${data.embed_ms}ms · identical vector to all three`}
            >
              Retrieved passages
            </SectionHead>

            <div className="grid gap-px bg-rule lg:grid-cols-3">
              {STRATEGIES.map((strategy, col) => {
                const meta = STRATEGY_META[strategy];
                const column = data.strategies[strategy];
                return (
                  <div
                    key={strategy}
                    className="animate-rise bg-paper"
                    style={{ animationDelay: `${col * 70}ms` }}
                  >
                    <header className="px-4 pb-3 pt-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3
                          className="font-display text-xl tracking-tight"
                          style={{ color: meta.accent }}
                        >
                          {meta.label}
                        </h3>
                        <span className="font-mono text-[11px] text-ink-faint tnum">
                          {column.took_ms}ms
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                        {meta.rule}
                      </p>
                      <div
                        className="mt-2.5 h-0.5 animate-rule"
                        style={{ background: meta.accent }}
                      />
                    </header>

                    <div className="thin-scroll max-h-[30rem] space-y-4 overflow-y-auto px-4 pb-5">
                      {column.results.map((hit, rank) => {
                        const key = `${strategy}-${hit.chunk_id}`;
                        const isOpen = expanded === key;
                        return (
                          <article key={key} className="group">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="font-mono text-[11px] text-ink-muted">
                                <span
                                  className="mr-1.5 font-display text-base"
                                  style={{ color: meta.accent }}
                                >
                                  {rank + 1}
                                </span>
                                {hit.chunk_id}
                              </span>
                              <span className="font-mono text-[12px] font-medium tnum">
                                {hit.score.toFixed(3)}
                              </span>
                            </div>

                            <p
                              className={`mt-1.5 text-[13px] leading-relaxed text-ink-muted ${
                                isOpen ? "" : "line-clamp-4"
                              }`}
                            >
                              {hit.content}
                            </p>

                            <div className="mt-1.5 flex items-center justify-between">
                              <span className="font-mono text-[10px] text-ink-faint tnum">
                                p{hit.source_page} · {hit.char_start.toLocaleString()}–
                                {hit.char_end.toLocaleString()}
                              </span>
                              <button
                                onClick={() => setExpanded(isOpen ? null : key)}
                                className="text-[11px] text-ink-faint underline-offset-4 transition-colors hover:text-ink hover:underline"
                              >
                                {isOpen ? "less" : "more"}
                              </button>
                            </div>
                            <Rule className="mt-3.5" animate={false} />
                          </article>
                        );
                      })}
                      {column.results.length === 0 ? (
                        <p className="py-8 text-center text-[12px] text-ink-faint">
                          No chunks indexed for this strategy.
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="max-w-3xl">
            <SectionHead>How to read this</SectionHead>
            <p className="font-display text-[17px] leading-[1.65] text-ink-muted">
              The columns share one query vector and one index — the only
              variable is where the document was cut. When the ribbon shows the
              three lanes lighting up together, the strategies agree on where the
              answer lives and differ only in how much context they carry. When a
              lane lights up somewhere else entirely,{" "}
              <em className="text-ink">the boundary choice has changed what the
              retriever could see at all</em>, and no reranker downstream can
              recover what the vector never encoded.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
