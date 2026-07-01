# Mammba Verify

A standalone lead verification API + dashboard. Sits in front of any
lead-gen intake (webform, ad platform webhook, n8n, CSV import) and scores
every lead before it's delivered to a paying client — so you catch
bad/fake/duplicate leads before they turn into a dispute.

Multi-tenant from the ground up: each of your clients is a row in `clients`
with their own delivery webhook and optional custom score thresholds.

## What it checks

| Check | Catches | Weight |
|---|---|---|
| Email format | Malformed addresses | hard fail |
| Email disposable domain | Mailinator, Guerrilla Mail, etc. | -40 |
| Email MX record | Domains that can't receive mail | -30 |
| Email deliverability — **Kickbox (direct)** | Typo'd-but-valid-looking addresses | -10 to -40 |
| Phone format | Malformed / non-US numbers (adjust for your market) | -30 |
| Phone line type — **Twilio Lookup (direct)** | VOIP/burner numbers | -15 |
| Phone HLR status — **IPQualityScore (direct)** | Disconnected, powered-off, or unreachable numbers — the "voicemail trap" | -25 to -50 |
| Honeypot field | Bots that fill every field | -100 (auto-reject) |
| Form fill speed | Bot submissions (<2s) | -25 |
| Suppression list | Known-bad emails/phones you've manually flagged | -100 |
| Exact duplicate | Same email/phone already in the system | -100, marked duplicate |

Kickbox, Twilio Lookup, and IPQualityScore are all called directly — no
fallback/skip path. If any required API key is missing or the call fails,
`verifyLead()` throws rather than silently passing a lead through unchecked.

**Why IPQualityScore for HLR:** it returns HLR-backed reachability
(`active`/`active_status`) and VOIP detection in a single call, has solid
documentation, and is a common choice for this exact lead-gen data-hygiene
use case. If you later want to compare against another provider (e.g.
hlr-lookups.com, NeutrinoAPI, 1Lookup), swap the fetch URL and field mapping
in `checkHLR()` — response shapes differ by vendor, so it's not a drop-in
env var change.

**HLR vs. line-type — why both:** Twilio Lookup tells you what *kind* of
line a number is (mobile/landline/VOIP). HLR tells you whether that number
is *live right now* (powered on, connected, reachable) versus disconnected
or an unassigned temporary VoIP line. A number can pass line-type (real
mobile) and still fail HLR (disconnected) — that's the voicemail-trap case
this check exists to catch before a rep ever dials.

## Score breakdown

Every score starts at a **base of 50**, then each check adds or subtracts
its weight. The final score is clamped to 0–100. The API returns the full
breakdown on every response, and the dashboard renders it as a waterfall
(see below) so you — or a client, during a dispute — can see exactly why a
lead landed where it did.

## Thresholds (configurable)

Two cutoffs divide the 0–100 score into three outcomes:

| Score range | Status | Meaning |
|---|---|---|
| score ≥ `threshold.verified` (default **65**) | `verified` | Auto-delivered to client immediately |
| `threshold.flagged` ≤ score < `threshold.verified` (default **30–64**) | `flagged` | Held in a review queue for a human to approve/reject |
| score < `threshold.flagged` (default **<30**), or any hard-fail check | `rejected` | Never delivered, logged for audit only |
| exact email/phone match on file for that client | `duplicate` | Never delivered |

Hard-fail checks (honeypot triggered, suppression-list hit, exact duplicate)
force `rejected`/`duplicate` regardless of score.

**Thresholds can be changed at three levels, in priority order:**

1. **Per-request** — pass `thresholds` in the POST body:
   ```json
   { "thresholds": { "verified": 80, "flagged": 50 } }
   ```
2. **Per-client** — set `threshold_verified` / `threshold_flagged` on the
   client's row in the `clients` table, or edit inline from the dashboard's
   Clients page.
3. **System default** — env vars, used when neither of the above is set:
   ```
   LEAD_THRESHOLD_VERIFIED=65
   LEAD_THRESHOLD_FLAGGED=30
   ```

## Project structure

