"use client";

import { STRATEGIES, STRATEGY_META, Strategy } from "@/lib/api";

/**
 * The document rendered as a measurable strip, one lane per strategy.
 *
 * This is the point of the whole app made visible. Every retrieval is a range
 * of characters in one document; three strategies reaching into three different
 * regions is the finding, and a table of chunk ids hides it. Here the lanes
 * line up on a shared horizontal axis, so agreement and disagreement are
 * spatial rather than something you work out from numbers.
 */

export interface RibbonSpan {
  start: number;
  end: number;
  rank: number;
  label?: string;
  gold?: boolean;
}

const ACCENT: Record<Strategy, string> = {
  fixed: "var(--color-fixed)",
  structural: "var(--color-structural)",
  semantic: "var(--color-semantic)",
};

export function OffsetRibbon({
  total,
  lanes,
  goldSpan,
  compact = false,
}: {
  total: number;
  lanes: Record<Strategy, RibbonSpan[]>;
  goldSpan?: [number, number] | null;
  compact?: boolean;
}) {
  // Guard against a zero/absent document length, which would divide by zero and
  // collapse every span onto the origin.
  const span = total > 0 ? total : 1;
  const pct = (value: number) => `${Math.max(0, Math.min(100, (value / span) * 100))}%`;

  return (
    <figure className="w-full">
      {!compact ? (
        <figcaption className="mb-2.5 flex items-baseline justify-between">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
            Where each strategy reached into the document
          </span>
          <span className="font-mono text-[11px] text-ink-faint tnum">
            0 → {total.toLocaleString()} chars
          </span>
        </figcaption>
      ) : null}

      <div className="relative">
        {/* Gold answer span, drawn through every lane so hits read as alignment */}
        {goldSpan ? (
          <div
            className="pointer-events-none absolute inset-y-0 z-10 border-x border-gold/70 bg-gold/12"
            style={{
              left: pct(goldSpan[0]),
              width: `max(2px, ${((goldSpan[1] - goldSpan[0]) / span) * 100}%)`,
            }}
            aria-hidden
          />
        ) : null}

        <div className="space-y-1">
          {STRATEGIES.map((strategy, laneIndex) => (
            <div key={strategy} className="flex items-center gap-2.5">
              {!compact ? (
                <span
                  className="w-[4.75rem] shrink-0 text-right text-[11px] font-medium tracking-tight"
                  style={{ color: ACCENT[strategy] }}
                >
                  {STRATEGY_META[strategy].label}
                </span>
              ) : null}

              <div
                className={`relative flex-1 overflow-hidden rounded-[2px] bg-sunk ${
                  compact ? "h-2" : "h-4"
                }`}
              >
                {lanes[strategy]?.map((s, i) => (
                  <div
                    key={`${s.start}-${s.end}-${i}`}
                    className="animate-span absolute inset-y-0 rounded-[1px]"
                    style={{
                      left: pct(s.start),
                      width: `max(3px, ${((s.end - s.start) / span) * 100}%)`,
                      background: ACCENT[strategy],
                      // Rank 1 is solid; lower ranks recede, so the top result
                      // is findable without reading a label.
                      opacity: s.rank === 1 ? 0.95 : s.rank === 2 ? 0.62 : 0.4,
                      animationDelay: `${laneIndex * 90 + i * 60}ms`,
                    }}
                    title={s.label ?? `#${s.rank} · ${s.start}–${s.end}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!compact ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-[5.5rem] text-[11px] text-ink-faint">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-[1px] bg-ink opacity-90" /> rank 1
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-[1px] bg-ink opacity-40" /> ranks 2–3
          </span>
          {goldSpan ? (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-[1px] border-x border-gold bg-gold/25" />
              gold answer span
            </span>
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}
