// components/dashboard/StatusBadge.tsx
import type { LeadStatus } from "@/lib/dashboard-data";

const STATUS_STYLES: Record<LeadStatus, { bg: string; text: string; label: string }> = {
  verified: { bg: "bg-status-verifiedDim", text: "text-status-verified", label: "Verified" },
  flagged: { bg: "bg-status-flaggedDim", text: "text-status-flagged", label: "Flagged" },
  rejected: { bg: "bg-status-rejectedDim", text: "text-status-rejected", label: "Rejected" },
  duplicate: { bg: "bg-status-duplicateDim", text: "text-status-duplicate", label: "Duplicate" },
  pending: { bg: "bg-surface-raised", text: "text-ink-secondary", label: "Pending" },
  verifying: { bg: "bg-accent-dim", text: "text-accent", label: "Verifying" },
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-mono ${s.bg} ${s.text}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}
