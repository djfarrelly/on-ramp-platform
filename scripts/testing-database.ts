import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { withDatabase } from '../src/db/client'
import { seedDemoDirectory } from '../tests/fixtures/directory'

export async function prepareTestingDatabase(url: string, createLocal = false) {
  const parsed = new URL(url)
  const name = parsed.pathname.slice(1)
  if (!/^[a-zA-Z0-9_]+_test$/.test(name))
    throw new Error('Tests require a dedicated database ending in _test')
  if (createLocal) {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
      throw new Error('Automatic test database creation is local-only')
    const adminUrl = new URL(url)
    adminUrl.pathname = '/onramp'
    const admin = new pg.Client({ connectionString: adminUrl.href })
    try {
      await admin.connect()
      const exists = await admin.query(
        'select 1 from pg_database where datname = $1',
        [name],
      )
      if (!exists.rowCount)
        await admin.query(`create database ${pg.escapeIdentifier(name)}`)
    } finally {
      await admin.end()
    }
  }
  const client = new pg.Client({ connectionString: url })
  try {
    await client.connect()
    await migrate(drizzle(client), { migrationsFolder: './migrations' })
  } finally {
    await client.end()
  }
  await withDatabase(url, seedDemoDirectory)
}
