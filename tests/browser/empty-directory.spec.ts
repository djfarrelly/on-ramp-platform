import { test, expect } from 'playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { withDatabase } from '../../src/db/client'
import { seedCore } from '../../src/db/seed'
import { removeDemoDirectory, seedDemoDirectory } from '../fixtures/directory'

test('a clean database shows empty states and never falls back to fictional listings', async ({
  page,
  request,
}) => {
  const url = process.env.BROWSER_DATABASE_URL
  if (!url || !new URL(url).pathname.endsWith('_test'))
    throw new Error('Use pnpm test:browser with an isolated test database')
  await withDatabase(url, removeDemoDirectory)
  try {
    await withDatabase(url, seedCore)
    await page.goto('/')
    await expect(
      page.getByText('The first listings are being reviewed.', {
        exact: false,
      }),
    ).toBeVisible()
    expect(
      (await request.get('/organizations/demo-lakeshore-skills-lab')).status(),
    ).toBe(404)
    await page.goto('/directory')
    await expect(
      page.getByRole('heading', { name: /0 programs & services/ }),
    ).toBeVisible()
    await page.goto('/discover')
    await page
      .getByRole('radio', { name: 'West Michigan', exact: true })
      .check()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByText(/Demo mode/)).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: 'Listings' })).toHaveCount(
      0,
    )
    await page
      .getByRole('textbox', { name: 'Tell us your next move' })
      .fill('I want technical training')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(
      page.getByRole('heading', { name: 'Let’s try another direction.' }),
    ).toBeVisible()
    await expect(page.locator('.move-card')).toHaveCount(0)
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
  } finally {
    await withDatabase(url, seedDemoDirectory)
  }
})
