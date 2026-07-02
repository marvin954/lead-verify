# Mammba Verify — Dashboard

An ops dashboard for the verification engine: a live overview, a
filterable/searchable leads table, a per-lead score breakdown, a review
queue for flagged leads, and per-client threshold settings.

## Design

- **Palette** — near-black slate (`#0B0F14`) background, status colors tied
  directly to pipeline states: green (verified), amber (flagged), red
  (rejected), slate (duplicate). No decorative color — every color on the
  page means something operational.
- **Type** — IBM Plex Mono for every number (scores, timestamps, IPs); Inter
  for labels and prose. The mono numerals are deliberate: this is a
  telecom/data-hygiene tool, and the type should read like a diagnostics
  console, not a marketing dashboard.
- **Signature element — the score waterfall** (`ScoreWaterfall.tsx`): renders
  a lead's score as base-50 plus each check's weighted contribution,
  stacking left to right to the final score, with the verified/flagged
  threshold lines overlaid. This is the one visual that directly explains
  *why* a lead landed where it did — the same breakdown data the API
  already returns (`breakdown.contributions`), just made visible instead of
  read as JSON.

## File map

```
app/dashboard/
  layout.tsx              — sidebar + shell
  page.tsx                — overview: stat cards + leads table
  leads/[id]/page.tsx      — lead detail: header, score waterfall, raw checks
  clients/page.tsx         — per-client threshold settings

app/api/
  leads/[id]/review/route.ts        — approve/reject a flagged lead
  clients/[id]/thresholds/route.ts  — save per-client threshold overrides

components/dashboard/
  Sidebar.tsx        — nav + provider status dots (Kickbox/Twilio/IPQS)
  StatCards.tsx       — today's totals, verified rate
  LeadsTable.tsx      — filter tabs, search, pagination (client component)
  StatusBadge.tsx     — consistent status pill styling
  ScoreWaterfall.tsx  — the signature score visualization
  ReviewActions.tsx   — approve/reject buttons for flagged leads
  ThresholdEditor.tsx — inline verified/flagged threshold inputs

lib/dashboard-data.ts — all Supabase reads/writes for the dashboard

tailwind.theme.ts       — theme tokens to merge into your tailwind.config.ts
globals-addition.css    — font imports to add to app/globals.css
```

## Wiring it into your project

1. **Fonts + theme**: merge `tailwind.theme.ts`'s `theme.extend` into your
   existing `tailwind.config.ts`, and add `globals-addition.css`'s import to
   the top of `app/globals.css`.
2. **Drop in the files**: copy `app/dashboard/`, `app/api/leads/[id]/review`,
   `app/api/clients/[id]/thresholds`, `components/dashboard/`, and
   `lib/dashboard-data.ts` into your Next.js project at the same paths.
3. **Env vars** — same ones the verification engine already uses:
   ```
   SUPABASE_URL=
   SUPABASE_SERVICE_ROLE_KEY=
   LEAD_THRESHOLD_VERIFIED=65
   LEAD_THRESHOLD_FLAGGED=30
   ```
4. **Auth** — there's no dashboard auth wired in yet. Both API routes have a
   `TODO` marking where to add a session check (Supabase Auth, or your own).
   Don't ship this with the routes open — anyone who finds
   `/api/leads/[id]/review` could approve/reject leads.
5. Visit `/dashboard`.

## What's real vs. stubbed

- **Real**: every read/write in `dashboard-data.ts` queries the actual
  `leads`, `verification_checks`, and `clients` tables from the schema you
  already have. No mock data.
- **Stubbed**: the "approve" action just flips status to `verified` — it
  doesn't call `deliverToClient()` yet. Wire that in
  `app/api/leads/[id]/review/route.ts` where marked.
- **Missing**: auth, a suppression-list management page (linked from the
  sidebar but not built — same pattern as `clients/page.tsx`, swap the
  table), and any usage/billing view.

## Extending

- **Charts over time** (leads/day, verified rate trend) — you have
  `recharts` available; add a `TrendChart.tsx` next to `StatCards.tsx`
  reading from a new `getDailyStats()` query.
- **CSV export** — the leads table already has all the filter state in the
  URL; a `/api/leads/export` route that accepts the same query params and
  streams a CSV is a natural add.
- **Real-time** — swap `revalidate = 0` server-fetching for a Supabase
  Realtime subscription on the `leads` table if you want the dashboard to
  update without a manual refresh during an active campaign.
