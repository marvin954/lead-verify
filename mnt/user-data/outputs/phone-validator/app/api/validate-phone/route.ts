// app/api/validate-phone/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { resolveApiKey } from "@/lib/apiAuth";
import { processLead } from "@/lib/processLead";

export async function POST(req: NextRequest) {
  const account = await resolveApiKey(req.headers.get("authorization"));
  if (!account) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  let body: { phone?: string; lead_source?: string; crm_record_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  const result = await processLead(account, {
    phone: body.phone,
    lead_source: body.lead_source,
    crm_record_id: body.crm_record_id,
  });

  if (!result.billed) {
    // 402 Payment Required — the accurate HTTP status for "quota/billing
    // problem", distinct from a validation failure (which is a 200 with
    // valid: false) or an auth failure (401).
    return NextResponse.json({ error: result.error }, { status: 402 });
  }

  return NextResponse.json(result);
}
