-- 0002_myinvois.sql — LHDN MyInvois submission audit log
-- HOW TO RUN: applied directly via psql against the Supabase pooler (this script).
-- Idempotent — safe to re-run.
-- Depends on: 0001_init.sql (profiles, invoices).

-- =========================================================
-- myinvois_submissions: audit log for each submit-to-LHDN attempt
-- =========================================================
-- One row per POST /api/v1.0/documentsubmissions call. Captures the request,
-- the LHDN response (submissionUid + per-document accept/reject), and the
-- resulting status, so we have a full paper trail and can retry failed submits.
create table if not exists public.myinvois_submissions (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references public.invoices(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  submission_uid text,              -- returned by MyInvois on a successful submit
  request_body   jsonb,             -- documents[] payload we sent (minus the base64 doc body)
  response_body  jsonb,             -- MyInvois response (submissionUid + per-doc accept/reject)
  http_status    int,
  status         text not null default 'pending',  -- pending|submitted|accepted|rejected|error
  error          text,
  created_at     timestamptz not null default now()
);
comment on table public.myinvois_submissions is 'Audit log for each LHDN MyInvois document submission attempt';

create index if not exists myinvois_submissions_invoice_id_idx on public.myinvois_submissions(invoice_id);
create index if not exists myinvois_submissions_user_id_idx on public.myinvois_submissions(user_id);
create index if not exists myinvois_submissions_status_idx on public.myinvois_submissions(status);

-- =========================================================
-- customers.tin_validated_at: cache the last Validate-TIN result timestamp.
-- Lets us skip re-querying LHDN on every invoice when the TIN was recently validated.
-- =========================================================
alter table public.customers
  add column if not exists tin_validated_at timestamptz;

-- =========================================================
-- Row Level Security — same defense-in-depth posture as 0001_init.sql.
-- Backend uses service-role key (bypasses RLS); anon key can read/write nothing.
-- =========================================================
alter table public.myinvois_submissions enable row level security;