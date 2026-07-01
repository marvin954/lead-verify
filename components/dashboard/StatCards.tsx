// components/dashboard/StatCards.tsx
import type { DashboardStats } from "@/lib/dashboard-data";

function StatCard({
  label,
  value,
  sub,
  accentClass = "text-ink-primary",
}: {
  label: string;
  value: string | number;
  sub?: string;
  accentClass?: string;
}) {
  return (
    <div className="rounded-card bg-surface-card border border-surface-border p-5 flex flex-col gap-1">
      <span className="text-ink-secondary text-xs uppercase tracking-wide font-sans">{label}</span>
      <span className={`font-mono text-3xl tabular-nums ${accentClass}`}>{value}</span>
      {sub && <span className="text-ink-muted text-xs font-mono">{sub}</span>}
    </div>
  );
}

export function StatCards({ stats }: { stats: DashboardStats }) {
  const verifiedPct =
    stats.total_today > 0 ? Math.round((stats.verified_today / stats.total_today) * 100) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <StatCard label="Leads today" value={stats.total_today} />
      <StatCard
        label="Verified"
        value={stats.verified_today}
        sub={`${verifiedPct}% of today`}
        accentClass="text-status-verified"
      />
      <StatCard label="Flagged" value={stats.flagged_today} accentClass="text-status-flagged" />
      <StatCard label="Rejected" value={stats.rejected_today} accentClass="text-status-rejected" />
      <StatCard label="Duplicate" value={stats.duplicate_today} accentClass="text-ink-secondary" />
      <StatCard
        label="Avg score"
        value={stats.avg_score_today ?? "—"}
        sub={
          stats.verified_rate_7d != null ? `${stats.verified_rate_7d}% verified, 7d` : undefined
        }
        accentClass="text-accent"
      />
    </div>
  );
}
