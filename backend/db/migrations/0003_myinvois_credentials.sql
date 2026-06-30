-- 0003_myinvois_credentials.sql — Per-user LHDN MyInvois credentials
-- HOW TO RUN: applied directly via psql against the Supabase pooler.
-- Idempotent — safe to re-run.
-- Depends on: 0001_init.sql (profiles).
--
-- Each taxpayer registers their own ERP system on the MyInvois portal
-- (profile.myinvois.hasil.gov.my → Generate ERP), which issues a long-lived
-- (1–3yr) client_id + client_secret pair. The user pastes these into the app;
-- we store them PER USER (not as a single platform-wide env pair) and use them
-- to fetch a per-user OAuth2 token (Login as Taxpayer System). The secret is
-- AES-256-GCM encrypted at rest (lib/crypto.ts); only the client_id + the
-- connection timestamp are ever returned to the frontend.

alter table public.profiles
  add column if not exists myinvois_client_id          text,
  add column if not exists myinvois_client_secret_enc text,        -- encrypted (v1:iv:ct:tag)
  add column if not exists myinvois_connected_at      timestamptz;

comment on column public.profiles.myinvois_client_id is
  'LHDN MyInvois ERP client_id the taxpayer generated on the MyInvois portal (Login as Taxpayer System). Plaintext — the public half of the pair.';
comment on column public.profiles.myinvois_client_secret_enc is
  'AES-256-GCM-encrypted LHDN MyInvois client_secret (the secret half). v1:iv:ct:tag format; decrypted only at token-fetch time. Never selected for API responses.';
comment on column public.profiles.myinvois_connected_at is
  'When the user linked their MyInvois ERP credentials. Cleared on disconnect.';