import { test, expect } from 'playwright/test'
import AxeBuilder from '@axe-core/playwright'

const latestTurn = (page: import('playwright/test').Page) =>
  page.locator('.move-turn').last()
async function enterRegion(
  page: import('playwright/test').Page,
  region = 'West Michigan',
) {
  await page.getByRole('radio', { name: region, exact: true }).check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
}

test('region comes first, then four starting choices start a filtered conversation on the same page', async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = []
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/discovery.respond'))
      requests.push(request.postDataJSON())
  })
  await page.goto('/discover')
  await expect(
    page.getByRole('heading', { name: 'Where in Michigan are you looking?' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeDisabled()
  for (const name of [
    'Southeast Michigan',
    'West Michigan',
    'Mid-Michigan',
    'Northern Michigan',
    'Upper Peninsula',
  ])
    await expect(page.getByRole('radio', { name, exact: true })).toBeVisible()
  await expect(
    page.getByRole('radio', { name: 'Detroit Metro', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByText('Anywhere in Michigan', { exact: true }),
  ).toHaveCount(0)
  await expect(page.locator('.move-workspace')).toHaveAttribute('inert', '')
  await expect(page.locator('.move-goal')).toHaveCount(4)
  await expect(page.locator('.move-goal').first()).toBeDisabled()
  expect(requests).toHaveLength(0)
  await enterRegion(page)
  expect(requests).toHaveLength(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'What’s your next move?',
  )
  for (const name of [
    "I'm starting a business",
    'Learning and training',
    'Finding a new role',
    'Connect with startups',
  ])
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Tell us your next move' })
    .fill('I might prefer online')
  await page
    .getByRole('button', { name: "I'm starting a business", exact: true })
    .click()
  await expect(
    latestTurn(page).getByRole('heading', {
      name: 'How would you like to take part?',
    }),
  ).toBeVisible()
  await expect(latestTurn(page).locator('.move-card').first()).toBeVisible()
  await expect(page).toHaveURL(/\/discover$/)
  await expect(page.getByRole('textbox')).toHaveValue('I might prefer online')
  expect(requests).toHaveLength(1)
  expect(requests[0].selection).toEqual({
    type: 'goal',
    value: 'entrepreneurship',
  })
  expect((requests[0].filters as { region: string }).region).toBe(
    'West Michigan',
  )
  expect(requests.every((request) => !request.message)).toBe(true)
  expect(browserErrors).toEqual([])
})

test('Southeast reveals an optional ZIP stub, sends only the region, and resets on refresh', async ({
  page,
}) => {
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/discovery.respond'))
      requests.push(request.postData()!)
  })
  await page.goto('/discover')
  await page
    .getByRole('radio', { name: 'Southeast Michigan', exact: true })
    .check()
  const zip = page.getByLabel('ZIP code', { exact: false })
  await expect(zip).toBeVisible()
  await expect(zip).toHaveAttribute('inputmode', 'numeric')
  await zip.fill('481')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(zip).toBeVisible()
  await zip.fill('48104')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Change region' }),
  ).toContainText('Southeast Michigan')
  await page
    .getByRole('button', { name: "I'm starting a business", exact: true })
    .click()
  await expect(page.locator('.move-turn')).toHaveCount(1)
  expect(requests).toHaveLength(1)
  expect(JSON.parse(requests[0]).filters.region).toBe('Southeast')
  expect(requests[0]).not.toContain('48104')
  expect(requests[0]).not.toContain('zip')
  await page.getByRole('button', { name: 'Change region' }).click()
  await enterRegion(page, 'West Michigan')
  await expect(page.locator('.move-turn')).toHaveCount(2)
  expect(JSON.parse(requests[1]).selection).toEqual({
    type: 'region',
    value: 'West Michigan',
  })
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Where in Michigan are you looking?' }),
  ).toBeVisible()
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeDisabled()
  await enterRegion(page, 'Southeast Michigan')
  await expect(
    page.getByRole('textbox', { name: 'Tell us your next move' }),
  ).toBeFocused()
  const stored = await page.evaluate(() =>
    JSON.stringify([localStorage, sessionStorage, document.cookie]),
  )
  expect(stored).not.toContain('48104')
  expect(stored).not.toContain('Southeast')
})

