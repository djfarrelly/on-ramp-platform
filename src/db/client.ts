import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

export function createDatabase(client: pg.Client | pg.Pool) {
  return drizzle(client, { schema })
}
// Services also accept a Drizzle transaction, allowing callers to compose writes.
export type Database = Pick<
  ReturnType<typeof createDatabase>,
  'select' | 'insert' | 'update' | 'delete' | 'transaction'
>

// A request owns its small pool. Hyperdrive pools the origin connections in Workers.
export async function withDatabase<T>(
  connectionString: string,
  run: (db: Database) => Promise<T>,
): Promise<T> {
  const client = new pg.Pool({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
    idleTimeoutMillis: 1000,
  })
  try {
    return await run(createDatabase(client))
  } finally {
    await client.end()
  }
}
