// app/api/leads/[id]/review/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // TODO: replace with real dashboard auth (Supabase auth session, role check)
  const { action } = await req.json();
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const newStatus = action === "approve" ? "verified" : "rejected";

  const { error } = await supabase
    .from("leads")
    .update({ status: newStatus })
    .eq("id", params.id)
    .eq("status", "flagged"); // only allow reviewing leads still in the queue

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If approved, trigger delivery the same way the ingest route does.
  // (Wire to your deliverToClient() implementation.)

  return NextResponse.json({ status: newStatus });
}
