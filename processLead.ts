// lib/processLead.ts
// The full pipeline for one lead, now billing-aware:
//   1. Reserve quota (atomic — allotment first, then credits)
//   2. Validate the phone with the account's provider/credentials
//   3. If the provider call itself failed (infra error), refund the
//      reservation — no charge for a lookup that didn't complete
//   4. Log to phone_validation_log (scoped to the account)
//   5. Fire CRM suppression if invalid and the account has a webhook set
//   6. Record the usage_ledger entry

import { createClient } from "@supabase/supabase-js";
import { validatePhone, normalizePhone } from "./validatePhone";
import { reserveQuota, refundQuota, recordUsage } from "./usage";
import type { Account } from "./apiAuth";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface LeadInput {
  phone: string;
  lead_source?: string;
  crm_record_id?: string;
}

export interface LeadResult {
  phone: string;
  crm_record_id: string | null;
  lead_source: string | null;
  valid: boolean;
  reason: string | null;
  line_type: string | null;
  carrier: string | null;
  provider: string;
  crm_suppression_triggered: boolean;
  billed: boolean; // false when quota_exhausted / subscription_inactive blocked it
  error?: string;
}

export async function processLead(account: Account, lead: LeadInput): Promise<LeadResult> {
  const base = {
    phone: lead.phone ?? "",
    crm_record_id: lead.crm_record_id ?? null,
    lead_source: lead.lead_source ?? null,
    provider: account.phone_provider,
  };

  if (!lead.phone) {
    return {
      ...base,
      valid: false,
      reason: "missing_phone",
      line_type: null,
      carrier: null,
      crm_suppression_triggered: false,
      billed: false,
      error: "phone field was empty",
    };
  }

  // --- Step 1: reserve quota ---
  const reservation = await reserveQuota(account);
  if (!reservation.reserved) {
    return {
      ...base,
      valid: false,
      reason: null,
      line_type: null,
      carrier: null,
      crm_suppression_triggered: false,
      billed: false,
      error:
        reservation.reason === "subscription_inactive"
          ? "Subscription is not active — update billing to resume validations"
          : "Monthly allotment and credit balance are both exhausted — buy more credits or upgrade your plan",
    };
  }

  // --- Step 2: validate ---
  let result;
  try {
    result = await validatePhone(lead.phone, {
      provider: account.phone_provider,
      twilioAccountSid: account.twilio_account_sid,
      twilioAuthToken: account.twilio_auth_token,
      numverifyApiKey: account.numverify_api_key,
    });
  } catch (err) {
    // --- Step 3: refund — this was a provider infra failure, not a result ---
    await refundQuota(account.id, reservation.source!);
    const message = err instanceof Error ? err.message : "Validation failed";
    await supabase.from("phone_validation_log").insert({
      account_id: account.id,
      phone_raw: lead.phone,
      phone_normalized: normalizePhone(lead.phone),
      lead_source: lead.lead_source ?? null,
      crm_record_id: lead.crm_record_id ?? null,
      valid: false,
      reason: "validation_error",
      provider: account.phone_provider,
      raw_response: { error: message },
    });
    return {
      ...base,
      valid: false,
      reason: "validation_error",
      line_type: null,
      carrier: null,
      crm_suppression_triggered: false,
      billed: false,
      error: message,
    };
  }

  // --- Step 4: log ---
  const { data: logRow } = await supabase
    .from("phone_validation_log")
    .insert({
      account_id: account.id,
      phone_raw: lead.phone,
      phone_normalized: normalizePhone(lead.phone),
      lead_source: lead.lead_source ?? null,
      crm_record_id: lead.crm_record_id ?? null,
      valid: result.valid,
      reason: result.reason,
      line_type: result.line_type,
      carrier: result.carrier,
      provider: result.provider,
      raw_response: result.raw,
    })
    .select("id")
    .single();

  // --- Step 5: CRM suppression ---
  let crmTriggered = false;
  if (result.valid === false && account.crm_webhook_url) {
    crmTriggered = true;
    try {
      const crmRes = await fetch(account.crm_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crm_record_id: lead.crm_record_id ?? null,
          phone: lead.phone,
          phone_normalized: normalizePhone(lead.phone),
          status: "Junk / Disconnected",
          validation_result: result.reason,
          line_type: result.line_type,
          carrier: result.carrier,
          provider: result.provider,
        }),
      });
      if (logRow) {
        await supabase
          .from("phone_validation_log")
          .update({
            crm_webhook_status: crmRes.status,
            crm_webhook_error: crmRes.ok ? null : `CRM webhook returned ${crmRes.status}`,
          })
          .eq("id", logRow.id);
      }
    } catch (err) {
      if (logRow) {
        await supabase
          .from("phone_validation_log")
          .update({ crm_webhook_error: err instanceof Error ? err.message : "CRM webhook failed" })
          .eq("id", logRow.id);
      }
    }
  }

  // --- Step 6: record billed usage ---
  await recordUsage(account.id, reservation.source!, logRow?.id ?? null);

  return {
    ...base,
    valid: result.valid,
    reason: result.reason,
    line_type: result.line_type,
    carrier: result.carrier,
    crm_suppression_triggered: crmTriggered,
    billed: true,
  };
}

export async function processLeadsWithConcurrency(
  account: Account,
  leads: LeadInput[],
  concurrency = 5
): Promise<LeadResult[]> {
  const results: LeadResult[] = new Array(leads.length);
  let cursor = 0;

  async function worker() {
    while (cursor < leads.length) {
      const i = cursor++;
      results[i] = await processLead(account, leads[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, leads.length) }, worker));
  return results;
}
