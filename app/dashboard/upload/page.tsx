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

      const text = await res.text();

      if (!res.ok) {
        try { throw new Error(JSON.parse(text).error ?? "Upload failed"); }
        catch { throw new Error(text || "Upload failed"); }
      }

      const summaryHeader = res.headers.get("X-Summary");
      if (summaryHeader) setSummary(JSON.parse(summaryHeader));
      setResultsCsv(text);
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

  function reset() {
    setState("idle");
    setSummary(null);
    setResultsCsv(null);
    setFileName(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="font-mono text-xl text-ink-primary">Bulk CSV upload</h1>
        <p className="text-ink-secondary text-sm font-sans mt-1">
          Upload a CSV of leads — every row is verified and scored automatically. Max 500 rows per upload.
        </p>
      </div>

      {/* Format hint */}
      <div className="rounded-card bg-surface-card border border-surface-border p-4 text-xs font-mono text-ink-secondary space-y-1">
        <div className="text-ink-muted uppercase tracking-wide mb-2 font-sans">Required CSV format</div>
        <div>Required columns: <span className="text-accent">email</span> and/or <span className="text-accent">phone</span></div>
        <div>Optional: first_name, last_name, company, source, client_id</div>
        <div className="pt-1 text-ink-muted">email,phone,first_name,last_name,source</div>
        <div>jane@example.com,3055551234,Jane,Doe,facebook_ads</div>
      </div>

      {/* Always-visible file input + browse button */}
      {(state === "idle" || state === "error") && (
        <div className="space-y-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
            className={`rounded-card border-2 border-dashed p-10 text-center transition-colors ${
              dragOver
                ? "border-accent bg-accent-dim"
                : state === "error"
                ? "border-status-rejected bg-status-rejectedDim"
                : "border-surface-border bg-surface-card"
            }`}
          >
            <div className="text-3xl mb-3">📂</div>
            <p className="font-sans text-ink-secondary text-sm mb-4">
              Drag and drop a CSV here, or use the button below
            </p>
            {state === "error" && errorMsg && (
              <p className="text-status-rejected text-sm font-sans mb-3">{errorMsg}</p>
            )}

            {/* The actual file input — visible, styled as a button */}
            <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-sans cursor-pointer hover:opacity-90 transition-opacity">
              Browse files
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </label>

            <p className="text-ink-muted text-xs font-mono mt-3">.csv only · max 500 rows</p>
          </div>
        </div>
      )}

      {/* Uploading state */}
      {state === "uploading" && (
        <div className="rounded-card bg-surface-card border border-surface-border p-10 text-center space-y-3">
          <div className="text-3xl animate-pulse">⏳</div>
          <p className="font-sans text-ink-primary">
            Verifying <span className="font-mono">{fileName}</span>…
          </p>
          <p className="text-ink-secondary text-sm">
            Running all checks on every lead. This may take a minute for large files.
          </p>
        </div>
      )}

      {/* Done state */}
      {state === "done" && summary && (
        <div className="rounded-card bg-surface-card border border-surface-border p-6 space-y-5">
          <div className="flex items-center gap-2">
            <span className="text-status-verified text-xl">✓</span>
            <span className="font-sans text-ink-primary font-medium">
              {fileName} — {summary.total} leads processed
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Pill label="Verified" value={summary.verified} color="text-status-verified" bg="bg-status-verifiedDim" />
            <Pill label="Flagged" value={summary.flagged} color="text-status-flagged" bg="bg-status-flaggedDim" />
            <Pill label="Rejected" value={summary.rejected} color="text-status-rejected" bg="bg-status-rejectedDim" />
            <Pill label="Duplicate" value={summary.duplicate} color="text-ink-secondary" bg="bg-surface-raised" />
            {summary.errors > 0 && (
              <Pill label="Errors" value={summary.errors} color="text-status-rejected" bg="bg-status-rejectedDim" />
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={downloadResults}
              className="px-4 py-2 rounded-lg bg-status-verifiedDim text-status-verified text-sm font-sans hover:opacity-80 transition-opacity"
            >
              Download results CSV
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 rounded-lg bg-surface-raised text-ink-secondary text-sm font-sans hover:opacity-80 transition-opacity"
            >
              Upload another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-lg ${bg} px-3 py-2`}>
      <div className={`font-mono text-2xl tabular-nums ${color}`}>{value}</div>
      <div className="text-ink-muted text-xs font-sans mt-0.5">{label}</div>
    </div>
  );
}
