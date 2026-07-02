// lib/dashboard-data.ts
// Server-side data access for the dashboard. Queries the same Supabase
// tables the verification engine writes to (leads, verification_checks,
// clients). Call these from Server Components — no client-side Supabase
// key exposure needed.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

// Returns null when Supabase env vars are not configured, so callers can
// fall back to empty data instead of throwing "supabaseUrl is required".
function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  if (!_supabase) {
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export type LeadStatus = "pending" | "verifying" | "verified" | "flagged" | "rejected" | "duplicate";

export interface LeadRow {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string;
  client_id: string | null;
  client_name?: string;
  status: LeadStatus;
  score: number | null;
}

export interface DashboardStats {
  total_today: number;
  verified_today: number;
  flagged_today: number;
  rejected_today: number;
  duplicate_today: number;
  avg_score_today: number | null;
  verified_rate_7d: number | null; // % verified over last 7 days
}

// ------------------------------------------------------------------
// Stats for the top-of-dashboard summary cards
// ------------------------------------------------------------------
export async function getDashboardStats(clientId?: string): Promise<DashboardStats> {
  const emptyStats: DashboardStats = {
    total_today: 0,
    verified_today: 0,
    flagged_today: 0,
    rejected_today: 0,
    duplicate_today: 0,
    avg_score_today: null,
    verified_rate_7d: null,
  };

  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const supabase = getSupabase();
  if (!supabase) return emptyStats;

  let query = supabase
    .from("leads")
    .select("status, score", { count: "exact" })
    .gte("created_at", since.toISOString());
  if (clientId) query = query.eq("client_id", clientId);

  const { data } = await query;
  const rows = data ?? [];

  const total_today = rows.length;
  const verified_today = rows.filter((r) => r.status === "verified").length;
  const flagged_today = rows.filter((r) => r.status === "flagged").length;
  const rejected_today = rows.filter((r) => r.status === "rejected").length;
  const duplicate_today = rows.filter((r) => r.status === "duplicate").length;
  const scored = rows.filter((r) => r.score != null);
  const avg_score_today =
    scored.length > 0
      ? Math.round(scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length)
      : null;

  // 7-day verified rate for trend context
  const since7d = new Date();
  since7d.setDate(since7d.getDate() - 7);
  let q7 = supabase
    .from("leads")
    .select("status")
    .gte("created_at", since7d.toISOString());
  if (clientId) q7 = q7.eq("client_id", clientId);
  const { data: last7 } = await q7;
  const verified_rate_7d =
    last7 && last7.length > 0
      ? Math.round((last7.filter((r) => r.status === "verified").length / last7.length) * 100)
      : null;

  return {
    total_today,
    verified_today,
    flagged_today,
    rejected_today,
    duplicate_today,
    avg_score_today,
    verified_rate_7d,
  };
}

// ------------------------------------------------------------------
// Leads table — filterable, paginated
// ------------------------------------------------------------------
export interface LeadsFilter {
  status?: LeadStatus | "all";
  clientId?: string;
  search?: string; // matches email, phone, name
  page?: number;
  pageSize?: number;
}

export async function getLeads(filter: LeadsFilter = {}): Promise<{ rows: LeadRow[]; total: number }> {
  const { status = "all", clientId, search, page = 1, pageSize = 25 } = filter;

  const supabase = getSupabase();
  if (!supabase) return { rows: [], total: 0 };

  let query = supabase
    .from("leads")
    .select("id, created_at, first_name, last_name, email, phone, company, source, client_id, status, score, clients(name)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (status !== "all") query = query.eq("status", status);
  if (clientId) query = query.eq("client_id", clientId);
  if (search) {
    query = query.or(
      `email.ilike.%${search}%,phone.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
    );
  }

  const { data, count } = await query;

  const rows: LeadRow[] = (data ?? []).map((r: any) => ({
    ...r,
    client_name: r.clients?.name,
  }));

  return { rows, total: count ?? 0 };
}

// ------------------------------------------------------------------
// Single lead + its full verification breakdown, for the detail panel
// ------------------------------------------------------------------
export interface CheckRow {
  check_type: string;
  passed: boolean;
  weight: number;
  detail: Record<string, unknown> | null;
  provider: string | null;
}

export interface LeadDetail extends LeadRow {
  ip_address: string | null;
  form_fill_time_ms: number | null;
  raw_payload: Record<string, unknown> | null;
  thresholds_applied?: { verified: number; flagged: number };
  checks: CheckRow[];
}

export async function getLeadDetail(leadId: string): Promise<LeadDetail | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: lead } = await supabase
    .from("leads")
    .select("*, clients(name, threshold_verified, threshold_flagged)")
    .eq("id", leadId)
    .single();
  if (!lead) return null;

  const { data: checks } = await supabase
    .from("verification_checks")
    .select("check_type, passed, weight, detail, provider")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  return {
    ...lead,
    client_name: lead.clients?.name,
    thresholds_applied: {
      verified: lead.clients?.threshold_verified ?? Number(process.env.LEAD_THRESHOLD_VERIFIED ?? 65),
      flagged: lead.clients?.threshold_flagged ?? Number(process.env.LEAD_THRESHOLD_FLAGGED ?? 30),
    },
    checks: checks ?? [],
  };
}

// ------------------------------------------------------------------
// Client list — for the client filter dropdown and settings page
// ------------------------------------------------------------------
export async function getClients() {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data } = await supabase
    .from("clients")
    .select("id, name, active, threshold_verified, threshold_flagged, webhook_url")
    .order("name", { ascending: true });
  return data ?? [];
}

export async function updateClientThresholds(
  clientId: string,
  thresholds: { verified?: number; flagged?: number }
) {
  const supabase = getSupabase();
  if (!supabase) return;

  await supabase
    .from("clients")
    .update({
      threshold_verified: thresholds.verified,
      threshold_flagged: thresholds.flagged,
    })
    .eq("id", clientId);
}

// ------------------------------------------------------------------
// Suppression list — known-bad emails/phones/domains/IPs
// ------------------------------------------------------------------
export type SuppressionType = "email" | "phone" | "domain" | "ip";

export interface SuppressionRow {
  id: string;
  created_at: string;
  value: string;
  value_type: SuppressionType;
  reason: string | null;
  added_by: string | null;
}

export async function getSuppressionList(): Promise<SuppressionRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data } = await supabase
    .from("suppression_list")
    .select("id, created_at, value, value_type, reason, added_by")
    .order("created_at", { ascending: false });
  return (data ?? []) as SuppressionRow[];
}

export async function addSuppressionEntry(entry: {
  value: string;
  value_type: SuppressionType;
  reason?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Database not configured." };

  const { error } = await supabase.from("suppression_list").insert({
    value: entry.value.trim().toLowerCase(),
    value_type: entry.value_type,
    reason: entry.reason?.trim() || null,
    added_by: "dashboard",
  });

  if (error) {
    // Unique index violation → already suppressed
    if (error.code === "23505") return { ok: false, error: "That value is already suppressed." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeSuppressionEntry(id: string): Promise<{ ok: boolean }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false };

  await supabase.from("suppression_list").delete().eq("id", id);
  return { ok: true };
}
