# Phone Validator (SaaS)

Multi-tenant phone validation API. Each customer signs up, gets an API
key, and validates phone numbers against Twilio Lookup or NumVerify —
billed on a subscription with a monthly lookup allotment, plus pay-as-you-
go credits for overage.

Still phone-only (no email logic), still implements the 4-step blueprint
(Intake Catch → Validate → Filter → CRM Suppression) per lookup — that
part hasn't changed. What's new is everything around it: accounts, API
keys, quota enforcement, and Stripe billing.

## Architecture

```
sql/phone_validation_log.sql   — run FIRST: base audit log table
sql/saas_schema.sql            — run SECOND: accounts, api_keys, usage_ledger,
                                  credit_purchases, quota functions, and
                                  the account_id column added to
                                  phone_validation_log

lib/plans.ts                   — plan + credit pack definitions (pricing,
                                  allotments, Stripe price IDs)
lib/apiAuth.ts                 — API key generation + resolution
lib/usage.ts                   — atomic quota reservation/refund
lib/validatePhone.ts           — Twilio/NumVerify calls, now takes
                                  credentials as params (per-account)
lib/processLead.ts             — the full per-lead pipeline: reserve →
                                  validate → refund-on-failure → log →
                                  suppress → record usage
lib/stripe.ts                  — Stripe client + customer provisioning
lib/currentAccount.ts          — ⚠️ STUB, see below

app/api/validate-phone/route.ts        — single-lead endpoint, API-key auth
app/api/validate-phone/bulk/route.ts   — CSV bulk endpoint, same auth
app/api/validate-phone/export/route.ts — account-scoped junk-lead CSV export

app/api/billing/checkout/route.ts         — Stripe Checkout for subscriptions
app/api/billing/checkout-credits/route.ts — Stripe Checkout for credit packs
app/api/billing/webhook/route.ts          — source of truth for billing state

app/api/api-keys/route.ts              — list/create API keys
app/api/api-keys/[id]/revoke/route.ts  — revoke a key
app/api/account/settings/route.ts      — save provider + CRM webhook config

app/dashboard/page.tsx           — usage overview
app/dashboard/billing/page.tsx   — plan + credit pack selection
app/dashboard/api-keys/page.tsx  — key management
app/dashboard/settings/page.tsx  — provider + CRM webhook config
```

## ⚠️ Before this touches a real customer

**`lib/currentAccount.ts` is a stub.** It reads a plain cookie, not a real
session. Every dashboard page and every `/api/billing/*` and
`/api/account/*` route currently trusts whatever `account_id` is passed or
cookied — there's no verification that the browser making the request
actually owns that account. This is fine for building against locally; it
is not fine for a signed-up customer to ever see in production. Wire real
Supabase Auth (or Clerk, or whatever you pick) before inviting anyone in:

1. Add Supabase Auth (email/password or magic link — either works)
2. On signup, create the matching `accounts` row (trigger on
   `auth.users` insert, or do it in your signup API route)
3. Replace `getCurrentAccountId()` in `lib/currentAccount.ts` with a real
   session lookup
4. Add RLS policies to `accounts`/`api_keys`/`usage_ledger` matching
   `auth.uid()` to the account (the schema has commented-out example
   policies to start from)

The `/api/validate-phone/*` routes are already safe — those authenticate
by API key, not session, and an API key can only ever resolve to the one
account it was issued for.

## How billing actually works

**Quota is reserved atomically, before the provider call, not after.**
A naive "check remaining, then decrement" — even with atomic pieces —
leaves a race window where two concurrent requests can both pass the
check before either writes back. `consume_quota()` in the schema does the
check-and-decrement as one locked database statement, so concurrent
requests queue correctly instead of both slipping through.

**Order of consumption: plan allotment first, then credits.** Matches
"subscription includes a monthly allotment, credits for overage" — credits
are the overflow tank, not the primary meter.

