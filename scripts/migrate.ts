import 'dotenv/config'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

if (!process.env.DATABASE_URL)
  throw new Error('Set DATABASE_URL in .env before migrating. See README.md.')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
try {
  await client.connect()
  // Serialize migration runners without application-process startup migrations.
  await client.query("select pg_advisory_lock(hashtext('onramp-migrations'))")
  await migrate(drizzle(client), { migrationsFolder: './migrations' })
  console.log('Database migrations applied.')
} finally {
  await client.end()
}
