// components/dashboard/ScoreWaterfall.tsx
// The signature visual of Mammba Verify: renders a lead's score as a
// left-to-right waterfall — base 50, then each check's contribution as a
// colored segment, ending at the final score. Threshold lines mark the
// verified/flagged cutoffs so you can see at a glance how close a lead
// came to tipping over.
"use client";

import { useMemo } from "react";

interface Contribution {
  check_type: string;
  passed: boolean;
  weight: number;
}

interface ScoreWaterfallProps {
  baseScore: number;
  contributions: Contribution[];
  finalScore: number;
  thresholds: { verified: number; flagged: number };
}

const CHECK_LABELS: Record<string, string> = {
  email_format: "Email format",
  email_disposable: "Disposable domain",
  email_mx: "MX record",
  email_deliverability: "Kickbox deliverability",
  phone_format: "Phone format",
  phone_type: "Twilio line type",
  phone_hlr: "IPQS HLR reachability",
  honeypot: "Honeypot",
  form_fill_speed: "Form fill speed",
  suppression: "Suppression list",
  duplicate_exact: "Duplicate check",
};

export function ScoreWaterfall({ baseScore, contributions, finalScore, thresholds }: ScoreWaterfallProps) {
  // Build cumulative segments so each block starts where the last ended
  const segments = useMemo(() => {
    let running = baseScore;
    return contributions
      .filter((c) => c.weight !== 0)
      .map((c) => {
        const start = running;
        running += c.weight;
        return {
          ...c,
          start: Math.max(0, Math.min(100, start)),
          end: Math.max(0, Math.min(100, running)),
        };
      });
  }, [baseScore, contributions]);

  const pct = (v: number) => `${Math.max(0, Math.min(100, v))}%`;

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-ink-secondary text-xs uppercase tracking-wide font-sans">Score breakdown</span>
        <span className="font-mono text-2xl text-ink-primary tabular-nums">{finalScore}</span>
      </div>

      {/* Track */}
      <div className="relative h-8 rounded-card bg-surface-raised overflow-hidden">
        {/* Base score marker */}
        <div
          className="absolute top-0 bottom-0 bg-ink-muted/30"
          style={{ left: 0, width: pct(baseScore) }}
        />

        {/* Contribution segments */}
        {segments.map((s, i) => {
          const isPositive = s.weight > 0;
          const left = Math.min(s.start, s.end);
          const width = Math.abs(s.end - s.start);
          return (
            <div
              key={i}
              title={`${CHECK_LABELS[s.check_type] ?? s.check_type}: ${s.weight > 0 ? "+" : ""}${s.weight}`}
              className={`absolute top-0 bottom-0 transition-opacity hover:opacity-80 ${
                isPositive ? "bg-status-verified" : "bg-status-rejected"
              }`}
              style={{ left: pct(left), width: pct(width) }}
            />
          );
        })}

        {/* Threshold markers */}
        <div
          className="absolute top-0 bottom-0 w-px bg-status-flagged"
          style={{ left: pct(thresholds.flagged) }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-status-verified"
          style={{ left: pct(thresholds.verified) }}
        />
      </div>

      {/* Scale labels */}
      <div className="flex justify-between mt-1 font-mono text-[10px] text-ink-muted">
        <span>0</span>
        <span className="text-status-flagged">{thresholds.flagged} flagged</span>
        <span className="text-status-verified">{thresholds.verified} verified</span>
        <span>100</span>
      </div>

      {/* Contribution list */}
      <div className="mt-5 space-y-1.5">
        {contributions.map((c, i) => (
          <div
            key={i}
            className="flex items-center justify-between font-mono text-xs py-1.5 px-2 rounded bg-surface-card"
          >
            <span className="text-ink-secondary font-sans">
              {CHECK_LABELS[c.check_type] ?? c.check_type}
            </span>
            <span
              className={
                c.weight > 0
                  ? "text-status-verified"
                  : c.weight < 0
                  ? "text-status-rejected"
                  : "text-ink-muted"
              }
            >
              {c.weight > 0 ? "+" : ""}
              {c.weight}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
