// app/dashboard/upload/page.tsx
"use client";

import { useState, useRef, useCallback } from "react";

interface UploadSummary {
  total: number;
  verified: number;
  flagged: number;
  rejected: number;
  duplicate: number;
  errors: number;
}

type UploadState = "idle" | "uploading" | "done" | "error";

export default function UploadPage() {
  const [state, setState] = useState<UploadState>("idle");
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [resultsCsv, setResultsCsv] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    setFileName(file.name);
    setState("uploading");
    setSummary(null);
    setResultsCsv(null);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/leads/bulk", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_LEAD_INGEST_SECRET ?? ""}`,
        },
        body: formData,
      });

      const csv = await res.text();

      if (!res.ok) {
        // Error responses come back as JSON even from a CSV endpoint
        try {
          const json = JSON.parse(csv);
          throw new Error(json.error ?? "Upload failed");
        } catch {
          throw new Error(csv || "Upload failed");
        }
      }

      const summaryHeader = res.headers.get("X-Summary");
      if (summaryHeader) {
        setSummary(JSON.parse(summaryHeader));
      }
      setResultsCsv(csv);
      setState("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setState("error");
    }
  }, []);

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      setErrorMsg("Only .csv files are supported");
      setState("error");
      return;
    }
    upload(file);
  }

  function downloadResults() {
    if (!resultsCsv) return;
    const blob = new Blob([resultsCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lead-verification-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="font-mono text-xl text-ink-primary">Bulk CSV upload</h1>
        <p className="text-ink-secondary text-sm font-sans mt-1">
          Upload a CSV of leads — every row is verified and scored automatically.
          Max 500 rows per upload.
        </p>
      </div>

      {/* Format hint */}
      <div className="rounded-card bg-surface-card border border-surface-border p-4 text-xs font-mono text-ink-secondary space-y-1">
        <div className="text-ink-muted uppercase tracking-wide mb-2">Required CSV format</div>
        <div>Required columns: <span className="text-accent">email</span> and/or <span className="text-accent">phone</span></div>
        <div>Optional columns: first_name, last_name, company, source, client_id, campaign_id</div>
        <div className="mt-2 text-ink-muted">Example:</div>
        <div className="text-ink-primary">email,phone,first_name,last_name,source</div>
        <div>jane@example.com,3055551234,Jane,Doe,facebook_ads</div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`relative rounded-card border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-accent bg-accent-dim"
            : state === "done"
            ? "border-status-verified bg-status-verifiedDim"
            : state === "error"
            ? "border-status-rejected bg-status-rejectedDim"
            : "border-surface-border bg-surface-card hover:border-accent hover:bg-accent-dim"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        {state === "idle" && (
          <div className="space-y-2">
            <div className="text-3xl">📂</div>
            <div className="font-sans text-ink-primary">Drop a CSV file here or click to browse</div>
            <div className="text-ink-muted text-sm font-mono">Max 500 rows · .csv only</div>
          </div>
        )}

        {state === "uploading" && (
          <div className="space-y-3">
            <div className="text-3xl animate-pulse">⏳</div>
            <div className="font-sans text-ink-primary">Verifying <span className="font-mono">{fileName}</span>…</div>
            <div className="text-ink-secondary text-sm">Running checks on every lead. This may take a minute for large files.</div>
          </div>
        )}

        {state === "done" && summary && (
          <div className="space-y-4">
            <div className="text-3xl">✅</div>
            <div className="font-sans text-ink-primary font-medium">{fileName} — {summary.total} leads processed</div>
            <div className="grid grid-cols-3 gap-3 text-left mt-4">
              <Pill label="Verified" value={summary.verified} color="text-status-verified" bg="bg-status-verifiedDim" />
              <Pill label="Flagged" value={summary.flagged} color="text-status-flagged" bg="bg-status-flaggedDim" />
              <Pill label="Rejected" value={summary.rejected} color="text-status-rejected" bg="bg-status-rejectedDim" />
              <Pill label="Duplicate" value={summary.duplicate} color="text-ink-secondary" bg="bg-surface-raised" />
              <Pill label="Errors" value={summary.errors} color="text-status-rejected" bg="bg-status-rejectedDim" />
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-2">
            <div className="text-3xl">❌</div>
            <div className="font-sans text-status-rejected">{errorMsg}</div>
            <div className="text-ink-muted text-sm">Click to try again</div>
          </div>
        )}
      </div>

      {/* Actions */}
      {state === "done" && (
        <div className="flex gap-3">
          <button
            onClick={downloadResults}
            className="px-4 py-2 rounded-lg bg-status-verifiedDim text-status-verified text-sm font-sans hover:opacity-80 transition-opacity"
          >
            Download results CSV
          </button>
          <button
            onClick={() => {
              setState("idle");
              setSummary(null);
              setResultsCsv(null);
              setFileName(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="px-4 py-2 rounded-lg bg-surface-raised text-ink-secondary text-sm font-sans hover:opacity-80 transition-opacity"
          >
            Upload another file
          </button>
        </div>
      )}

      {state === "error" && (
        <button
          onClick={() => { setState("idle"); setErrorMsg(null); }}
          className="px-4 py-2 rounded-lg bg-surface-raised text-ink-secondary text-sm font-sans hover:opacity-80"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function Pill({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-lg ${bg} px-3 py-2`}>
      <div className={`font-mono text-xl tabular-nums ${color}`}>{value}</div>
      <div className="text-ink-muted text-xs font-sans">{label}</div>
    </div>
  );
}
