import { customType } from 'drizzle-orm/pg-core'

// numeric() columns come back as STRINGS from postgres-js (no default parser).
// `.$type<number>()` only lies to TypeScript, not the runtime — `row.total`
// would be `"108.00"` while TS insists it's `number`. This customType forces
// Number() conversion on EVERY read (select) and accepts numbers on write,
// so TS and runtime agree: money/quantity columns are real numbers everywhere.
//
// DDL isn't generated from this (tables are hand-written SQL in db/migrations),
// but dataType() keeps schema.ts self-describing if you ever do run migrate.
export const money = customType<{
  data: number
  driverData: string
  config: { precision?: number; scale?: number }
}>({
  dataType(c) {
    if (c?.precision != null && c?.scale != null) return `numeric(${c.precision},${c.scale})`
    if (c?.precision != null) return `numeric(${c.precision})`
    return 'numeric'
  },
  fromDriver: (v) => Number(v),
})
