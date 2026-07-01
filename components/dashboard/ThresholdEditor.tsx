// components/dashboard/ThresholdEditor.tsx
"use client";

import { useState } from "react";

export function ThresholdEditor({
  clientId,
  initialVerified,
  initialFlagged,
}: {
  clientId: string;
  initialVerified: number | null;
  initialFlagged: number | null;
}) {
  const [verified, setVerified] = useState(initialVerified ?? 65);
  const [flagged, setFlagged] = useState(initialFlagged ?? 30);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/clients/${clientId}/thresholds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified, flagged }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 font-mono text-sm">
      <label className="flex items-center gap-1.5 text-ink-secondary">
        flagged ≥
        <input
          type="number"
          value={flagged}
          onChange={(e) => setFlagged(Number(e.target.value))}
          className="w-14 bg-surface-raised border border-surface-border rounded px-2 py-1 text-status-flagged text-center focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </label>
      <label className="flex items-center gap-1.5 text-ink-secondary">
        verified ≥
        <input
          type="number"
          value={verified}
          onChange={(e) => setVerified(Number(e.target.value))}
          className="w-14 bg-surface-raised border border-surface-border rounded px-2 py-1 text-status-verified text-center focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </label>
      <button
        onClick={save}
        disabled={saving}
        className="px-3 py-1.5 rounded-lg bg-accent-dim text-accent text-xs hover:opacity-80 disabled:opacity-40 transition-opacity"
      >
        {saved ? "Saved" : saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
