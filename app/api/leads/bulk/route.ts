// app/api/leads/bulk/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyLead, normalizePhone, RawLead, DEFAULT_THRESHOLDS, ScoreThresholds } from "@/lib/verification";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const MAX_ROWS = 500;
const CONCURRENCY = 5;

// Minimal CSV parser — handles quoted fields with commas inside
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  function parseLine(line: string): string[] {
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { cells.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  }

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().trim());
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

async function processWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
  concurrency: number
) {
  const results: unknown[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function POST(req: NextRequest) {
  // Auth — same shared secret as the single-lead endpoint
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.LEAD_INGEST_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let csvText: string;

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file field found in form data" }, { status: 400 });
    }
    csvText = await file.text();
  } else {
    csvText = await req.text();
  }

  if (!csvText.trim()) {
    return NextResponse.json({ error: "Empty CSV" }, { status: 400 });
  }

  const rows = parseCSV(csvText);

  if (rows.length === 0) {
    return NextResponse.json({ error: "No data rows found in CSV" }, { status: 400 });
  }

  // Require at least email or phone column
  const hasEmail = "email" in rows[0];
  const hasPhone = "phone" in rows[0];
  if (!hasEmail && !hasPhone) {
    return NextResponse.json(
      { error: "CSV must have at least an 'email' or 'phone' column. Optional: first_name, last_name, company, source, client_id, campaign_id" },
      { status: 400 }
    );
  }

  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `CSV has ${rows.length} rows. Maximum is ${MAX_ROWS} per upload. Split into smaller batches.` },
      { status: 413 }
    );
  }

  const thresholds: ScoreThresholds = {
    verified: DEFAULT_THRESHOLDS.verified,
    flagged: DEFAULT_THRESHOLDS.flagged,
  };

  const results = await processWithConcurrency(
    rows,
    async (row) => {
      try {
        const lead: RawLead = {
          source: row.source || "csv_upload",
          first_name: row.first_name || row["first name"] || undefined,
          last_name: row.last_name || row["last name"] || undefined,
          email: row.email || undefined,
          phone: row.phone || undefined,
          company: row.company || undefined,
          client_id: row.client_id || undefined,
          campaign_id: row.campaign_id || undefined,
        };
        const outcome = await verifyLead(lead, thresholds);
        return {
          row_email: row.email || "",
          row_phone: row.phone || "",
          row_first_name: row.first_name || "",
          row_last_name: row.last_name || "",
          lead_id: outcome.lead_id,
          status: outcome.status,
          score: outcome.score,
          error: "",
        };
      } catch (err) {
        return {
          row_email: row.email || "",
          row_phone: row.phone || "",
          row_first_name: row.first_name || "",
          row_last_name: row.last_name || "",
          lead_id: "",
          status: "error",
          score: "",
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },
    CONCURRENCY
  ) as Record<string, unknown>[];

  const summary = {
    total: results.length,
    verified: results.filter((r) => r.status === "verified").length,
    flagged: results.filter((r) => r.status === "flagged").length,
    rejected: results.filter((r) => r.status === "rejected").length,
    duplicate: results.filter((r) => r.status === "duplicate").length,
    errors: results.filter((r) => r.status === "error").length,
  };

  // Return a downloadable results CSV
  const csvOut = toCSV(results);
  return new NextResponse(csvOut, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="lead-verification-results.csv"`,
      "X-Summary": JSON.stringify(summary),
    },
  });
}
