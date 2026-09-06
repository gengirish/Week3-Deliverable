"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Status } from "@/lib/api";
import { Badge, Card, ErrorNote, Spinner } from "@/components/ui";
import { SearchPanel } from "@/components/SearchPanel";
import { ChunksPanel } from "@/components/ChunksPanel";
import { EvalPanel } from "@/components/EvalPanel";
import { IndexPanel } from "@/components/IndexPanel";

const TABS = [
  { id: "search", label: "Compare search" },
  { id: "chunks", label: "Chunk explorer" },
  { id: "eval", label: "Benchmark" },
  { id: "index", label: "Index" },
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">RAG Chunking Lab</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              One document, one embedding model, three chunking strategies —
              indexed side by side in Supabase pgvector so you can see what the
              boundary choice actually changes.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Embeddings</span>
              <select
                value={status?.provider.provider ?? "local"}
                disabled={switching || !status}
                onChange={(e) => void changeProvider(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
              >
                {status?.providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.available}>
                    {p.label} · {p.dim}d{p.available ? "" : ` (${p.reason})`}
                  </option>
                ))}
              </select>
              {switching ? <Spinner className="text-slate-400" /> : null}
            </div>
            <div className="flex items-center gap-1.5">
              <Badge tone={status?.database.connected ? "green" : "red"}>
                {status?.database.connected
                  ? `pgvector · ${status.database.total} rows`
                  : "database unreachable"}
              </Badge>
              {status?.document.indexed ? (
                <Badge tone={status.document.stale ? "amber" : "slate"}>
                  {status.document.stale ? "index stale" : status.document.name}
                </Badge>
              ) : (
                <Badge tone="amber">no document</Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <div className="mb-6">
          <ErrorNote message={error} />
        </div>
      ) : null}

      {status?.database.error ? (
        <div className="mb-6">
          <ErrorNote message={`Database: ${status.database.error}`} />
        </div>
      ) : null}

      <nav className="mb-6 flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {!status ? (
        <Card className="flex items-center gap-3 p-6 text-sm text-slate-500">
          <Spinner /> Connecting to the API…
        </Card>
      ) : (
        <main>
          {tab === "search" ? <SearchPanel indexed={indexed} /> : null}
          {tab === "chunks" ? <ChunksPanel indexed={indexed} /> : null}
          {tab === "eval" ? (
            <EvalPanel indexed={indexed} isReference={isReference} />
          ) : null}
          {tab === "index" ? <IndexPanel status={status} onDone={refresh} /> : null}
        </main>
      )}

      <footer className="mt-12 border-t border-slate-200 pt-4 text-xs text-slate-400 dark:border-slate-800">
        FastAPI + Next.js over the rag_pipeline modules · pgvector HNSW (m=16,
        ef_construction=64) · retrieval logic is shared with the CLI, so the UI
        and <code className="font-mono">python main.py</code> always agree.
      </footer>
    </div>
  );
}
