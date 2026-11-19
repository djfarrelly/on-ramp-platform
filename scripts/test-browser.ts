import { spawnSync } from 'node:child_process'
import { prepareTestingDatabase } from './testing-database'

const url =
  process.env.BROWSER_DATABASE_URL ??
  'postgresql://onramp:onramp_local@127.0.0.1:55432/onramp_browser_test'
await prepareTestingDatabase(url, !process.env.BROWSER_DATABASE_URL)
const result = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: { ...process.env, BROWSER_DATABASE_URL: url },
  },
)
process.exitCode = result.status ?? 1
