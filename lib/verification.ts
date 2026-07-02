// lib/verification.ts
// Core verification engine. Framework-agnostic — call from an API route,
// n8n webhook handler, or a queue worker.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side only, never expose client-side
);

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export interface RawLead {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  source: string;
  client_id?: string;
  campaign_id?: string;
  ip_address?: string;
  user_agent?: string;
  form_fill_time_ms?: number;
  honeypot_field?: string; // should always be empty; non-empty = bot
  raw_payload?: Record<string, unknown>;
}

export interface CheckResult {
  check_type: string;
  passed: boolean;
  weight: number;
  detail?: Record<string, unknown>;
  provider?: string;
}

// ------------------------------------------------------------------
// Score thresholds — configurable per deployment or per client tier.
// Override via env vars so you can tune without a code deploy, or pass
// a `thresholds` override into verifyLead() for per-client SLAs.
// ------------------------------------------------------------------
export interface ScoreThresholds {
  verified: number; // score >= this → auto-deliver
  flagged: number;  // score >= this (but < verified) → human review queue
  // anything below `flagged` → rejected
}

export const DEFAULT_THRESHOLDS: ScoreThresholds = {
  verified: Number(process.env.LEAD_THRESHOLD_VERIFIED ?? 65),
  flagged: Number(process.env.LEAD_THRESHOLD_FLAGGED ?? 30),
};

// ------------------------------------------------------------------
// Scoring weights — tune these based on what actually predicts
// client chargebacks / disputes over time
// ------------------------------------------------------------------
const WEIGHTS = {
  email_format_pass: 10,
  email_format_fail: -50, // hard fail, effectively disqualifying
  email_mx_pass: 10,
  email_mx_fail: -30,
  email_disposable_fail: -40,
  email_deliverability_pass: 15,
  email_deliverability_risky: -10,
  email_deliverability_fail: -40,
  phone_format_pass: 10,
  phone_format_fail: -30,
  phone_voip_penalty: -15,
  phone_line_valid: 10,
  hlr_live: 15,
  hlr_disconnected: -50,
  hlr_unreachable: -25,
  duplicate_exact: -100, // auto-reject
  duplicate_fuzzy: -20,
  honeypot_triggered: -100, // auto-reject, bot
  fast_fill_suspicious: -25, // filled in < 2s, likely bot
  ip_country_mismatch: -10,
  suppression_hit: -100,
};

// ------------------------------------------------------------------
// Individual checks
// ------------------------------------------------------------------

export function checkEmailFormat(email?: string): CheckResult {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const passed = !!email && re.test(email);
  return {
    check_type: "email_format",
    passed,
    weight: passed ? WEIGHTS.email_format_pass : WEIGHTS.email_format_fail,
  };
}

// Common disposable/temp-mail domains. Extend this list or swap for a
// maintained API (e.g. Kickbox, ZeroBounce) for production use.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com",
  "throwawaymail.com", "yopmail.com", "trashmail.com", "fakeinbox.com",
  "getnada.com", "sharklasers.com",
]);

export function checkDisposableEmail(email?: string): CheckResult {
  if (!email) return { check_type: "email_disposable", passed: false, weight: 0 };
  const domain = email.split("@")[1]?.toLowerCase();
  const isDisposable = domain ? DISPOSABLE_DOMAINS.has(domain) : false;
  return {
    check_type: "email_disposable",
    passed: !isDisposable,
    weight: isDisposable ? WEIGHTS.email_disposable_fail : 0,
    detail: { domain },
  };
}

// MX record lookup — requires a DNS-capable environment (Node API route, not edge)
export async function checkEmailMX(email?: string): Promise<CheckResult> {
  if (!email) return { check_type: "email_mx", passed: false, weight: 0 };
  const domain = email.split("@")[1];
  try {
    const dns = await import("node:dns/promises");
    const records = await dns.resolveMx(domain);
    const passed = records.length > 0;
    return {
      check_type: "email_mx",
      passed,
      weight: passed ? WEIGHTS.email_mx_pass : WEIGHTS.email_mx_fail,
      detail: { mx_count: records.length },
    };
  } catch {
    return { check_type: "email_mx", passed: false, weight: WEIGHTS.email_mx_fail };
  }
}

