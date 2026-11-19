import { test, expect } from 'playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { eq, inArray, or } from 'drizzle-orm'
import { withDatabase } from '../../src/db/client'
import {
  offerings,
  offeringTags,
  taggingProposals,
  taggingSuggestions,
  taggingRuns,
} from '../../src/db/schema'
import {
  seedReviewFixtures,
  clearReviewFixtures,
  reviewFixtureIds as ids,
} from '../fixtures/review'
import { runTaggingBatch } from '../../src/services/tagging'
import { localReviewerId } from '../../src/services/ingestion/bootstrap'
const url = process.env.BROWSER_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Isolated browser _test database required')
async function cleanup() {
  await withDatabase(url!, async (db) => {
    const proposals = await db
      .select()
      .from(taggingProposals)
      .where(
        or(
          eq(taggingProposals.offeringId, ids.offering),
          eq(taggingProposals.organizationId, ids.organization),
          eq(taggingProposals.eventId, ids.event),
        ),
      )
    if (proposals.length) {
      await db.delete(taggingSuggestions).where(
        inArray(
          taggingSuggestions.proposalId,
          proposals.map((p) => p.id),
        ),
      )
      await db.delete(taggingProposals).where(
        inArray(
          taggingProposals.id,
          proposals.map((p) => p.id),
        ),
      )
      await db.delete(taggingRuns).where(
        inArray(
          taggingRuns.id,
          proposals.map((p) => p.runId),
        ),
      )
    }
    await db
      .delete(offeringTags)
      .where(eq(offeringTags.offeringId, ids.offering))
    await clearReviewFixtures(db)
  })
}
test.beforeEach(async () => {
  await cleanup()
  await withDatabase(url!, async (db) => {
    await seedReviewFixtures(db)
    await db
      .update(offerings)
      .set({ description: 'This workshop teaches artificial intelligence.' })
      .where(eq(offerings.id, ids.offering))
    await runTaggingBatch(
      db,
      { mode: 'hybrid', recordIds: [ids.offering] },
      {
        model: 'browser-fixture',
        classify: async () => ({
          assignments: [
            {
              slug: 'topic-ai',
              field: 'description',
              quote: 'artificial intelligence',
            },
          ],
          usage: { inputTokens: 10, outputTokens: 10 },
        }),
      },
      localReviewerId,
    )
  })
})
test.afterEach(cleanup)
test('edit grouped tags inline, search the vocabulary, cancel drafts and save evidence-backed suggestions', async ({
  page,
}) => {
  await page.goto('/review')
  await page.getByRole('button', { name: /Review test program/ }).click()
  const panel = page.getByRole('region', { name: 'Tags', exact: true })
  await panel.getByRole('button', { name: 'Edit tags', exact: true }).click()
  await expect(
    panel.getByRole('button', { name: 'Remove Artificial intelligence' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Approve & publish', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: /Review test organization/ }).first(),
  ).toBeDisabled()
  await panel
    .getByRole('button', { name: 'Remove Artificial intelligence' })
    .click()
  await panel.getByRole('button', { name: 'Cancel tag editing' }).click()
  await expect(
    panel.getByText('Artificial intelligence', { exact: true }).first(),
  ).toBeVisible()
  await panel.getByRole('button', { name: 'Edit tags', exact: true }).click()
  const search = panel.getByLabel('Search available tags')
  await search.fill('no-such-tag-xyz')
  await expect(
    panel.getByText('No matching tags. Try another search or category.'),
  ).toBeVisible()
  await search.fill('training')
  await panel.getByLabel('Category', { exact: true }).selectOption('support')
  await panel
    .getByRole('button', { name: 'Add Training & education', exact: true })
    .click()
  await panel.getByLabel('Supporting quote').fill('Not in this source')
  await expect(
    panel.getByRole('button', { name: 'Add to suggestions', exact: true }),
  ).toBeDisabled()
  await panel.getByLabel('Supporting quote').fill('This workshop')
  await panel
    .getByRole('button', { name: 'Add to suggestions', exact: true })
    .click()
  await expect(
    panel.getByRole('button', { name: 'Remove Training & education' }),
  ).toBeVisible()
  await panel
    .getByRole('button', { name: 'Remove Artificial intelligence' })
    .click()
  await panel
    .getByRole('button', { name: 'Save tag edits', exact: true })
    .click()
  await expect(
    panel.getByText(
      'Tags saved. Approve & publish will approve this listing and its tags together.',
    ),
  ).toBeVisible()
  await expect(
    panel.getByText('Training & education', { exact: true }).first(),
  ).toBeVisible()
  await expect(
    panel.getByText('Artificial intelligence', { exact: true }),
  ).toHaveCount(0)
  await expect(panel.getByText('Type of help', { exact: true })).toHaveClass(
    /font-bold/,
  )
  const state = await withDatabase(url!, async (db) => ({
    listing: (
      await db.select().from(offerings).where(eq(offerings.id, ids.offering))
    )[0],
    tags: await db
      .select()
      .from(offeringTags)
      .where(eq(offeringTags.offeringId, ids.offering)),
    proposal: (
      await db
        .select()
        .from(taggingProposals)
        .where(eq(taggingProposals.offeringId, ids.offering))
    )[0],
  }))
  expect(state.listing.status).toBe('pending_review')
  expect(state.proposal.status).toBe('pending_review')
  expect(state.tags).toEqual([])
})
test('untagged records stay out of review and the separate tag review page is removed', async ({
  page,
  request,
}) => {
  await withDatabase(url!, async (db) => {
    const proposals = await db
      .select()
      .from(taggingProposals)
      .where(eq(taggingProposals.organizationId, ids.organization))
    await db.delete(taggingSuggestions).where(
      inArray(
        taggingSuggestions.proposalId,
        proposals.map((p) => p.id),
      ),
    )
    await db
      .delete(taggingProposals)
      .where(eq(taggingProposals.organizationId, ids.organization))
  })
  await page.goto('/review')
  await expect(
    page.getByRole('heading', {
      name: 'Review test organization',
      exact: true,
    }),
  ).toHaveCount(0)
  await expect(
    page.getByText('1 record is still awaiting tagging in ingestion.', {
      exact: false,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Review tags (Admin)' }),
  ).toHaveCount(0)
  expect((await request.get('/review-tags')).status()).toBe(404)
})
test('one review approves the listing and its edited tags together', async ({
  page,
}) => {
  await page.goto('/review')
  await page
    .getByRole('button', { name: 'Approve & publish', exact: true })
    .click()
  await expect(
    page.getByText('Published: Review test organization.', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: /Review test program/ }).click()
  const panel = page.getByRole('region', { name: 'Tags', exact: true })
  await panel.getByText('Tag source evidence', { exact: true }).click()
  await expect(
    panel.getByText('description: “artificial intelligence”', { exact: true }),
  ).toBeVisible()
  await panel.getByRole('button', { name: 'Edit tags', exact: true }).click()
  await panel.getByLabel('Search available tags').fill('training')
  await panel
    .getByRole('button', { name: 'Add Training & education', exact: true })
    .click()
  await panel.getByLabel('Supporting quote').fill('This workshop')
  await panel
    .getByRole('button', { name: 'Add to suggestions', exact: true })
    .click()
  await panel
    .getByRole('button', { name: 'Remove Artificial intelligence' })
    .click()
  await panel
    .getByRole('button', { name: 'Save tag edits', exact: true })
    .click()
  await expect(panel.getByText('Tags saved.', { exact: false })).toBeVisible()
  await page
    .getByRole('button', { name: 'Approve & publish', exact: true })
    .click()
  await expect(
    page.getByText('Published: Review test program.', { exact: false }),
  ).toBeVisible()
  const state = await withDatabase(url!, async (db) => ({
    listing: (
      await db.select().from(offerings).where(eq(offerings.id, ids.offering))
    )[0],
    tags: await db
      .select()
      .from(offeringTags)
      .where(eq(offeringTags.offeringId, ids.offering)),
    proposal: (
      await db
        .select()
        .from(taggingProposals)
        .where(eq(taggingProposals.offeringId, ids.offering))
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0],
  }))
  expect(state.listing.status).toBe('published')
  expect(state.proposal.status).toBe('approved')
  expect(state.tags).toHaveLength(1)
})
test('tag review works on mobile and has no serious accessibility violations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/review')
  await page.getByRole('button', { name: /Review test program/ }).click()
  await expect(
    page.getByRole('region', { name: 'Tags', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('region', { name: 'Tags', exact: true })
    .getByRole('button', { name: 'Edit tags', exact: true })
    .click()
  await expect(page.getByLabel('Search available tags')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Cancel tag editing', exact: true }),
  ).toHaveCSS('opacity', '1')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  const listingResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(
    listingResults.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    ),
  ).toEqual([])
  await page
    .getByRole('region', { name: 'Tags', exact: true })
    .screenshot({ path: '.data/review-tag-editor-mobile.png' })
})
