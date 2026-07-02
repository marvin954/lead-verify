// app/api/validate-phone/bulk/route.ts
// Same 500-row-per-upload limit as the single-tenant version, same
// reasoning (Vercel function timeout). Now account-aware: quota is
// checked/consumed per row, so a CSV can partially process and stop once
// the account runs out of allotment+credits mid-batch — the response CSV
// will show which rows got billed and which were blocked.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { resolveApiKey } from "@/lib/apiAuth";
import { processLeadsWithConcurrency, LeadInput } from "@/lib/processLead";

const MAX_ROWS = 500;
const CONCURRENCY = 5;

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
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ",") {
          cells.push(cur);
          cur = "";
        } else cur += ch;
      }
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  }

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const account = await resolveApiKey(req.headers.get("authorization"));
  if (!account) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
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
    return NextResponse.json({ error: "CSV had no data rows" }, { status: 400 });
  }
  if (!("phone" in rows[0])) {
    return NextResponse.json(
      { error: "CSV must have a 'phone' column header. Optional: 'lead_source', 'crm_record_id'." },
      { status: 400 }
    );
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      {
        error: `CSV has ${rows.length} rows, which exceeds the ${MAX_ROWS}-row limit for a single upload. Split the file into smaller batches.`,
      },
      { status: 413 }
    );
  }

  const leads: LeadInput[] = rows.map((r) => ({
    phone: r.phone,
    lead_source: r.lead_source || undefined,
    crm_record_id: r.crm_record_id || undefined,
  }));

  const results = await processLeadsWithConcurrency(account, leads, CONCURRENCY);

  const summary = {
    total: results.length,
    billed: results.filter((r) => r.billed).length,
    valid: results.filter((r) => r.billed && r.valid).length,
    invalid: results.filter((r) => r.billed && !r.valid).length,
    blocked_by_quota: results.filter((r) => !r.billed).length,
  };

  const csvOut = toCSV(
    results.map((r) => ({
      phone: r.phone,
      crm_record_id: r.crm_record_id ?? "",
      lead_source: r.lead_source ?? "",
      valid: r.valid,
      reason: r.reason ?? "",
      line_type: r.line_type ?? "",
      carrier: r.carrier ?? "",
      provider: r.provider,
      billed: r.billed,
      crm_suppression_triggered: r.crm_suppression_triggered,
      error: r.error ?? "",
    }))
  );

  return new NextResponse(csvOut, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="phone-validation-results.csv"`,
      "X-Validation-Summary": JSON.stringify(summary),
    },
  });
}
