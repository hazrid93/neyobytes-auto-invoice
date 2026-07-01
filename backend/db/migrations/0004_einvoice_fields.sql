-- 0004_einvoice_fields.sql — LHDN e-Invoice fields to pass the Core Fields Validator
-- HOW TO RUN: applied directly via psql against the Supabase pooler. Idempotent.
-- Depends on: 0001_init.sql (profiles, customers, invoices).
--
-- Why: the canonical MyInvois v1.1 Invoice (sdk.myinvois.hasil.gov.my/types/ +
-- sample) requires supplier/buyer structured identity + address fields and an
-- invoice-level issue time + payment means that we previously didn't store.
-- The Core Fields Validator rejects documents missing these mandatory fields.
-- See docs/myinvois/SDK-ANALYSIS.md §4 for the field-by-field audit.
--
-- Defaults follow the MyInvois 'NA' convention (absent SST/TTX → 'NA'; the
-- portal's own sample uses 'NA' for IDs a party doesn't have). We keep the
-- existing free-text `address`/`phone` columns for back-compat and add the
-- structured fields alongside.

-- ── profiles (the supplier's own identity) ───────────────────────────────
alter table public.profiles
  add column if not exists brn               text,        -- Business Registration Number (SSM), 20 chars
  add column if not exists sst_number        text,        -- SST reg no; 'NA' if not SST-registered
  add column if not exists ttx_number        text,        -- Tourism Tax reg no; 'NA' if not registered
  add column if not exists msic_code         text,        -- 5-digit MSIC code
  add column if not exists msic_description   text,        -- Business activity description (IndustryClassificationCode/@name)
  add column if not exists contact_number    text,        -- Telephone (E.164, e.g. +60123456789)
  add column if not exists address_line1      text,        -- PostalAddress AddressLine[0] (main line)
  add column if not exists address_line2      text,        -- PostalAddress AddressLine[1]
  add column if not exists address_line3      text,        -- PostalAddress AddressLine[2]
  add column if not exists city               text,        -- PostalAddress CityName
  add column if not exists postal_zone        text,        -- PostalAddress PostalZone (5-digit for MY)
  add column if not exists state_code         text;        -- PostalAddress CountrySubentityCode (01-17; 17=NA)

comment on column public.profiles.brn is 'Supplier Business Registration Number (SSM). UBL PartyIdentification schemeID=BRN.';
comment on column public.profiles.sst_number is 'Supplier SST registration number. ''NA'' if not SST-registered. UBL PartyIdentification schemeID=SST.';
comment on column public.profiles.ttx_number is 'Supplier Tourism Tax registration number. ''NA'' if not registered. UBL PartyIdentification schemeID=TTX.';
comment on column public.profiles.msic_code is 'Supplier 5-digit MSIC code. UBL IndustryClassificationCode value.';
comment on column public.profiles.msic_description is 'Supplier business activity description. UBL IndustryClassificationCode/@name.';
comment on column public.profiles.contact_number is 'Supplier telephone (E.164). UBL Contact/Telephone.';
comment on column public.profiles.address_line1 is 'Supplier address main line. UBL PostalAddress/AddressLine[0].';
comment on column public.profiles.address_line2 is 'Supplier address line 2. UBL PostalAddress/AddressLine[1].';
comment on column public.profiles.address_line3 is 'Supplier address line 3. UBL PostalAddress/AddressLine[2].';
comment on column public.profiles.city is 'Supplier city. UBL PostalAddress/CityName.';
comment on column public.profiles.postal_zone is 'Supplier postal zone. UBL PostalAddress/PostalZone.';
comment on column public.profiles.state_code is 'Supplier state code (01-17). UBL PostalAddress/CountrySubentityCode.';

-- ── customers (the buyer's identity) ────────────────────────────────────
alter table public.customers
  add column if not exists brn               text,        -- Business Registration Number / NRIC / PASSPORT / ARMY
  add column if not exists sst_number        text,        -- SST reg no; 'NA' if not SST-registered
  add column if not exists contact_number    text,        -- Telephone (E.164); 'NA' for consolidated
  add column if not exists address_line1     text,        -- PostalAddress AddressLine[0]
  add column if not exists address_line2     text,        -- PostalAddress AddressLine[1]
  add column if not exists address_line3     text,        -- PostalAddress AddressLine[2]
  add column if not exists city              text,        -- PostalAddress CityName
  add column if not exists postal_zone       text,        -- PostalAddress PostalZone
  add column if not exists state_code        text;       -- PostalAddress CountrySubentityCode

comment on column public.customers.brn is 'Buyer Business Registration Number / NRIC / PASSPORT / ARMY. UBL PartyIdentification schemeID (BRN|NRIC|PASSPORT|ARMY).';
comment on column public.customers.sst_number is 'Buyer SST registration number. ''NA'' if not SST-registered. UBL PartyIdentification schemeID=SST.';
comment on column public.customers.contact_number is 'Buyer telephone (E.164); ''NA'' for consolidated e-Invoice. UBL Contact/Telephone.';
comment on column public.customers.address_line1 is 'Buyer address main line. UBL PostalAddress/AddressLine[0].';
comment on column public.customers.address_line2 is 'Buyer address line 2. UBL PostalAddress/AddressLine[1].';
comment on column public.customers.address_line3 is 'Buyer address line 3. UBL PostalAddress/AddressLine[2].';
comment on column public.customers.city is 'Buyer city. UBL PostalAddress/CityName.';
comment on column public.customers.postal_zone is 'Buyer postal zone. UBL PostalAddress/PostalZone.';
comment on column public.customers.state_code is 'Buyer state code (01-17). UBL PostalAddress/CountrySubentityCode.';

-- ── invoices (submission metadata + payment means) ──────────────────────
alter table public.invoices
  add column if not exists long_id            text,        -- human-readable Document ID from Get Submission API
  add column if not exists invoice_type       text not null default '01',  -- e-Invoice type code 01-04,11-14
  add column if not exists issue_time          text,        -- UTC HH:MM:SSZ for the UBL IssueTime field
  add column if not exists payment_means_code text,        -- PaymentMeansCode 01-08
  add column if not exists payment_account    text;        -- PayeeFinancialAccount/ID (supplier bank account no)

comment on column public.invoices.long_id is 'MyInvois human-readable Document ID (longId from Get Submission API). Used to build the validation link {base}/{uuid}/share/{longId}.';
comment on column public.invoices.invoice_type is 'e-Invoice type code (01 Invoice, 02 Credit, 03 Debit, 04 Refund, 11-14 self-billed). Defaults to 01.';
comment on column public.invoices.issue_time is 'Invoice IssueTime in UTC HH:MM:SSZ. LHDN requires issuance within 72h of submission.';
comment on column public.invoices.payment_means_code is 'PaymentMeansCode (01 Cash … 08 Others). UBL PaymentMeans/PaymentMeansCode.';
comment on column public.invoices.payment_account is 'Supplier bank account number. UBL PaymentMeans/PayeeFinancialAccount/ID.';