test('text and choices share context, retain earlier cards, and open details without losing the conversation', async ({
  page,
}) => {
  await page.goto('/discover')
  await enterRegion(page)
  await page
    .getByRole('textbox')
    .fill('I want technical training near Grand Rapids')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(
    latestTurn(page).getByRole('link', {
      name: /Evening Technical Foundations/,
    }),
  ).toBeVisible()
  await latestTurn(page)
    .getByRole('button', { name: 'Online', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText('1 option found')
  await expect(
    latestTurn(page).getByRole('link', { name: /Try a Technical Career/ }),
  ).toBeVisible()
  await expect(
    latestTurn(page).getByRole('link', {
      name: /Evening Technical Foundations/,
    }),
  ).toHaveCount(0)
  await expect(
    page
      .locator('.move-turn')
      .first()
      .getByRole('link', { name: /Evening Technical Foundations/ }),
  ).toHaveCount(1)
  const popup = page.waitForEvent('popup')
  await latestTurn(page)
    .getByRole('link', { name: /Try a Technical Career/ })
    .click()
  const detail = await popup
  await expect(detail.getByRole('heading', { level: 1 })).toHaveText(
    'Try a Technical Career',
  )
  await detail.close()
  await expect(page).toHaveURL(/\/discover$/)
  await expect(page.locator('.move-turn')).toHaveCount(2)
  await page.reload()
  await expect(page.locator('.move-turn')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Where in Michigan are you looking?' }),
  ).toBeVisible()
  await enterRegion(page)
  await expect(page.getByRole('textbox')).toHaveValue('')
  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }))
  expect(Object.keys(storage.local)).toEqual([])
  expect(
    Object.keys(storage.session).filter(
      (key) => key !== 'tsr-scroll-restoration-v1_3',
    ),
  ).toEqual([])
  expect(JSON.stringify(storage)).not.toContain('technical training')
})

