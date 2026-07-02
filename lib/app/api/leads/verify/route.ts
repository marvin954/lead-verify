// app/api/leads/verify/route.ts
// Mammba Verify — POST endpoint that receives a raw lead from a webform,
// ad platform webhook, or n8n, runs it through verification, and returns
// the outcome + full scoring breakdown.
//
// Use the Node runtime, not edge — MX lookups need node:dns.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyLead, RawLead, DEFAULT_THRESHOLDS, ScoreThresholds } from "@/lib/verification";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  // Simple shared-secret auth for server-to-server calls (n8n, ad platform
  // webhooks, or a client's own integration). Swap for per-client API keys
  // if Mammba Verify is sold as a standalone product with multiple tenants.
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

  // Capture IP for velocity/geo checks if not already provided
  if (!body.ip_address) {
    body.ip_address =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  }

  // Threshold priority: per-request override > per-client default > system default.
  let clientThresholds: Partial<ScoreThresholds> = {};
  if (body.client_id) {
    const { data: client } = await supabase
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

    // Only forward verified leads downstream (e.g. to client webhook/CRM).
    // Flagged leads sit for manual review; rejected/duplicate are logged only.
    if (outcome.status === "verified" && body.client_id) {
      // fire-and-forget delivery — don't block the response on it
      deliverToClient(outcome.lead_id, body.client_id).catch((err) =>
        console.error("Delivery failed:", err)
      );
    }

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

// Stub — wire this to each client's actual delivery method (webhook, CRM API, etc.)
async function deliverToClient(leadId: string, clientId: string) {
  // e.g. look up client's webhook URL from a `clients` table, POST the lead,
  // then insert a row into client_delivery_log with the response status.
}
