import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../env'
import { DbUnavailableError } from '../domain/errors'
import * as schema from './schema'

// The client is only built when DATABASE_URL is set. Until the Supavisor
// pooler is enabled, DATABASE_URL stays unset and `db` is null — the server
// still boots and Auth (supabase-js + our own JWT) works; DB routes return 503.
//
// `prepare: false` is REQUIRED regardless of pooler mode. Reason: we run a
// CLIENT-SIDE connection pool (max > 1), and postgres-js's named prepared
// statements are connection-bound. Drizzle's adapter doesn't guarantee
// statement affinity to a single connection, so enabling prepared statements
// with max > 1 triggers "prepared statement already exists / does not exist".
// Keep this false on BOTH transaction mode (6543) and session mode (5432).
export type DB = ReturnType<typeof drizzle>

export const db: DB | null = env.DATABASE_URL
  ? drizzle(
      postgres(env.DATABASE_URL, {
        prepare: false,
        max: 10,
        ssl: 'require',
        connect_timeout: 10,
        idle_timeout: 20,
      }),
      { schema },
    )
  : null

export const isDbReady = db !== null

/**
 * Repository guard. Throws DbUnavailableError (→ 503) when the pooler is not
 * configured. Called at the top of every repo method so services/routes stay
 * free of `if (!db)` boilerplate. Returns the non-null client.
 */
export function requireDb(): DB {
  if (!db) {
    throw new DbUnavailableError('DATABASE_URL is not set. Enable the Supabase pooler and set it in .env.local/.env.stg/.env.prod.')
  }
  return db
}