test('the opening region and any format advance without repeating location questions', async ({
  page,
}) => {
  await page.goto('/discover')
  await enterRegion(page)
  await page
    .getByRole('button', { name: "I'm starting a business", exact: true })
    .click()
  await expect(
    latestTurn(page).getByRole('heading', {
      name: 'How would you like to take part?',
    }),
  ).toBeVisible()
  await latestTurn(page)
    .getByRole('button', { name: 'Any format', exact: true })
    .click()
  await expect(
    latestTurn(page).getByRole('heading', {
      name: 'What would you like to explore?',
    }),
  ).toBeVisible()
  await latestTurn(page)
    .getByRole('button', { name: 'A mix of everything', exact: true })
    .click()
  await expect(
    latestTurn(page).getByText(
      'Keep exploring these options, or tell me what you’d like to change.',
    ),
  ).toBeVisible()
  await expect(page.locator('.move-turn')).toHaveCount(3)
  await page
    .getByRole('button', { name: 'Change direction', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Connect with startups', exact: true })
    .click()
  await expect(
    latestTurn(page).getByRole('heading', {
      name: 'What would you like to explore?',
    }),
  ).toBeVisible()
})

test('reviewed-only empty results offer explicit recovery choices', async ({
  page,
}) => {
  await page.goto('/discover')
  await enterRegion(page)
  await page
    .getByRole('combobox', { name: 'Listings' })
    .selectOption('published')
  await page
    .getByRole('button', { name: 'Learning and training', exact: true })
    .click()
  await expect(
    latestTurn(page).getByRole('heading', {
      name: 'Let’s try another direction.',
    }),
  ).toBeVisible()
  await expect(latestTurn(page).locator('.move-card')).toHaveCount(0)
  await expect(
    latestTurn(page).getByRole('heading', {
      name: 'Want to try a wider search?',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Browse the directory/ }),
  ).toBeVisible()
})

test('failed refinements preserve the thread and retry without duplicating a turn', async ({
  page,
}) => {
  await page.goto('/discover')
  await enterRegion(page)
  await page
    .getByRole('button', { name: "I'm starting a business", exact: true })
    .click()
  await expect(
    latestTurn(page).getByRole('heading', {
      name: 'How would you like to take part?',
    }),
  ).toBeVisible()
  let calls = 0
  await page.route('**/api/v1/discovery.respond', (route) =>
    ++calls === 1
      ? route.fulfill({ status: 503, body: '{}' })
      : route.continue(),
  )
  await latestTurn(page)
    .getByRole('button', { name: 'Online', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Search is temporarily unavailable',
  )
  await expect(page.locator('.move-turn')).toHaveCount(1)
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(
    latestTurn(page).getByRole('heading', {
      name: 'What would you like to explore?',
    }),
  ).toBeVisible()
  await expect(page.locator('.move-turn')).toHaveCount(2)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(calls).toBe(2)
})

test('the composer stays visible and the conversation is accessible on desktop and mobile', async ({
  page,
}) => {
  await page.goto('/discover')
  await page
    .getByRole('radio', { name: 'Southeast Michigan', exact: true })
    .check()
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  await enterRegion(page)
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await expect(page.getByRole('textbox')).toBeInViewport()
    await expect(
      page.getByRole('button', { name: 'Connect with startups', exact: true }),
    ).toBeInViewport()
  }
  await page
    .getByRole('button', { name: "I'm starting a business", exact: true })
    .click()
  await expect(
    latestTurn(page).getByRole('heading', {
      name: 'How would you like to take part?',
    }),
  ).toBeVisible()
  await expect(page.getByRole('textbox')).toBeInViewport()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.getByRole('button', { name: 'Start over' }).click()
  await expect(
    page.getByRole('heading', { name: 'Where in Michigan are you looking?' }),
  ).toBeFocused()
  await expect(page.locator('.move-turn')).toHaveCount(0)
})

test('loading feedback keeps the composer available and start over cancels an in-flight turn', async ({
  page,
}) => {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/v1/discovery.respond', async (route) => {
    await held
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{}',
    })
  })
  try {
    await page.goto('/discover')
    await enterRegion(page)
    await page
      .getByRole('button', { name: "I'm starting a business", exact: true })
      .click()
    await expect(page.getByRole('status')).toHaveText(
      'Searching the directory…',
    )
    await expect(page.locator('.move-loading')).toBeVisible()
    await expect(page.locator('.move-pending .move-user')).toHaveText(
      "I'm starting a business",
    )
    await expect(page.getByRole('textbox')).toBeInViewport()
    await page.getByRole('button', { name: 'Start over' }).click()
    release()
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByRole('heading', { name: 'Where in Michigan are you looking?' }),
    ).toBeVisible()
    await expect(page.locator('.move-pending, .move-turn')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
  } finally {
    release()
  }
})

test('reduced-motion preferences disable chat motion while preserving refinement', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/discover')
  await enterRegion(page)
  await page
    .getByRole('button', { name: "I'm starting a business", exact: true })
    .click()
  await expect(
    latestTurn(page).getByRole('heading', {
      name: 'How would you like to take part?',
    }),
  ).toBeVisible()
  expect(
    await latestTurn(page)
      .locator('.move-card')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none')
  await latestTurn(page)
    .getByRole('button', { name: 'Online', exact: true })
    .click()
  await expect(
    latestTurn(page).getByRole('heading', {
      name: 'What would you like to explore?',
    }),
  ).toBeVisible()
  await expect(page.getByRole('textbox')).toBeInViewport()
})
