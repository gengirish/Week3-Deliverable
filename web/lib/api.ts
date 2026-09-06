// Typed client for the FastAPI backend.
// Base URL is configurable so the demo can point at a non-default port.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export const STRATEGIES = ["fixed", "structural", "semantic"] as const;
export type Strategy = (typeof STRATEGIES)[number];

/**
 * Per-strategy identity. `accent` is a CSS custom property rather than a
 * Tailwind class so the same value can drive text, SVG fills and inline styles
 * in the ribbon without three parallel definitions drifting apart.
 */
export const STRATEGY_META: Record<
  Strategy,
  { label: string; rule: string; blurb: string; accent: string }
> = {
  fixed: {
    label: "Fixed",
    rule: "500 tokens · 50 overlap",
    blurb:
      "A sliding window that ignores content entirely. Fast, deterministic, and a stronger baseline than its reputation suggests.",
    accent: "var(--color-fixed)",
  },
  structural: {
    label: "Structural",
    rule: "400-token target",
    blurb:
      "Recursive split on paragraphs, then sentences. Fixed-size predictability without cutting mid-sentence.",
    accent: "var(--color-structural)",
  },
  semantic: {
    label: "Semantic",
    rule: "window 3 · adaptive p25",
    blurb:
      "Sentence windows cut where embedding similarity drops. The threshold is derived from this corpus, not borrowed.",
    accent: "var(--color-semantic)",
  },
};

export interface ProviderInfo {
  provider: string;
  model: string;
  dim: number;
  label: string;
  batch_size: number;
}

export interface ProviderOption {
  id: string;
  label: string;
  dim: number;
  available: boolean;
  reason: string;
}

export interface DocumentState {
  indexed: boolean;
  name?: string;
  pages?: number;
  characters?: number;
  counts?: Record<Strategy, number>;
  token_stats?: Record<Strategy, { count: number; avg: number; min: number; max: number }>;
  indexed_at?: string;
  duration_seconds?: number;
  is_reference_document?: boolean;
  stale?: boolean;
  stale_reason?: string;
}

export interface Status {
  provider: ProviderInfo;
  providers: ProviderOption[];
  document: DocumentState;
  database: {
    connected: boolean;
    counts: Record<string, number>;
    total: number;
    error: string | null;
  };
}

export interface SearchHit {
  chunk_id: string;
  content: string;
  score: number;
  source_page: number;
  char_start: number;
  char_end: number;
}

export interface SearchResponse {
  query: string;
  top_k: number;
  embed_ms: number;
  strategies: Record<Strategy, { took_ms: number; results: SearchHit[] }>;
}

export interface Job {
  id: string;
  kind: string;
  state: "pending" | "running" | "succeeded" | "failed";
  stage: string;
  message: string;
  pct: number;
  result: unknown;
  error: string | null;
}

export interface EvalHit extends SearchHit {
  is_gold: boolean;
}

export interface EvalResult {
  query_id: string;
  query_type: string;
  query_text: string;
  gold_anchor: string;
  gold_span: [number, number];
  strategies: Record<
    Strategy,
    { hit: boolean; hit_rank: number | null; top_score: number; results: EvalHit[] }
  >;
}

export interface EvalRun {
  summary: Record<Strategy, { hit: number; total: number; pct: number }>;
  results: EvalResult[];
  provider: ProviderInfo;
  document: string;
  span_coverage: number;
  top_k: number;
  ran_at: string;
}

export interface ChunkStats {
  summary: Record<
    Strategy,
    {
      chunks: number;
      avg_tokens: number;
      min_tokens: number;
      max_tokens: number;
      total_tokens: number;
    }
  >;
  token_counts: Record<Strategy, number[]>;
}

export interface ChunkRow {
  chunk_id: string;
  content: string;
  source_page: number;
  char_start: number;
  char_end: number;
  token_count: number;
}

/** Throws an Error carrying the API's `detail` message, which the UI renders. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers:
        init?.body instanceof FormData
          ? init?.headers
          : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error(
      `Cannot reach the API at ${API_BASE}. Start it with: uvicorn main:app --port 8010`,
    );
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      /* response had no JSON body; keep the status line */
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export const api = {
  status: () => request<Status>("/api/status"),

  setProvider: (provider: string) =>
    request<{ provider: ProviderInfo; reindex_required: boolean }>("/api/provider", {
      method: "POST",
      body: JSON.stringify({ provider }),
    }),

  search: (query: string, topK: number) =>
    request<SearchResponse>("/api/search", {
      method: "POST",
      body: JSON.stringify({ query, top_k: topK }),
    }),

  chunkStats: () => request<ChunkStats>("/api/chunks/stats"),

  chunks: (strategy: Strategy, limit = 100, offset = 0) =>
    request<{ strategy: Strategy; total: number; chunks: ChunkRow[] }>(
      `/api/chunks/${strategy}?limit=${limit}&offset=${offset}`,
    ),

  indexReference: () => request<{ job_id: string }>("/api/index/reference", { method: "POST" }),

  uploadAndIndex: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ job_id: string; filename: string }>("/api/index/upload", {
      method: "POST",
      body: form,
    });
  },

  job: (id: string) => request<Job>(`/api/jobs/${id}`),

  runEval: () => request<{ job_id: string }>("/api/eval/run", { method: "POST" }),

  lastEval: () => request<EvalRun>("/api/eval/last"),

  evalQueries: () =>
    request<{
      top_k: number;
      span_coverage: number;
      queries: { id: string; type: string; text: string; gold_anchor: string }[];
    }>("/api/eval/queries"),
};

/** Poll a job until it settles, reporting each update. */
export async function pollJob(
  jobId: string,
  onUpdate: (job: Job) => void,
  intervalMs = 700,
): Promise<Job> {
  for (;;) {
    const job = await api.job(jobId);
    onUpdate(job);
    if (job.state === "succeeded" || job.state === "failed") return job;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
