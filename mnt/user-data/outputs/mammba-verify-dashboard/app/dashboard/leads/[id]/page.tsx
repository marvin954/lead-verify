// app/dashboard/leads/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeadDetail } from "@/lib/dashboard-data";
import { ScoreWaterfall } from "@/components/dashboard/ScoreWaterfall";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { ReviewActions } from "@/components/dashboard/ReviewActions";

export const revalidate = 0;

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const lead = await getLeadDetail(params.id);
  if (!lead) notFound();

  const thresholds = lead.thresholds_applied ?? { verified: 65, flagged: 30 };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-2 text-sm font-sans text-ink-secondary">
        <Link href="/dashboard" className="hover:text-ink-primary">
          Overview
        </Link>
        <span>/</span>
        <span className="text-ink-primary">
          {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email || lead.phone}
        </span>
      </div>

      {/* Header */}
      <div className="rounded-card bg-surface-card border border-surface-border p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-sans text-xl text-ink-primary">
              {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed lead"}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={lead.status} />
              <span className="text-ink-muted font-mono text-xs">
                {lead.source} · {lead.client_name ?? "no client"}
              </span>
            </div>
          </div>
          {lead.status === "flagged" && <ReviewActions leadId={lead.id} />}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-surface-border font-mono text-sm">
          <Field label="Email" value={lead.email ?? "—"} />
          <Field label="Phone" value={lead.phone ?? "—"} />
          <Field label="Company" value={lead.company ?? "—"} />
          <Field label="IP" value={lead.ip_address ?? "—"} />
          <Field label="Received" value={new Date(lead.created_at).toLocaleString()} />
          <Field
            label="Form fill time"
            value={lead.form_fill_time_ms != null ? `${lead.form_fill_time_ms}ms` : "—"}
          />
        </div>
      </div>

      {/* Score waterfall — the signature visual */}
      <div className="rounded-card bg-surface-card border border-surface-border p-6">
        <ScoreWaterfall
          baseScore={50}
          contributions={lead.checks.map((c) => ({
            check_type: c.check_type,
            passed: c.passed,
            weight: c.weight,
          }))}
          finalScore={lead.score ?? 50}
          thresholds={thresholds}
        />
      </div>

      {/* Raw check detail — for dispute resolution */}
      <div className="rounded-card bg-surface-card border border-surface-border p-6">
        <h2 className="font-mono text-xs uppercase tracking-wide text-ink-secondary mb-4">
          Raw verification detail
        </h2>
        <div className="space-y-3">
          {lead.checks.map((c, i) => (
            <details key={i} className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none py-2 px-3 rounded-lg bg-surface-raised">
                <span className="font-sans text-sm text-ink-primary">{c.check_type}</span>
                <div className="flex items-center gap-3">
                  {c.provider && (
                    <span className="text-ink-muted font-mono text-xs">{c.provider}</span>
                  )}
                  <span
                    className={`font-mono text-xs ${
                      c.passed ? "text-status-verified" : "text-status-rejected"
                    }`}
                  >
                    {c.passed ? "PASS" : "FAIL"}
                  </span>
                </div>
              </summary>
              {c.detail && (
                <pre className="mt-2 p-3 rounded-lg bg-surface-base text-ink-secondary font-mono text-xs overflow-x-auto">
                  {JSON.stringify(c.detail, null, 2)}
                </pre>
              )}
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-ink-muted text-[10px] uppercase tracking-wide font-sans">{label}</span>
      <span className="text-ink-primary">{value}</span>
    </div>
  );
}