**Refunds happen on provider infrastructure failures, not on validation
results.** If Twilio/NumVerify returns "this number is invalid" — that's
a real, billable answer to the question you asked. If the API times out
or 500s, that's not an answer, and `refundQuota()` gives the reserved unit
back so the customer isn't charged for a lookup that never completed.

**The Stripe webhook is the only source of truth for subscription state
and credit grants** — never the checkout routes themselves. `invoice.paid`
is what resets the monthly allotment, and it fires on every renewal (not
just the first payment), which is why the allotment reset lives there and
not in `checkout.session.completed`.

## Setup

0. `npm install stripe` — the only new dependency this adds.
1. Run `sql/phone_validation_log.sql`, then `sql/saas_schema.sql`, in that order.
2. Create Stripe Products/Prices for each plan and credit pack, then fill
   in the real `stripePriceId` values in `lib/plans.ts`.
3. Env vars:
   ```
   SUPABASE_URL=
   SUPABASE_SERVICE_ROLE_KEY=
   APP_URL=                        # e.g. https://phonevalidator.com, used in Stripe redirect URLs
   STRIPE_SECRET_KEY=
   STRIPE_WEBHOOK_SECRET=
   TWILIO_ACCOUNT_SID=             # fallback if an account hasn't set BYO credentials
   TWILIO_AUTH_TOKEN=
   NUMVERIFY_API_KEY=              # fallback, same idea
   ```
4. Point a Stripe webhook at `/api/billing/webhook`, subscribed to at
   minimum: `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid`.
5. Wire real auth (see the warning above) before letting anyone sign up.

## Provider credentials: pooled vs. BYO

Every account has `twilio_account_sid` / `twilio_auth_token` /
`numverify_api_key` columns, but they're optional — if empty,
`validatePhone()` falls back to your own `TWILIO_ACCOUNT_SID` /
`TWILIO_AUTH_TOKEN` / `NUMVERIFY_API_KEY` env vars. That means you can run
this as a **pooled** service (you pay Twilio/NumVerify, customers pay you
a marked-up per-lookup rate through the plan pricing) without any customer
ever needing their own provider account. The BYO columns exist for a
customer who wants to use their own Twilio account instead — the settings
page doesn't currently expose fields to set those, since pooled is almost
certainly the right default; add that form only if a customer actually
asks.

## Request example (unchanged from single-tenant, now needs an API key)

```bash
curl -X POST https://your-deploy.vercel.app/api/validate-phone \
  -H "Authorization: Bearer pv_live_..." \
  -H "Content-Type: application/json" \
  -d '{"phone": "3055551234", "lead_source": "vendor_x", "crm_record_id": "contact_001"}'
```

```json
{
  "valid": false,
  "reason": "voip",
  "line_type": "nonFixedVoip",
  "carrier": "Bandwidth.com",
  "provider": "twilio",
  "crm_suppression_triggered": true,
  "billed": true
}
```

If quota is exhausted:
```json
{ "error": "Monthly allotment and credit balance are both exhausted — buy more credits or upgrade your plan" }
```
returned with HTTP 402.

## CSV bulk upload — unchanged behavior, now account + quota-aware

Same 500-row cap and same reasoning as before (Vercel function timeout).
The difference: each row now consumes real quota, so a CSV can partially
process and stop mid-batch if the account runs out — the response CSV
includes a `billed` column per row so you can see exactly which rows
completed and which were blocked, and re-upload just the blocked rows
after topping up.

## What's still not built

- **Real auth** (see the warning above — this is the actual blocker, not
  a nice-to-have)
- **Email receipts/invoices** — Stripe sends its own by default, which is
  probably fine to start
- **Usage alerts** — nothing emails the customer at 80%/100% of allotment;
  they'd only find out via the dashboard progress bar or a failed API call
- **Team seats / multiple users per account** — one account = one owner
  right now, no invited teammates
- **A landing/marketing/signup page** — this is all dashboard-behind-auth;
  there's no public page to actually acquire a customer yet
