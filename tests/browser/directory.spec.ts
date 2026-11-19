import { test, expect } from 'playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('search, filters, program details and organization links work', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('searchbox').fill('technical')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: /4 programs & services/ }),
  ).toBeVisible()
  await page.getByLabel('Program format').selectOption('in_person')
  await page.getByLabel('Region', { exact: true }).selectOption('West Michigan')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page
    .getByRole('link', { name: 'Evening Technical Foundations' })
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Evening Technical Foundations',
  )
  await page.getByRole('link', { name: 'Meet the organization' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Lakeshore Skills Lab',
  )
})

test('directory and navigation work without JavaScript', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto(`${baseURL}/directory`)
  await expect(
    page.getByRole('heading', { name: /20 programs & services/ }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Next →' }).click()
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '← Previous' }).click()
  await page.getByRole('searchbox').fill('founder')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'Founder Office Hours' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Founder Office Hours' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Founder Office Hours',
  )
  await context.close()
})

test('missing records return 404 and empty searches are useful', async ({
  page,
  request,
}) => {
  const missing = await request.get('/programs/not-a-program')
  expect(missing.status()).toBe(404)
  expect(await missing.text()).not.toContain('Failed query')
  await page.goto('/directory?q=zzzzzznothinghere')
  await expect(
    page.getByRole('heading', {
      name: 'A different search could open a door.',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'See all opportunities' }),
  ).toBeVisible()
})

for (const path of [
  '/',
  '/directory',
  '/lanes/entrepreneurship',
  '/organizations/demo-lakeshore-skills-lab',
  '/programs/demo-evening-technical-foundations',
]) {
  test(`WCAG automated checks: ${path}`, async ({ page }) => {
    await page.goto(path)
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(result.violations).toEqual([])
  })
}

test('mobile pages do not overflow, and keyboard search is usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of [
    '/',
    '/directory',
    '/organizations/demo-lakeshore-skills-lab',
    '/programs/demo-evening-technical-foundations',
  ]) {
    await page.goto(path)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  }
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('searchbox')).toBeFocused()
  await page.keyboard.type('technical')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('heading', { name: /4 programs & services/ }),
  ).toBeVisible()
})
