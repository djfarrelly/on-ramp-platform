import 'dotenv/config'
import { withDatabase } from '../src/db/client'
import {
  seedDemoDirectory,
  removeDemoDirectory,
} from '../tests/fixtures/directory'

const command = process.argv[2]
if (!['seed', 'clean'].includes(command ?? ''))
  throw new Error('Use pnpm db:seed:demo or pnpm db:clean:demo')
const url = process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_URL in .env. See README.md.')
const allowed =
  command === 'seed'
    ? process.env.ALLOW_DEMO_SEED
    : process.env.ALLOW_DEMO_CLEANUP
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname) &&
  allowed !== 'true'
) {
  throw new Error(
    `Remote demo ${command} requires ${command === 'seed' ? 'ALLOW_DEMO_SEED' : 'ALLOW_DEMO_CLEANUP'}=true. Use a development branch only.`,
  )
}
try {
  if (command === 'seed') {
    await withDatabase(url, seedDemoDirectory)
    console.log(
      'Loaded 10 fictional organizations and 20 fictional programs for testing. Real records preserved.',
    )
  } else {
    const removed = await withDatabase(url, removeDemoDirectory)
    console.log(JSON.stringify({ removed }, null, 2))
    console.log('Core lanes and non-fixture records preserved.')
  }
} catch {
  console.error(
    `Demo ${command} failed; its transaction was rolled back. Check database access and references from non-fixture data. No cascading deletion is performed.`,
  )
  process.exitCode = 1
}
