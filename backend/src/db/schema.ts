import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  jsonb,
  integer,
  index,
} from 'drizzle-orm/pg-core'
import { money } from './money'

// NOTE: the actual tables + the profiles.id → auth.users FK are created by the
// hand-written SQL in db/migrations/0001_init.sql (run via the pooler). This
// Drizzle schema mirrors those tables for typed queries only; we do NOT run
// drizzle-kit push against auth.users, so the cross-schema FK is left out of
// the Drizzle model intentionally. The money() type casts numerics to number
// on read AND write (see ./money.ts) — TS and runtime agree.

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // set by auth.users id; not auto-generated
  email: text('email').notNull(),
  fullName: text('full_name'),
  companyName: text('company_name'),
  tin: text('tin'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tin: text('tin'),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    tinValidatedAt: timestamp('tin_validated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('customers_user_id_idx').on(t.userId)],
)

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    invoiceNumber: text('invoice_number'),
    issueDate: date('issue_date'),
    dueDate: date('due_date'),
    currency: text('currency').notNull().default('MYR'),
    subtotal: money('subtotal', { precision: 14, scale: 2 }).notNull().default(0),
    taxTotal: money('tax_total', { precision: 14, scale: 2 }).notNull().default(0),
    total: money('total', { precision: 14, scale: 2 }).notNull().default(0),
    status: text('status').notNull().default('draft'),
    kind: text('kind').notNull().default('sales'),
    rawImagePath: text('raw_image_path'),
    extractedData: jsonb('extracted_data'),
    myinvoisDocId: text('myinvois_doc_id'),
    validationUuid: uuid('validation_uuid'),
    qrUrl: text('qr_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('invoices_user_id_idx').on(t.userId),
    index('invoices_status_idx').on(t.status),
  ],
)

// Audit log for each submit-to-LHDN attempt. Mirrors
// db/migrations/0002_myinvois.sql (created via psql against the live pooler).
export const myinvoisSubmissions = pgTable(
  'myinvois_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    submissionUid: text('submission_uid'),
    requestBody: jsonb('request_body'),
    responseBody: jsonb('response_body'),
    httpStatus: integer('http_status'),
    // pending | submitted | accepted | rejected | error
    status: text('status').notNull().default('pending'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('myinvois_submissions_invoice_id_idx').on(t.invoiceId),
    index('myinvois_submissions_user_id_idx').on(t.userId),
    index('myinvois_submissions_status_idx').on(t.status),
  ],
)

export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: money('quantity', { precision: 14, scale: 4 }).notNull().default(1),
    unitPrice: money('unit_price', { precision: 14, scale: 2 }).notNull().default(0),
    taxRate: money('tax_rate', { precision: 5, scale: 2 }).notNull().default(0),
    amount: money('amount', { precision: 14, scale: 2 }).notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('invoice_items_invoice_id_idx').on(t.invoiceId)],
)