// Kickbox email deliverability check — called directly, no fallback skip.
// This is the single highest-leverage check for lead-gen because it catches
// typo'd/fake-but-well-formatted emails that pass format + MX checks.
export async function checkEmailDeliverability(email?: string): Promise<CheckResult> {
  if (!email) return { check_type: "email_deliverability", passed: false, weight: 0 };
  if (!process.env.KICKBOX_API_KEY) {
    throw new Error("KICKBOX_API_KEY is not set — required for email deliverability checks");
  }

  const res = await fetch(
    `https://api.kickbox.com/v2/verify?email=${encodeURIComponent(email)}&apikey=${process.env.KICKBOX_API_KEY}`
  );
  if (!res.ok) {
    throw new Error(`Kickbox API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const result = data.result as "deliverable" | "undeliverable" | "risky" | "unknown";

  let weight = 0;
  if (result === "deliverable") weight = WEIGHTS.email_deliverability_pass;
  else if (result === "risky") weight = WEIGHTS.email_deliverability_risky;
  else if (result === "undeliverable") weight = WEIGHTS.email_deliverability_fail;

  return {
    check_type: "email_deliverability",
    passed: result !== "undeliverable",
    weight,
    detail: data,
    provider: "kickbox",
  };
}

export function normalizePhone(phone?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+")) return phone;
  return null;
}

export function checkPhoneFormat(phone?: string): CheckResult {
  const normalized = normalizePhone(phone);
  const passed = !!normalized;
  return {
    check_type: "phone_format",
    passed,
    weight: passed ? WEIGHTS.phone_format_pass : WEIGHTS.phone_format_fail,
    detail: { normalized },
  };
}

// Twilio Lookup v2 — line-type intelligence (mobile/landline/VOIP), called directly.
export async function checkPhoneLineType(phone?: string): Promise<CheckResult> {
  const normalized = normalizePhone(phone);
  if (!normalized) return { check_type: "phone_type", passed: false, weight: 0 };
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set — required for phone line-type checks");
  }

  const auth = Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
  ).toString("base64");
  const res = await fetch(
    `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(normalized)}?Fields=line_type_intelligence`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  if (!res.ok) {
    throw new Error(`Twilio Lookup API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const lineType = data?.line_type_intelligence?.type as string | undefined;
  const isVoip = lineType === "nonFixedVoip" || lineType === "voip";

  return {
    check_type: "phone_type",
    passed: !isVoip,
    weight: isVoip ? WEIGHTS.phone_voip_penalty : WEIGHTS.phone_line_valid,
    detail: { line_type: lineType },
    provider: "twilio_lookup",
  };
}

// HLR (Home Location Register) lookup — queries the telecom network directly
// for real-time reachability: is the number live, switched off, disconnected,
// or an unassigned/temporary VoIP line. This is distinct from Twilio's
// line-type check above — a number can be a real mobile line (passes
// phone_type) but be disconnected right now (fails HLR).
//
// Default provider: IPQualityScore (IPQS) Phone Validation API — chosen
// because it returns HLR-backed reachability ("active"/"active_status")
// and VOIP detection in a single call, has solid docs, and is a common
// choice for exactly this lead-gen data-hygiene use case. Swap the fetch
// URL/parsing below if you move to a different HLR vendor (e.g.
// hlr-lookups.com, NeutrinoAPI, 1Lookup) — the response shape varies by
// provider. Called directly, no fallback skip.
export async function checkHLR(phone?: string): Promise<CheckResult> {
  const normalized = normalizePhone(phone);
  if (!normalized) return { check_type: "phone_hlr", passed: false, weight: 0 };
  if (!process.env.IPQS_API_KEY) {
    throw new Error("IPQS_API_KEY is not set — required for HLR reachability checks");
  }

  const res = await fetch(
    `https://ipqualityscore.com/api/json/phone/${process.env.IPQS_API_KEY}/${encodeURIComponent(normalized)}`
  );
  if (!res.ok) {
    throw new Error(`IPQS API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  if (data.success === false) {
    throw new Error(`IPQS API returned error: ${data.message ?? "unknown error"}`);
  }

  // IPQS response fields used here: valid, active (HLR-backed reachability),
  // active_status ("Active"/"Inactive"/"N/A" depending on plan tier), VOIP.
  const isValid = !!data.valid;
  const isActive = data.active === true;
  const isVoip = data.VOIP === true;

  let hlrStatus: "live" | "disconnected" | "unreachable" | "unknown";
  if (!isValid) hlrStatus = "disconnected";
  else if (isActive) hlrStatus = "live";
  else if (data.active === false) hlrStatus = "unreachable"; // valid number, not currently active
  else hlrStatus = "unknown"; // active status unavailable on current plan tier

  let weight = 0;
  if (hlrStatus === "live") weight = WEIGHTS.hlr_live;
  else if (hlrStatus === "disconnected") weight = WEIGHTS.hlr_disconnected;
  else if (hlrStatus === "unreachable") weight = WEIGHTS.hlr_unreachable;

  return {
    check_type: "phone_hlr",
    passed: hlrStatus !== "disconnected",
    weight,
    detail: {
      hlr_status: hlrStatus,
      valid: isValid,
      active: data.active,
      voip: isVoip,
      line_type: data.line_type,
      carrier: data.carrier,
      fraud_score: data.fraud_score,
    },
    provider: "ipqs",
  };
}

export function checkHoneypot(honeypotValue?: string): CheckResult {
  const triggered = !!honeypotValue && honeypotValue.trim().length > 0;
  return {
    check_type: "honeypot",
    passed: !triggered,
    weight: triggered ? WEIGHTS.honeypot_triggered : 0,
  };
}
export function checkFormFillSpeed(ms?: number): CheckResult {
  if (ms == null) return { check_type: "form_fill_speed", passed: true, weight: 0 };
  const suspicious = ms < 2000; // filled in under 2 seconds
  return {
    check_type: "form_fill_speed",
    passed: !suspicious,
    weight: suspicious ? WEIGHTS.fast_fill_suspicious : 0,
    detail: { fill_time_ms: ms },
  };
}

export async function checkSuppressionList(
  email?: string,
  phone?: string
): Promise<CheckResult> {
  const values = [email, normalizePhone(phone || undefined)].filter(Boolean) as string[];
  if (values.length === 0) return { check_type: "suppression", passed: true, weight: 0 };

  const { data } = await supabase
    .from("suppression_list")
    .select("value, value_type, reason")
    .in("value", values);

  const hit = data && data.length > 0;
  return {
    check_type: "suppression",
    passed: !hit,
    weight: hit ? WEIGHTS.suppression_hit : 0,
    detail: hit ? { matches: data } : undefined,
  } as CheckResult;
}

// Exact duplicate check against existing leads table
export async function checkDuplicates(
  email?: string,
  phone?: string,
  clientId?: string
): Promise<CheckResult> {
  const emailNorm = email?.toLowerCase().trim();
  const phoneNorm = normalizePhone(phone);

  let query = supabase.from("leads").select("id, email_normalized, phone_normalized, created_at");
  if (clientId) query = query.eq("client_id", clientId);

  const orParts: string[] = [];
  if (emailNorm) orParts.push(`email_normalized.eq.${emailNorm}`);
  if (phoneNorm) orParts.push(`phone_normalized.eq.${phoneNorm}`);
  if (orParts.length === 0) return { check_type: "duplicate_exact", passed: true, weight: 0 };

  const { data } = await query.or(orParts.join(","));
  const isDup = !!data && data.length > 0;
  return {
    check_type: "duplicate_exact",
    passed: !isDup,
    weight: isDup ? WEIGHTS.duplicate_exact : 0,
    detail: isDup ? { matches: data } : undefined,
  };
}

// ------------------------------------------------------------------
// Orchestrator
// ------------------------------------------------------------------
export interface VerificationOutcome {
  lead_id: string;
  status: "verified" | "flagged" | "rejected" | "duplicate";
  score: number;
  checks: CheckResult[];
  thresholds_applied: ScoreThresholds;
  breakdown: {
    base_score: number;
    total_adjustment: number;
    final_score: number;
    contributions: { check_type: string; passed: boolean; weight: number }[];
  };
}

export async function verifyLead(
  raw: RawLead,
  thresholds: ScoreThresholds = DEFAULT_THRESHOLDS
): Promise<VerificationOutcome> {
  // 1. Insert the raw lead first so we always have an audit trail,
  //    even for leads that get rejected.
  const emailNorm = raw.email?.toLowerCase().trim();
  const phoneNorm = normalizePhone(raw.phone);

  const { data: inserted, error } = await supabase
    .from("leads")
    .insert({
      first_name: raw.first_name,
      last_name: raw.last_name,
      email: raw.email,
      phone: raw.phone,
      company: raw.company,
      source: raw.source,
      client_id: raw.client_id,
      campaign_id: raw.campaign_id,
      ip_address: raw.ip_address,
      user_agent: raw.user_agent,
      form_fill_time_ms: raw.form_fill_time_ms,
      raw_payload: raw.raw_payload ?? raw,
      email_normalized: emailNorm,
      phone_normalized: phoneNorm,
      status: "verifying",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(`Failed to insert lead: ${error?.message}`);
  }
  const leadId = inserted.id as string;

  // 2. Run all checks. Fast/local checks run synchronously in parallel
  //    with slower external API checks.
  const checks: CheckResult[] = await Promise.all([
    Promise.resolve(checkEmailFormat(raw.email)),
    Promise.resolve(checkDisposableEmail(raw.email)),
    checkEmailMX(raw.email),
    checkEmailDeliverability(raw.email),
    Promise.resolve(checkPhoneFormat(raw.phone)),
    checkPhoneLineType(raw.phone),
    checkHLR(raw.phone),
    Promise.resolve(checkHoneypot(raw.honeypot_field)),
    Promise.resolve(checkFormFillSpeed(raw.form_fill_time_ms)),
    checkSuppressionList(raw.email, raw.phone),
    checkDuplicates(raw.email, raw.phone, raw.client_id),
  ]);

  // 3. Persist every check for audit/debugging.
  await supabase.from("verification_checks").insert(
    checks.map((c) => ({ ...c, lead_id: leadId }))
  );

  // 4. Compute composite score (clamped 0-100), with a full breakdown
  //    of what contributed — this is what you show a client during a
  //    dispute, or use to retune weights later.
  const BASE_SCORE = 50;
  const totalAdjustment = checks.reduce((sum, c) => sum + c.weight, 0);
  const rawScore = BASE_SCORE + totalAdjustment;
  const score = Math.max(0, Math.min(100, rawScore));

  const breakdown = {
    base_score: BASE_SCORE,
    total_adjustment: totalAdjustment,
    final_score: score,
    contributions: checks.map((c) => ({
      check_type: c.check_type,
      passed: c.passed,
      weight: c.weight,
    })),
  };

  // 5. Determine final status against the supplied (or default) thresholds.
  const hardFail = checks.some(
    (c) =>
      (c.check_type === "honeypot" && !c.passed) ||
      (c.check_type === "duplicate_exact" && !c.passed) ||
      (c.check_type === "suppression" && !c.passed)
  );

  let status: VerificationOutcome["status"];
  if (checks.find((c) => c.check_type === "duplicate_exact" && !c.passed)) {
    status = "duplicate";
  } else if (hardFail || score < thresholds.flagged) {
    status = "rejected";
  } else if (score < thresholds.verified) {
    status = "flagged"; // needs human review before client delivery
  } else {
    status = "verified";
  }

  await supabase
    .from("leads")
    .update({ status, score, verified_at: new Date().toISOString() })
    .eq("id", leadId);

  return { lead_id: leadId, status, score, checks, thresholds_applied: thresholds, breakdown };
}
