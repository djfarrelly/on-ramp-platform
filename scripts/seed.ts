import 'dotenv/config'
import { seedCore } from '../src/db/seed'
import { withDatabase } from '../src/db/client'

if (!process.env.DATABASE_URL)
  throw new Error('Set DATABASE_URL in .env. See README.md.')
await withDatabase(process.env.DATABASE_URL, seedCore)
console.log(
  'Seeded the four core lanes. No demo listings added; existing records preserved.',
)