```
sql/001_schema.sql                     — clients, leads, verification_checks, suppression_list, client_delivery_log
lib/verification.ts                    — the scoring engine (all checks + orchestrator)
lib/dashboard-data.ts                  — Supabase reads/writes for the dashboard

app/api/leads/verify/route.ts          — lead ingest endpoint
app/api/leads/[id]/review/route.ts     — approve/reject a flagged lead
app/api/clients/[id]/thresholds/route.ts — save per-client threshold overrides

app/dashboard/layout.tsx               — sidebar + shell
app/dashboard/page.tsx                 — overview: stat cards + leads table
app/dashboard/leads/[id]/page.tsx       — lead detail: score waterfall, raw checks
app/dashboard/clients/page.tsx          — per-client threshold settings

components/dashboard/                  — Sidebar, StatCards, LeadsTable, StatusBadge,
                                          ScoreWaterfall, ReviewActions, ThresholdEditor

tailwind.theme.ts                      — theme tokens to merge into tailwind.config.ts
globals-addition.css                   — font imports to add to app/globals.css
```

## Setup

1. **Run the schema**: paste `sql/001_schema.sql` into the Supabase SQL editor.
2. **Env vars**:
   ```
   SUPABASE_URL=
   SUPABASE_SERVICE_ROLE_KEY=
   LEAD_INGEST_SECRET=            # shared secret for inbound calls to the ingest API
   KICKBOX_API_KEY=               # required — email deliverability
   TWILIO_ACCOUNT_SID=            # required — phone line-type lookup
   TWILIO_AUTH_TOKEN=
   IPQS_API_KEY=                  # required — HLR reachability lookup (IPQualityScore)
   LEAD_THRESHOLD_VERIFIED=65     # optional, defaults shown
   LEAD_THRESHOLD_FLAGGED=30
   ```
3. **Theme**: merge `tailwind.theme.ts`'s `theme.extend` into your
   `tailwind.config.ts`, and add `globals-addition.css`'s font import to the
   top of `app/globals.css`.
4. Add a row to `clients` for each customer, with their `webhook_url` for
   delivery and (optionally) custom thresholds.
5. Visit `/dashboard`.

## Request example

```bash
curl -X POST https://verify.mammba.com/api/leads/verify \
  -H "Authorization: Bearer $LEAD_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "facebook_ads",
    "client_id": "uuid-of-client",
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane@example.com",
    "phone": "3055551234",
    "form_fill_time_ms": 8400,
    "honeypot_field": "",
    "thresholds": { "verified": 70, "flagged": 40 }
  }'
```

`thresholds` is optional — omit it to use the client's row settings or the
system default.

## Dashboard

- **Palette** — near-black slate (`#0B0F14`) background, status colors tied
  directly to pipeline states: green (verified), amber (flagged), red
  (rejected), slate (duplicate).
- **Type** — IBM Plex Mono for every number (scores, timestamps, IPs); Inter
  for labels and prose — reads like a diagnostics console, not a marketing
  dashboard.
- **Signature element — the score waterfall** (`ScoreWaterfall.tsx`):
  renders a lead's score as base-50 plus each check's weighted contribution,
  stacking left to right to the final score, with verified/flagged
  threshold lines overlaid. Makes the API's `breakdown.contributions` data
  visible instead of read as JSON.

### What's real vs. stubbed

- **Real**: every read/write in `dashboard-data.ts` queries the actual
  `leads`, `verification_checks`, and `clients` tables. No mock data.
- **Stubbed**: `deliverToClient()` in the ingest route is a no-op — wire it
  to read `webhook_url` from `clients` and POST the lead, logging the
  attempt to `client_delivery_log`. The dashboard's "Approve" action flips
  status to `verified` but doesn't call it yet.
- **Missing**: dashboard auth (both `/api/leads/[id]/review` and
  `/api/clients/[id]/thresholds` are open — add a session check before
  deploying), a suppression-list management page, and usage/billing.

## Where you'll want to extend this

- **Per-client API keys** for the ingest endpoint, swapping the single
  shared `LEAD_INGEST_SECRET` for `clients.api_key`.
- **Fuzzy duplicate detection** — the schema has a trigram index on name
  ready to go.
- **IP geo-mismatch** and **velocity abuse** checks for region-locked
  clients and lead-farm patterns.
- **Weights** — the numbers in `WEIGHTS` (in `verification.ts`) are
  starting points; tune them against real dispute outcome data.
- **Charts over time**, **CSV export**, **Supabase Realtime** on the
  dashboard — see inline notes in `dashboard-data.ts` and `LeadsTable.tsx`.
- **Billing** — usage metering per client tied to the `clients` table.
