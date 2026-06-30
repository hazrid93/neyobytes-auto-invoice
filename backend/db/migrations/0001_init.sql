-- 0001_init.sql — Neyobytes Auto Invoice: initial schema
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New query → paste this file → Run.
-- (Or via psql/Drizzle once the Supavisor connection pooler is enabled.)
-- This script is idempotent — safe to re-run.

-- =========================================================
-- Tables
-- =========================================================

-- profiles: app-level fields, 1:1 with auth.users
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  company_name text,
  tin         text,                 -- seller's Tax Identification Number
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'App users, 1:1 with auth.users';

-- customers: parties the user invoices (sales) or buys from (purchase)
create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  tin        text,
  email      text,
  phone      text,
  address    text,
  created_at timestamptz not null default now()
);
create index if not exists customers_user_id_idx on public.customers(user_id);

-- invoices
create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  customer_id     uuid references public.customers(id) on delete set null,
  invoice_number  text,
  issue_date      date,
  due_date        date,
  currency        text not null default 'MYR',
  subtotal        numeric(14,2) not null default 0,
  tax_total       numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  status          text not null default 'draft',   -- draft|confirmed|submitted|accepted|rejected|paid
  kind            text not null default 'sales',    -- sales|purchase
  raw_image_path  text,
  extracted_data  jsonb,
  myinvois_doc_id text,
  validation_uuid uuid,
  qr_url          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists invoices_user_id_idx on public.invoices(user_id);
create index if not exists invoices_status_idx on public.invoices(status);

-- invoice_items
create table if not exists public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity    numeric(14,4) not null default 1,
  unit_price  numeric(14,2) not null default 0,
  tax_rate    numeric(5,2)  not null default 0,
  amount      numeric(14,2) not null default 0,
  sort_order  int not null default 0
);
create index if not exists invoice_items_invoice_id_idx on public.invoice_items(invoice_id);

-- =========================================================
-- updated_at trigger
-- =========================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists invoices_touch_updated_at on public.invoices;
create trigger invoices_touch_updated_at before update on public.invoices
for each row execute function public.touch_updated_at();

-- =========================================================
-- Row Level Security — defense in depth, ZERO policies.
-- The backend uses the service-role key, which bypasses RLS, so app code is
-- unaffected. With RLS enabled and no policies, the anon/publishable key can
-- read or write nothing — safer than disabling RLS, at no maintenance cost.
-- If you truly want it off, run:  alter table <t> disable row level security;
-- =========================================================
alter table public.profiles      enable row level security;
alter table public.customers    enable row level security;
alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;
