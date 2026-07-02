"use client";

import { useState, useTransition } from "react";
import type { SuppressionRow, SuppressionType } from "@/lib/dashboard-data";
import { createSuppression, deleteSuppression } from "@/app/dashboard/suppression/actions";

const TYPES: { value: SuppressionType; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "domain", label: "Domain" },
  { value: "phone", label: "Phone" },
  { value: "ip", label: "IP" },
];

const TYPE_COLORS: Record<SuppressionType, string> = {
  email: "text-accent",
  domain: "text-status-flagged",
  phone: "text-status-verified",
  ip: "text-ink-secondary",
};

export function SuppressionManager({ initialRows }: { initialRows: SuppressionRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [value, setValue] = useState("");
  const [valueType, setValueType] = useState<SuppressionType>("email");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("value", value);
    fd.set("value_type", valueType);
    fd.set("reason", reason);

    startTransition(async () => {
      const result = await createSuppression(fd);
      if (!result.ok) {
        setError(result.error ?? "Could not add entry.");
        return;
      }
      // Optimistically prepend; server revalidation will reconcile.
      setRows((prev) => [
        {
          id: `temp-${Date.now()}`,
          created_at: new Date().toISOString(),
          value: value.trim().toLowerCase(),
          value_type: valueType,
          reason: reason.trim() || null,
          added_by: "dashboard",
        },
        ...prev,
      ]);
      setValue("");
      setReason("");
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteSuppression(id);
      if (result.ok) setRows((prev) => prev.filter((r) => r.id !== id));
    });
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleAdd}
        className="rounded-card bg-surface-card border border-surface-border p-5 flex flex-col gap-4"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <label className="flex flex-col gap-1.5 flex-1">
            <span className="text-xs font-mono text-ink-muted uppercase tracking-wide">Value</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="bad@example.com"
              className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm font-mono text-ink-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-mono text-ink-muted uppercase tracking-wide">Type</span>
            <select
              value={valueType}
              onChange={(e) => setValueType(e.target.value as SuppressionType)}
              className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm font-sans text-ink-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 flex-1">
            <span className="text-xs font-mono text-ink-muted uppercase tracking-wide">Reason</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="optional note"
              className="bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm font-sans text-ink-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
          <button
            type="submit"
            disabled={pending || !value.trim()}
            className="px-4 py-2 rounded-lg bg-accent-dim text-accent text-sm hover:opacity-80 disabled:opacity-40 transition-opacity shrink-0"
          >
            {pending ? "Adding…" : "Add to list"}
          </button>
        </div>
        {error && <p className="text-status-rejected text-sm font-sans">{error}</p>}
      </form>

      <div className="rounded-card bg-surface-card border border-surface-border overflow-hidden">
        <div className="grid grid-cols-[100px_1fr_1fr_140px_60px] gap-4 px-5 py-3 border-b border-surface-border text-xs font-mono text-ink-muted uppercase tracking-wide">
          <span>Type</span>
          <span>Value</span>
          <span>Reason</span>
          <span>Added</span>
          <span className="text-right">Remove</span>
        </div>
        <div className="divide-y divide-surface-border">
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[100px_1fr_1fr_140px_60px] gap-4 px-5 py-3 items-center text-sm"
            >
              <span className={`font-mono text-xs ${TYPE_COLORS[row.value_type]}`}>
                {row.value_type}
              </span>
              <span className="font-mono text-ink-primary truncate">{row.value}</span>
              <span className="font-sans text-ink-secondary truncate">
                {row.reason ?? "—"}
              </span>
              <span className="font-mono text-xs text-ink-muted">
                {new Date(row.created_at).toLocaleDateString()}
              </span>
              <button
                onClick={() => handleDelete(row.id)}
                disabled={pending}
                className="justify-self-end text-ink-muted hover:text-status-rejected transition-colors text-xs disabled:opacity-40"
                aria-label={`Remove ${row.value}`}
              >
                Remove
              </button>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="p-8 text-center text-ink-muted font-sans text-sm">
              No suppressed values yet. Add an email, domain, phone, or IP above to block it from
              verification.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
