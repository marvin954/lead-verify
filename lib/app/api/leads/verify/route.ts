export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyLead, RawLead, DEFAULT_THRESHOLDS, ScoreThresholds } from "@/lib/verification";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.LEAD_INGEST_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RawLead & { thresholds?: Partial<ScoreThresholds> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.source) {
    return NextResponse.json({ error: "source is required" }, { status: 400 });
  }
  if (!body.email && !body.phone) {
    return NextResponse.json(
      { error: "At least one of email or phone is required" },
      { status: 400 }
    );
  }

  if (!body.ip_address) {
    body.ip_address =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  }

  let clientThresholds: Partial<ScoreThresholds> = {};
  if (body.client_id) {
    const { data: client } = await getSupabase()
      .from("clients")
      .select("threshold_verified, threshold_flagged")
      .eq("id", body.client_id)
      .single();
    if (client) {
      clientThresholds = {
        verified: client.threshold_verified ?? undefined,
        flagged: client.threshold_flagged ?? undefined,
      };
    }
  }

  const thresholds: ScoreThresholds = {
    verified: body.thresholds?.verified ?? clientThresholds.verified ?? DEFAULT_THRESHOLDS.verified,
    flagged: body.thresholds?.flagged ?? clientThresholds.flagged ?? DEFAULT_THRESHOLDS.flagged,
  };
  delete body.thresholds;

  try {
    const outcome = await verifyLead(body, thresholds);
    return NextResponse.json(outcome, {
      status: outcome.status === "rejected" ? 422 : 200,
    });
  } catch (err) {
    console.error("Verification error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed" },
      { status: 500 }
    );
  }
}
