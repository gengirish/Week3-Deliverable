"use client";

import { useRef, useState } from "react";
import { api, Job, pollJob, Status, STRATEGIES, STRATEGY_META } from "@/lib/api";
import { Badge, Button, Card, ErrorNote, ProgressBar, Spinner } from "./ui";

export function IndexPanel({
  status,
  onDone,
}: {
  status: Status | null;
  onDone: () => void;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const busy = job?.state === "running" || job?.state === "pending";

  async function track(start: () => Promise<{ job_id: string }>) {
    setError(null);
    try {
      const { job_id } = await start();
      const finished = await pollJob(job_id, setJob);
      if (finished.state === "failed") setError(finished.error ?? "Indexing failed");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setJob(null);
    }
  }

  function handleFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files can be indexed.");
      return;
    }
    void track(() => api.uploadAndIndex(file));
  }

  const doc = status?.document;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Index a PDF</h2>
          <p className="mt-1 text-xs text-slate-500">
            Extracts text, chunks it three ways, embeds every chunk and replaces
            the index. Takes roughly 30 seconds for a 16-page document.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInput.current?.click()}
            className={`mt-4 cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragging
                ? "border-slate-500 bg-slate-100 dark:bg-slate-800"
                : "border-slate-300 hover:border-slate-400 dark:border-slate-700"
            } ${busy ? "pointer-events-none opacity-50" : ""}`}
          >
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Drop a PDF here, or click to choose
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Text-based PDFs only — scanned documents need OCR
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void track(() => api.indexReference())}
            >
              {busy ? <Spinner /> : null}
              Load reference document
            </Button>
            <span className="text-[11px] text-slate-400">
              the PDF the benchmark is labelled against
            </span>
          </div>

          {busy && job ? (
            <div className="mt-4 space-y-2">
              <ProgressBar pct={job.pct} />
              <p className="font-mono text-[11px] text-slate-500">
                {job.stage} · {job.message}
              </p>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4">
              <ErrorNote message={error} />
            </div>
          ) : null}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Current index</h2>
          {doc?.indexed ? (
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-sm font-medium">{doc.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {doc.pages} pages · {doc.characters?.toLocaleString()} characters ·
                  indexed in {doc.duration_seconds}s
                </p>
              </div>

              {doc.stale ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                  This index is stale. {doc.stale_reason} Re-index before searching.
                </div>
              ) : null}

              <div className="grid grid-cols-3 gap-2">
                {STRATEGIES.map((s) => (
                  <div
                    key={s}
                    className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${STRATEGY_META[s].dot}`} />
                      <span className="text-[11px] font-medium">
                        {STRATEGY_META[s].label}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                      {doc.counts?.[s] ?? 0}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      avg {doc.token_stats?.[s]?.avg ?? 0} tok
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Badge tone={doc.is_reference_document ? "green" : "amber"}>
                  {doc.is_reference_document
                    ? "benchmark available"
                    : "benchmark unavailable for this PDF"}
                </Badge>
                <Badge>{status?.provider.label}</Badge>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Nothing indexed yet. Load the reference document to get to a working
              demo in one click.
            </p>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          What happens when you index
        </h3>
        <ol className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
          {[
            ["Schema", "Creates document_chunks with an HNSW index sized to the active embedding model."],
            ["Extract", "pdfplumber pulls text page by page, then repairs hyphenation, ligatures and headers."],
            ["Chunk", "Three strategies run over the same cleaned text, each recording character offsets."],
            ["Embed", "Every chunk is embedded and written to Postgres with its metadata."],
          ].map(([step, detail], i) => (
            <li key={step} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {i + 1}
              </span>
              <span>
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {step}.
                </span>{" "}
                {detail}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
