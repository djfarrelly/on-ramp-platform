import { test, expect } from 'playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { eq } from 'drizzle-orm'
import { withDatabase } from '../../src/db/client'
import { organizations, offerings, events } from '../../src/db/schema'
import { refreshTagsAfterContentEdit } from '../../src/services/tagging'
import { localReviewerId } from '../../src/services/ingestion/bootstrap'
import {
  seedReviewFixtures,
  clearReviewFixtures,
  reviewFixtureIds as ids,
} from '../fixtures/review'

const url = process.env.BROWSER_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Use pnpm test:browser with an isolated database')
test.beforeEach(async () => {
  await withDatabase(url, clearReviewFixtures)
  await withDatabase(url, seedReviewFixtures)
})
test.afterEach(async () => {
  await withDatabase(url, clearReviewFixtures)
})

test('view proposals, approve the organization and program, and reject an event without signing in', async ({
  page,
  request,
}) => {
  await page.goto('/review')
  await expect(
    page.getByText('3 pending proposals.', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Pending proposals' })
    .getByRole('button', { name: /Review test program/ })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Review test program', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Open source website/ }),
  ).toHaveAttribute('href', 'https://example.org/program')
  await expect(
    page.getByRole('button', { name: 'Approve & publish' }),
  ).toBeDisabled()
  await expect(
    page.getByText(
      'Approve the organization profile before publishing this listing.',
    ),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Review organization', exact: true })
    .click()
  await expect(
    page.getByRole('heading', {
      name: 'Review test organization',
      exact: true,
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Approve & publish' }).click()
  await expect(
    page.getByText('2 pending proposals.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Published: Review test organization.', { exact: false }),
  ).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Pending proposals' })
    .getByRole('button', { name: /Review test program/ })
    .click()
  await page.getByRole('button', { name: 'Approve & publish' }).click()
  await expect(
    page.getByText('1 pending proposal.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /View published listing/ }),
  ).toHaveAttribute('href', '/programs/review-test-program')
  const published = await request.get('/programs/review-test-program')
  expect(published.status()).toBe(200)
  expect(await published.text()).toContain(
    'Practical training with a clear next step.',
  )
  const [row] = await withDatabase(url, (db) =>
    db.select().from(offerings).where(eq(offerings.id, ids.offering)),
  )
  expect(row.reviewedBy).toBe(localReviewerId)
  expect(row.status).toBe('published')
  await expect(
    page.getByRole('heading', { name: 'Review test event', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Reject proposal' }).click()
  await expect(
    page.getByRole('heading', { name: 'All caught up.' }),
  ).toBeVisible()
  await expect(
    page.getByText('Rejected: Review test event.', { exact: true }),
  ).toBeVisible()
})

test('a stale proposal is blocked until the queue is refreshed', async ({
  page,
}) => {
  await page.goto('/review')
  await expect(
    page.getByRole('heading', {
      name: 'Review test organization',
      exact: true,
    }),
  ).toBeVisible()
  await withDatabase(url, (db) =>
    db
      .update(organizations)
      .set({ updatedAt: new Date(Date.now() + 1000) })
      .where(eq(organizations.id, ids.organization)),
  )
  await page.getByRole('button', { name: 'Approve & publish' }).click()
  await expect(page.getByRole('alert')).toContainText('Proposal changed')
  await expect(
    page.getByRole('button', { name: 'Approve & publish' }),
  ).toBeDisabled()
  await withDatabase(url, (db) =>
    refreshTagsAfterContentEdit(
      db,
      'organization',
      ids.organization,
      localReviewerId,
    ),
  )
  await page.getByRole('button', { name: 'Refresh queue' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Approve & publish' }).click()
  await expect(
    page.getByText('2 pending proposals.', { exact: true }),
  ).toBeVisible()
})

test('inline edits can be cancelled or saved before approval and keep the selected listing', async ({
  page,
}) => {
  await page.goto('/review')
  await page
    .getByRole('navigation', { name: 'Pending proposals' })
    .getByRole('button', { name: /Review test program/ })
    .click()
  await page
    .getByRole('button', { name: 'Edit description', exact: true })
    .click()
  const description = page.getByRole('textbox', {
    name: 'Description',
    exact: true,
  })
  await expect(description).toBeFocused()
  await description.fill('An unsaved draft.')
  await expect(
    page.getByRole('button', { name: 'Approve & publish' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByText('An unsaved draft.')).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Edit description', exact: true })
    .click()
  await description.fill('Corrected details from the reviewer.')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByText('Changes saved. This listing is still awaiting approval.'),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Review test program', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Corrected details from the reviewer.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Edit name', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Corrected program name')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Corrected program name', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Edit application link', exact: true })
    .click()
  const application = page.getByRole('textbox', {
    name: 'Application link',
    exact: true,
  })
  await application.fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('HTTP or HTTPS URL')
  await expect(application).toHaveValue('javascript:alert(1)')
  await application.fill('https://example.org/corrected-application')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('link', {
      name: /https:\/\/example.org\/corrected-application/,
    }),
  ).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  const [row] = await withDatabase(url, (db) =>
    db.select().from(offerings).where(eq(offerings.id, ids.offering)),
  )
  expect(row.status).toBe('pending_review')
  expect(row.description).toBe('Corrected details from the reviewer.')
  expect(row.applyUrl).toBe('https://example.org/corrected-application')
})

test('a stale inline save preserves the draft and requires refresh', async ({
  page,
}) => {
  await page.goto('/review')
  await page.getByRole('button', { name: 'Edit name', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Name', exact: true })
  await input.fill('Stale draft')
  await withDatabase(url, (db) =>
    db
      .update(organizations)
      .set({ displayName: 'Changed elsewhere' })
      .where(eq(organizations.id, ids.organization)),
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Proposal changed')
  await expect(input).toHaveValue('Stale draft')
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await withDatabase(url, (db) =>
    refreshTagsAfterContentEdit(
      db,
      'organization',
      ids.organization,
      localReviewerId,
    ),
  )
  await page.getByRole('button', { name: 'Refresh queue', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Changed elsewhere', exact: true }),
  ).toBeVisible()
})

test.describe('native date editors', () => {
  test.use({ timezoneId: 'America/Los_Angeles' })
  test('native date controls use the event timezone, support clearing, and remain accessible', async ({
    page,
  }) => {
    await withDatabase(url, (db) =>
      db
        .update(events)
        .set({ startsAt: new Date('2026-11-20T18:00:00Z') })
        .where(eq(events.id, ids.event)),
    )
    await withDatabase(url, (db) =>
      refreshTagsAfterContentEdit(db, 'event', ids.event, localReviewerId),
    )
    await page.goto('/review')
    await page
      .getByRole('navigation', { name: 'Pending proposals' })
      .getByRole('button', { name: /Review test event/ })
      .click()
    await page.getByRole('button', { name: 'Edit starts', exact: true }).click()
    const starts = page.getByLabel('Starts', { exact: true })
    await expect(starts).toHaveAttribute('type', 'datetime-local')
    await expect(starts).toHaveValue('2026-11-20T13:00')
    await expect(
      page.getByText('Time in America/Detroit. Blank clears the date.'),
    ).toBeVisible()
    await starts.fill('2026-11-21T14:30')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(
      page.getByText('Changes saved. This listing is still awaiting approval.'),
    ).toBeVisible()
    const [saved] = await withDatabase(url, (db) =>
      db.select().from(events).where(eq(events.id, ids.event)),
    )
    expect(saved.startsAt?.toISOString()).toBe('2026-11-21T19:30:00.000Z')
    expect(saved.status).toBe('pending_review')
    await page.getByRole('button', { name: 'Edit ends', exact: true }).click()
    const ends = page.getByLabel('Ends', { exact: true })
    await expect(ends).toHaveAttribute('type', 'datetime-local')
    await ends.fill('2026-11-20T12:00')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(
      'End time must be on or after',
    )
    await ends.fill('2026-11-21T15:30')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(ends).toHaveCount(0)
    await page.getByRole('button', { name: 'Edit ends', exact: true }).click()
    await ends.fill('')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(ends).toHaveCount(0)
    const [cleared] = await withDatabase(url, (db) =>
      db.select().from(events).where(eq(events.id, ids.event)),
    )
    expect(cleared.endsAt).toBeNull()
    await page.getByRole('button', { name: 'Edit starts', exact: true }).click()
    await expect(starts).toHaveValue('2026-11-21T14:30')
    await page.setViewportSize({ width: 390, height: 844 })
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
  })
})

test('loading errors offer a refresh and recover without retrying a decision', async ({
  page,
}) => {
  let unavailable = true
  await page.route('**/api/v1/review.listProposals', (route) => {
    if (unavailable)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Review queue temporarily unavailable.' },
        }),
      })
    return route.continue()
  })
  await page.goto('/review')
  await expect(page.getByRole('alert')).toContainText(
    'Review queue temporarily unavailable.',
  )
  unavailable = false
  await withDatabase(url, (db) =>
    refreshTagsAfterContentEdit(
      db,
      'organization',
      ids.organization,
      localReviewerId,
    ),
  )
  await page.getByRole('button', { name: 'Refresh queue' }).click()
  await expect(
    page.getByText('3 pending proposals.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('review details and filters are accessible and fit a narrow viewport', async ({
  page,
}) => {
  await page.goto('/review')
  await expect(
    page.getByText('3 pending proposals.', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('Type', { exact: true }).selectOption('offering')
  await expect(
    page.getByRole('heading', { name: 'Review test program', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Practical training with a clear next step.'),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Edit description', exact: true })
    .click()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
})
