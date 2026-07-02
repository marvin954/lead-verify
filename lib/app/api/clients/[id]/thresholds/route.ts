// app/api/clients/[id]/thresholds/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { updateClientThresholds } from "@/lib/dashboard-data";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { verified, flagged } = await req.json();
  if (typeof verified !== "number" || typeof flagged !== "number") {
    return NextResponse.json({ error: "verified and flagged must be numbers" }, { status: 400 });
  }
  if (flagged >= verified) {
    return NextResponse.json(
      { error: "flagged threshold must be lower than verified threshold" },
      { status: 400 }
    );
  }
  await updateClientThresholds(params.id, { verified, flagged });
  return NextResponse.json({ ok: true });
}
