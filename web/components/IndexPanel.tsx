"use client";

import { useRef, useState } from "react";
import { api, Job, pollJob, Status, STRATEGIES, STRATEGY_META } from "@/lib/api";
import { Button, ErrorNote, Note, ProgressBar, Rule, SectionHead, Sheet, Spinner, Stat } from "./ui";

const STEPS = [
  ["Schema", "Creates document_chunks with an HNSW index sized to the active embedding model."],
  ["Extract", "pdfplumber reads page by page, then repairs hyphenation, ligatures and running headers."],
  ["Chunk", "Three strategies run over the same cleaned text, each recording character offsets."],
  ["Embed", "Every chunk is embedded and written to Postgres with its metadata."],
] as const;

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
    <div className="space-y-10">
      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <SectionHead>Load a document</SectionHead>

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
            className={`cursor-pointer border border-dashed px-6 py-14 text-center transition-all ${
              dragging ? "border-ink bg-sunk" : "border-rule-strong hover:border-ink-faint hover:bg-sunk/50"
            } ${busy ? "pointer-events-none opacity-40" : ""}`}
          >
            <p className="font-display text-xl tracking-tight">
              Drop a PDF here
            </p>
            <p className="mt-1 text-[12px] text-ink-faint">
              or click to choose · text-based PDFs only, scanned pages need OCR
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void track(() => api.indexReference())}
            >
              {busy ? <Spinner /> : null}
              Load reference document
            </Button>
            <span className="text-[11px] text-ink-faint">
              the one the benchmark is labelled against
            </span>
          </div>

          {busy && job ? (
            <div className="mt-5 space-y-2">
              <ProgressBar pct={job.pct} />
              <p className="font-mono text-[11px] text-ink-muted">
                <span className="uppercase tracking-[0.1em] text-ink-faint">{job.stage}</span>{" "}
                {job.message}
              </p>
            </div>
          ) : null}

          {error ? (
            <div className="mt-5">
              <ErrorNote message={error} />
            </div>
          ) : null}
        </section>

        <section>
          <SectionHead aside={doc?.indexed ? `${doc.duration_seconds}s to build` : undefined}>
            Currently indexed
          </SectionHead>

          {doc?.indexed ? (
            <div className="space-y-5">
              <div>
                <p className="font-display text-2xl leading-snug tracking-tight">
                  {doc.name}
                </p>
                <p className="mt-1 font-mono text-[11px] text-ink-faint tnum">
                  {doc.pages} pages · {doc.characters?.toLocaleString()} characters
                </p>
              </div>

              {doc.stale ? (
                <Note tone="warn">
                  This index is stale. {doc.stale_reason} Rebuild it before searching.
                </Note>
              ) : null}

              <Rule weight="strong" />

              <div className="grid grid-cols-3 gap-4">
                {STRATEGIES.map((s) => (
                  <Stat
                    key={s}
                    label={STRATEGY_META[s].label}
                    value={doc.counts?.[s] ?? 0}
                    sub={`avg ${doc.token_stats?.[s]?.avg ?? 0} tok`}
                    accent={STRATEGY_META[s].accent}
                  />
                ))}
              </div>

              <Rule weight="strong" />

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
                <span className="text-ink-muted">
                  <span className="text-ink-faint">embeddings</span>{" "}
                  {status?.provider.label}
                </span>
                <span className={doc.is_reference_document ? "text-gold" : "text-fixed"}>
                  {doc.is_reference_document
                    ? "benchmark available"
                    : "benchmark unavailable for this document"}
                </span>
              </div>
            </div>
          ) : (
            <p className="font-display text-xl italic text-ink-muted">
              Nothing indexed yet. Loading the reference document gets you to a
              working demo in one click.
            </p>
          )}
        </section>
      </div>

      <section className="max-w-4xl">
        <SectionHead>What happens when you index</SectionHead>
        <ol className="grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([step, detail], i) => (
            <li key={step} className="bg-paper p-4">
              <p className="font-display text-3xl leading-none text-ink-faint tnum">
                {String(i + 1).padStart(2, "0")}
              </p>
              <p className="mt-2 font-display text-lg tracking-tight">{step}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{detail}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
