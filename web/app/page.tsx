"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Status } from "@/lib/api";
import { ErrorNote, Rule, Spinner } from "@/components/ui";
import { SearchPanel } from "@/components/SearchPanel";
import { ChunksPanel } from "@/components/ChunksPanel";
import { EvalPanel } from "@/components/EvalPanel";
import { IndexPanel } from "@/components/IndexPanel";

const TABS = [
  { id: "search", label: "Compare", note: "one question, three cuts" },
  { id: "chunks", label: "Chunks", note: "what each strategy produced" },
  { id: "eval", label: "Benchmark", note: "ten labelled questions" },
  { id: "index", label: "Index", note: "load a document" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Home() {
  const [status, setStatus] = useState<Status | null>(null);
  const [tab, setTab] = useState<TabId>("search");
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.status());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function changeProvider(provider: string) {
    setSwitching(true);
    try {
      const result = await api.setProvider(provider);
      await refresh();
      if (result.reindex_required) setTab("index");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSwitching(false);
    }
  }

  const indexed = Boolean(status?.document.indexed) && !status?.document.stale;
  const isReference = Boolean(status?.document.is_reference_document);
  const docChars = status?.document.characters ?? 0;

  return (
    <div className="mx-auto min-h-full max-w-[84rem] px-5 pb-24 sm:px-8">
      {/* Masthead — the thesis is the title, not the product name */}
      <header className="pt-10">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
              Retrieval engineering · Chunking Lab
            </p>
            <h1 className="mt-2 max-w-xl font-display text-[40px] font-normal leading-[1.05] tracking-tight sm:text-[52px]">
              Where you cut changes
              <br />
              <em className="text-ink-muted">what you find.</em>
            </h1>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <label className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                Embeddings
              </span>
              <select
                value={status?.provider.provider ?? "local"}
                disabled={switching || !status}
                onChange={(e) => void changeProvider(e.target.value)}
                className="rounded-sm border border-rule-strong bg-surface px-2.5 py-1.5 text-[12px] disabled:opacity-50"
              >
                {status?.providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.available}>
                    {p.label} · {p.dim}d{p.available ? "" : ` (${p.reason})`}
                  </option>
                ))}
              </select>
              {switching ? <Spinner className="text-ink-faint" /> : null}
            </label>

            <p className="font-mono text-[11px] text-ink-faint tnum">
              <span className={status?.database.connected ? "text-gold" : "text-miss"}>
                ●
              </span>{" "}
              {status?.database.connected
                ? `pgvector · ${status.database.total} rows`
                : "database unreachable"}
              {status?.document.indexed ? (
                <>
                  {" · "}
                  {status.document.stale ? (
                    <span className="text-fixed">index stale</span>
                  ) : (
                    <span className="text-ink-muted">
                      {status.document.pages}pp indexed
                    </span>
                  )}
                </>
              ) : (
                <span className="text-fixed"> · no document</span>
              )}
            </p>
          </div>
        </div>

        <Rule weight="heavy" className="mt-8" />
      </header>

      {error ? (
        <div className="mt-6">
          <ErrorNote message={error} />
        </div>
      ) : null}

      {status?.database.error ? (
        <div className="mt-6">
          <ErrorNote message={`Database: ${status.database.error}`} />
        </div>
      ) : null}

      <nav className="mb-10 flex flex-wrap gap-x-8 gap-y-2 pt-4">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="group py-1 text-left transition-all active:scale-95"
            >
              <span
                className={`block font-display text-xl tracking-tight transition-colors ${
                  active ? "text-ink" : "text-ink-faint group-hover:text-ink-muted"
                }`}
              >
                {t.label}
              </span>
              <span
                className={`mt-0.5 block text-[11px] transition-colors ${
                  active ? "text-ink-muted" : "text-ink-faint/70"
                }`}
              >
                {t.note}
              </span>
              <span
                className={`mt-1.5 block h-0.5 origin-left transition-transform duration-300 ${
                  active ? "scale-x-100 bg-ink" : "scale-x-0 bg-rule-strong"
                }`}
              />
            </button>
          );
        })}
      </nav>

      {!status ? (
        <div className="flex items-center gap-3 py-20 text-[13px] text-ink-muted">
          <Spinner /> Connecting to the API…
        </div>
      ) : (
        <main>
          {tab === "search" ? (
            <SearchPanel indexed={indexed} docChars={docChars} />
          ) : null}
          {tab === "chunks" ? <ChunksPanel indexed={indexed} /> : null}
          {tab === "eval" ? (
            <EvalPanel indexed={indexed} isReference={isReference} docChars={docChars} />
          ) : null}
          {tab === "index" ? <IndexPanel status={status} onDone={refresh} /> : null}
        </main>
      )}

      <footer className="mt-20">
        <Rule weight="strong" />
        <p className="pt-4 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-ink-faint">
          FastAPI + Next.js over rag_pipeline · pgvector HNSW m=16 ef_construction=64 ·
          retrieval logic shared with the CLI
        </p>
      </footer>
    </div>
  );
}
