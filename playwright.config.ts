import { defineConfig } from 'playwright/test'

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5175)
const baseURL = `http://127.0.0.1:${port}`
const databaseUrl = process.env.BROWSER_DATABASE_URL
if (
  !databaseUrl ||
  !/^[a-zA-Z0-9_]+_test$/.test(new URL(databaseUrl).pathname.slice(1))
) {
  throw new Error(
    'Run pnpm test:browser to prepare and use an isolated _test database.',
  )
}

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: `pnpm dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      WRANGLER_LOG_PATH: '.wrangler/logs',
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: databaseUrl,
    },
  },
})
