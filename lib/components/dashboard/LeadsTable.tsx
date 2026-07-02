// components/dashboard/LeadsTable.tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { StatusBadge } from "./StatusBadge";
import type { LeadRow, LeadStatus } from "@/lib/dashboard-data";

const STATUS_TABS: (LeadStatus | "all")[] = ["all", "verified", "flagged", "rejected", "duplicate"];

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function LeadsTable({
  rows,
  total,
  page,
  pageSize,
  activeStatus,
}: {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  activeStatus: LeadStatus | "all";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    if (key !== "page") params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="rounded-card bg-surface-card border border-surface-border overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-surface-border">
        <div className="flex gap-1">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setParam("status", s)}
              className={`px-3 py-1.5 rounded-full text-xs font-mono capitalize transition-colors ${
                activeStatus === s
                  ? "bg-accent-dim text-accent"
                  : "text-ink-secondary hover:text-ink-primary hover:bg-surface-raised"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          defaultValue={searchParams.get("search") ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("search", (e.target as HTMLInputElement).value);
          }}
          placeholder="Search email, phone, name…"
          className="bg-surface-raised border border-surface-border rounded-full px-4 py-1.5 text-sm font-sans text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-accent w-64"
        />
      </div>

      {/* Table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-muted font-sans text-xs uppercase tracking-wide">
            <th className="px-5 py-3 font-medium">Lead</th>
            <th className="px-5 py-3 font-medium">Source</th>
            <th className="px-5 py-3 font-medium">Client</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium text-right">Score</th>
            <th className="px-5 py-3 font-medium text-right">Received</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((lead) => (
            <tr
              key={lead.id}
              onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
              className="border-t border-surface-border hover:bg-surface-raised cursor-pointer transition-colors"
            >
              <td className="px-5 py-3">
                <div className="flex flex-col">
                  <span className="text-ink-primary font-sans">
                    {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
                  </span>
                  <span className="text-ink-muted font-mono text-xs">
                    {lead.email || lead.phone || "no contact"}
                  </span>
                </div>
              </td>
              <td className="px-5 py-3 text-ink-secondary font-mono text-xs">{lead.source}</td>
              <td className="px-5 py-3 text-ink-secondary font-sans">{lead.client_name ?? "—"}</td>
              <td className="px-5 py-3">
                <StatusBadge status={lead.status} />
              </td>
              <td className="px-5 py-3 text-right font-mono tabular-nums text-ink-primary">
                {lead.score ?? "—"}
              </td>
              <td className="px-5 py-3 text-right font-mono text-xs text-ink-muted">
                {timeAgo(lead.created_at)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-5 py-12 text-center text-ink-muted font-sans">
                No leads match this filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-surface-border font-mono text-xs text-ink-muted">
        <span>
          {total} lead{total !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setParam("page", String(page - 1))}
            className="disabled:opacity-30 hover:text-ink-primary"
          >
            ← Prev
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setParam("page", String(page + 1))}
            className="disabled:opacity-30 hover:text-ink-primary"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
