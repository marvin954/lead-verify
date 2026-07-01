-- Mammba Verify — Core Schema
-- Run in Supabase SQL editor or via CLI migration

create extension if not exists pgcrypto;

-- ============================================================
-- CLIENTS: tenants of the Mammba Verify product
-- ============================================================
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  api_key text not null unique default encode(gen_random_bytes(24), 'hex'),
  webhook_url text,                    -- where verified leads get delivered
  active boolean not null default true,

  -- per-client score threshold overrides (falls back to system default if null)
  threshold_verified int,
  threshold_flagged int
);

create index if not exists idx_clients_api_key on clients (api_key);

-- ============================================================
-- LEADS: raw incoming lead data
-- ============================================================
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- source tracking
  source text not null,                -- e.g. 'facebook_ads', 'landing_page_x', 'webform_client_a'
  client_id uuid references clients(id),
  campaign_id text,

  -- raw submitted fields
  first_name text,
  last_name text,
  email text,
  phone text,
  company text,
  ip_address inet,
  user_agent text,
  form_fill_time_ms int,               -- time taken to fill form (bot signal)
  raw_payload jsonb,                   -- full original submission for audit

  -- verification state
  status text not null default 'pending'
    check (status in ('pending','verifying','verified','flagged','rejected','duplicate')),
  score int,                           -- 0-100 composite quality score
  verified_at timestamptz,

  -- normalized fields (populated after verification)
  email_normalized text,
  phone_normalized text                -- E.164 format
);

create index if not exists idx_leads_email_norm on leads (email_normalized);
create index if not exists idx_leads_phone_norm on leads (phone_normalized);
create index if not exists idx_leads_status on leads (status);
create index if not exists idx_leads_client on leads (client_id);
create index if not exists idx_leads_created on leads (created_at desc);

-- Trigram index for fuzzy name/company duplicate matching
create extension if not exists pg_trgm;
create index if not exists idx_leads_name_trgm on leads using gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- ============================================================
-- VERIFICATION_CHECKS: individual check results per lead
-- ============================================================
create table if not exists verification_checks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  created_at timestamptz not null default now(),

  check_type text not null
    check (check_type in (
      'email_format','email_deliverability','email_disposable','email_mx',
      'phone_format','phone_type','phone_carrier','phone_hlr',
      'duplicate_email','duplicate_phone','duplicate_fuzzy',
      'ip_geo_mismatch','velocity_abuse','honeypot','form_fill_speed',
      'name_validity','company_validity'
    )),
  passed boolean not null,
  weight int not null default 0,       -- points contributed to score (can be negative)
  detail jsonb,                        -- raw response from validator/service
  provider text                        -- which service ran this check, if external
);

create index if not exists idx_checks_lead on verification_checks (lead_id);

-- ============================================================
-- SUPPRESSION_LIST: known-bad emails/phones/domains, manually or auto added
-- ============================================================
create table if not exists suppression_list (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  value text not null,
  value_type text not null check (value_type in ('email','phone','domain','ip')),
  reason text,
  added_by text default 'system'
);

create unique index if not exists idx_suppression_value on suppression_list (value_type, value);

-- ============================================================
-- CLIENT_DELIVERY_LOG: what was actually sent to the paying client
-- ============================================================
create table if not exists client_delivery_log (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  client_id uuid not null references clients(id),
  delivered_at timestamptz not null default now(),
  delivery_method text,                -- 'webhook','crm_push','email','csv_export'
  delivery_status text default 'sent',
  response_code int,
  disputed boolean default false,      -- client later claimed lead was bad
  dispute_reason text
);

-- keep updated_at fresh
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_leads_updated on leads;
create trigger trg_leads_updated before update on leads
  for each row execute function set_updated_at();

-- Row Level Security (adjust policies to your auth model)
alter table leads enable row level security;
alter table verification_checks enable row level security;
alter table suppression_list enable row level security;
alter table client_delivery_log enable row level security;

-- Service role bypasses RLS by default in Supabase; add authenticated read policies as needed, e.g.:
-- create policy "clients read own leads" on leads for select
--   using (client_id = auth.jwt() ->> 'client_id');
