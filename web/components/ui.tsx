"use client";

import { ReactNode } from "react";

/**
 * Editorial primitives.
 *
 * Structure comes from hairline rules and paper steps, not from a border on
 * every container. `Sheet` is the only raised surface; most grouping is done
 * with `Rule` + `SectionHead`, which is what keeps the page reading as a
 * document rather than a grid of cards.
 */

export function Sheet({
  children,
  className = "",
  raised = true,
}: {
  children: ReactNode;
  className?: string;
  raised?: boolean;
}) {
  return (
    <div
      className={`rounded-sm border border-rule ${
        raised ? "bg-surface shadow-[0_1px_2px_rgba(60,45,25,0.05),0_6px_18px_-12px_rgba(60,45,25,0.28)]" : "bg-transparent"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** A section rule that draws itself in on mount. */
export function Rule({
  weight = "hair",
  className = "",
  animate = true,
}: {
  weight?: "hair" | "strong" | "heavy";
  className?: string;
  animate?: boolean;
}) {
  const weights = {
    hair: "h-px bg-rule",
    strong: "h-px bg-rule-strong",
    heavy: "h-0.5 bg-ink",
  } as const;
  return (
    <div
      className={`${weights[weight]} ${animate ? "animate-rule" : ""} ${className}`}
      aria-hidden
    />
  );
}

export function SectionHead({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[13px] font-medium uppercase tracking-[0.18em] text-ink-muted">
          {children}
        </h2>
        {aside ? <div className="text-[12px] text-ink-faint">{aside}</div> : null}
      </div>
      <Rule className="mt-2" weight="strong" />
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "gold" | "miss" | "warn";
}) {
  const tones = {
    neutral: "border-rule-strong text-ink-muted",
    gold: "border-gold/45 text-gold bg-gold/8",
    miss: "border-miss/45 text-miss bg-miss/8",
    warn: "border-fixed/45 text-fixed bg-fixed/8",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-tight ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  size = "md",
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "outline" | "quiet";
  size?: "sm" | "md";
  type?: "button" | "submit";
  className?: string;
}) {
  const variants = {
    primary:
      "bg-ink text-paper hover:bg-ink-muted disabled:bg-rule-strong disabled:text-surface",
    outline:
      "border border-rule-strong text-ink hover:border-ink hover:bg-sunk disabled:opacity-40",
    quiet: "text-ink-muted hover:text-ink hover:bg-sunk disabled:opacity-40",
  } as const;
  const sizes = {
    sm: "px-3 py-1.5 text-[12px]",
    md: "px-4 py-2 text-[13px]",
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-sm font-medium tracking-tight transition-all duration-150 active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-3.5 w-3.5 animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Note({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warn" | "error";
}) {
  const tones = {
    neutral: "border-l-rule-strong text-ink-muted",
    warn: "border-l-fixed text-ink",
    error: "border-l-miss text-ink",
  } as const;
  return (
    <div className={`border-l-2 bg-sunk/60 py-3 pl-4 pr-4 text-[13px] leading-relaxed ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <Note tone="error">{message}</Note>;
}

export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-px w-full bg-rule">
      <div
        className="h-px bg-ink transition-all duration-500 ease-out"
        style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="py-20 text-center">
      <p className="font-display text-2xl italic text-ink-muted">{title}</p>
      {hint ? <p className="mt-2 text-[13px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}

/** A labelled statistic. Display serif for the number, small caps for the label. */
export function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">
        {label}
      </p>
      <p
        className="font-display text-3xl leading-none tnum"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-[11px] text-ink-faint tnum">{sub}</p> : null}
    </div>
  );
}
