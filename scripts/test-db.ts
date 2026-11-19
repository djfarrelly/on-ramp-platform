import { spawnSync } from 'node:child_process'
import { prepareTestingDatabase } from './testing-database'

const url =
  process.env.TEST_DATABASE_URL ??
  'postgresql://onramp:onramp_local@127.0.0.1:55432/onramp_test'
await prepareTestingDatabase(url, !process.env.TEST_DATABASE_URL)
const result = spawnSync(
  process.execPath,
  [
    '--import',
    'tsx',
    '--test',
    '--test-concurrency=1',
    'tests/integration/directory.test.ts',
    'tests/integration/ingestion.test.ts',
    'tests/integration/discovery.test.ts',
    'tests/integration/seed.test.ts',
    'tests/integration/review.test.ts',
    'tests/integration/tagging.test.ts',
  ],
  { stdio: 'inherit', env: { ...process.env, TEST_DATABASE_URL: url } },
)
process.exitCode = result.status ?? 1
