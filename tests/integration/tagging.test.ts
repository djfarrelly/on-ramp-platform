import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { eq, sql } from 'drizzle-orm'
import { createDatabase, type Database } from '../../src/db/client'
import {
  offerings,
  organizations,
  tags,
  offeringTags,
  taggingRuns,
  taggingProposals,
  taggingSuggestions,
} from '../../src/db/schema'
import { localReviewerId } from '../../src/services/ingestion/bootstrap'
import { seedReviewFixtures, reviewFixtureIds as ids } from '../fixtures/review'
import { listReviewQueue } from '../../src/services/review'
import {
  runTaggingBatch,
  listTaggingProposals,
  editTaggingProposal,
  decideTaggingProposal,
  listTaggingCandidates,
  openRecordTagReview,
} from '../../src/services/tagging'

const url = process.env.TEST_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Isolated _test database required')
const pool = new pg.Pool({ connectionString: url, max: 2 }),
  db = createDatabase(pool)
after(() => pool.end())
class Rollback extends Error {}
async function isolated(run: (tx: Database) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await seedReviewFixtures(tx, false)
      await run(tx)
      throw new Rollback()
    })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  }
}
const pilot = (tx: Database) =>
  runTaggingBatch(
    tx,
    { mode: 'hybrid', recordIds: [ids.offering] },
    {
      model: 'fixture-model',
      classify: async () => ({
        assignments: [
          {
            slug: 'topic-occupational-skills',
            field: 'description',
            quote: 'Practical training',
          },
        ],
        usage: { inputTokens: 12, outputTokens: 4 },
      }),
    },
    localReviewerId,
  )

test('record tag editor reuses current pending suggestions and prepares rules-only drafts for untagged, changed or reviewed records', () =>
  isolated(async (tx) => {
    const first = await openRecordTagReview(
      tx,
      { type: 'offering', id: ids.offering },
      localReviewerId,
    )
    const [run] = await tx
      .select()
      .from(taggingRuns)
      .where(
        eq(
          taggingRuns.id,
          (
            await tx
              .select()
              .from(taggingProposals)
              .where(eq(taggingProposals.id, first.proposal.id))
          )[0].runId,
        ),
      )
    assert.equal(run.mode, 'deterministic')
    assert.equal(run.model, null)
    const reused = await openRecordTagReview(
      tx,
      { type: 'offering', id: ids.offering },
      localReviewerId,
    )
    assert.equal(reused.proposal.id, first.proposal.id)
    await tx
      .update(offerings)
      .set({ description: 'Updated practical training description.' })
      .where(eq(offerings.id, ids.offering))
    const changed = await openRecordTagReview(
      tx,
      { type: 'offering', id: ids.offering },
      localReviewerId,
    )
    assert.notEqual(changed.proposal.id, first.proposal.id)
    assert.equal(
      changed.proposal.record.fields.description,
      'Updated practical training description.',
    )
    await decideTaggingProposal(
      tx,
      {
        proposalId: changed.proposal.id,
        expectedUpdatedAt: changed.proposal.updatedAt,
        decision: 'reject',
      },
      localReviewerId,
    )
    const fresh = await openRecordTagReview(
      tx,
      { type: 'offering', id: ids.offering },
      localReviewerId,
    )
    assert.notEqual(fresh.proposal.id, changed.proposal.id)
    assert.equal(fresh.proposal.status, 'pending_review')
    await assert.rejects(
      openRecordTagReview(
        tx,
        { type: 'event', id: ids.offering },
        localReviewerId,
      ),
      /no longer available/,
    )
  }))

test('listing review shows latest selected suggestions, does not revive rejected suggestions, and flags source edits', () =>
  isolated(async (tx) => {
    await pilot(tx)
    let listing = (await listReviewQueue(tx, localReviewerId)).items.find(
      (p) => p.id === ids.offering,
    )!
    assert.equal(listing.tags.status, 'pending_review')
    assert.equal(listing.tags.stale, false)
    assert.deepEqual(
      listing.tags.suggested.map((t) => t.slug),
      ['topic-occupational-skills'],
    )
    const latestRun = await pilot(tx)
    const p = (await listTaggingProposals(tx, localReviewerId, latestRun.id))
      .items[0]
    await decideTaggingProposal(
      tx,
      { proposalId: p.id, expectedUpdatedAt: p.updatedAt, decision: 'reject' },
      localReviewerId,
    )
    listing = (await listReviewQueue(tx, localReviewerId)).items.find(
      (p) => p.id === ids.offering,
    )!
    assert.equal(listing, undefined)
    await pilot(tx)
    await tx
      .update(offerings)
      .set({ description: 'Changed source text.' })
      .where(eq(offerings.id, ids.offering))
    listing = (await listReviewQueue(tx, localReviewerId)).items.find(
      (p) => p.id === ids.offering,
    )!
    assert.equal(listing, undefined)
  }))

test('tagging snapshots public facts, preserves publication and proposes without applying tags', () =>
  isolated(async (tx) => {
    const run = await pilot(tx)
    assert.equal(run.status, 'success')
    assert.equal(run.itemsCompleted, 1)
    const q = await listTaggingProposals(tx, localReviewerId, run.id)
    assert.equal(q.items.length, 1)
    assert.equal(q.items[0].status, 'pending_review')
    assert.equal(q.items[0].record.type, 'offering')
    assert.equal(q.items[0].suggestions[0].basis, 'model')
    assert.equal(
      (
        await tx
          .select()
          .from(offeringTags)
          .where(eq(offeringTags.offeringId, ids.offering))
      ).length,
      0,
    )
    const [row] = await tx
      .select()
      .from(offerings)
      .where(eq(offerings.id, ids.offering))
    assert.equal(row.status, 'pending_review')
    assert.equal('crmId' in q.items[0].record, false)
    assert.equal(
      (await tx.select().from(tags)).filter((t) =>
        t.slug.startsWith('topic-ai'),
      ).length,
      1,
    )
  }))
test('tag review edits preserve original suggestions and approval applies only selected tags without publishing', () =>
  isolated(async (tx) => {
    const run = await pilot(tx)
    let p = (await listTaggingProposals(tx, localReviewerId, run.id)).items[0]
    await editTaggingProposal(
      tx,
      {
        proposalId: p.id,
        expectedUpdatedAt: p.updatedAt,
        assignments: [
          {
            slug: 'support-training',
            field: 'description',
            quote: 'Practical training',
          },
        ],
        note: 'Reviewed source.',
      },
      localReviewerId,
    )
    p = (await listTaggingProposals(tx, localReviewerId, run.id)).items[0]
    assert.equal(
      p.suggestions.find((s) => s.slug === 'topic-occupational-skills')
        ?.selected,
      false,
    )
    assert.equal(
      p.suggestions.find((s) => s.slug === 'support-training')?.basis,
      'reviewer',
    )
    await decideTaggingProposal(
      tx,
      { proposalId: p.id, expectedUpdatedAt: p.updatedAt, decision: 'approve' },
      localReviewerId,
    )
    const assigned = await tx
      .select({ slug: tags.slug })
      .from(offeringTags)
      .innerJoin(tags, eq(tags.id, offeringTags.tagId))
      .where(eq(offeringTags.offeringId, ids.offering))
    assert.deepEqual(
      assigned.map((r) => r.slug),
      ['support-training'],
    )
    assert.equal(
      (
        await tx.select().from(offerings).where(eq(offerings.id, ids.offering))
      )[0].status,
      'pending_review',
    )
    assert.equal(
      (
        await tx
          .select()
          .from(taggingSuggestions)
          .where(eq(taggingSuggestions.proposalId, p.id))
      ).length,
      2,
    )
  }))
test('rejection changes no canonical assignments and stale listing or proposal decisions fail', () =>
  isolated(async (tx) => {
    const run = await pilot(tx)
    const p = (await listTaggingProposals(tx, localReviewerId, run.id)).items[0]
    await assert.rejects(
      decideTaggingProposal(
        tx,
        {
          proposalId: p.id,
          expectedUpdatedAt: '2000-01-01T00:00:00Z',
          decision: 'approve',
        },
        localReviewerId,
      ),
      /changed/,
    )
    await tx
      .update(offerings)
      .set({ description: 'Changed source content.' })
      .where(eq(offerings.id, ids.offering))
    await assert.rejects(
      decideTaggingProposal(
        tx,
        {
          proposalId: p.id,
          expectedUpdatedAt: p.updatedAt,
          decision: 'approve',
        },
        localReviewerId,
      ),
      /Listing or existing tags changed/,
    )
    await decideTaggingProposal(
      tx,
      { proposalId: p.id, expectedUpdatedAt: p.updatedAt, decision: 'reject' },
      localReviewerId,
    )
    assert.equal(
      (
        await tx
          .select()
          .from(offeringTags)
          .where(eq(offeringTags.offeringId, ids.offering))
      ).length,
      0,
    )
  }))
test('a concurrent tag change blocks approval instead of overwriting a manual assignment', () =>
  isolated(async (tx) => {
    const run = await pilot(tx)
    const p = (await listTaggingProposals(tx, localReviewerId, run.id)).items[0]
    const [tag] = await tx
      .select()
      .from(tags)
      .where(eq(tags.slug, 'support-training'))
    await tx
      .insert(offeringTags)
      .values({ offeringId: ids.offering, tagId: tag.id })
    await assert.rejects(
      decideTaggingProposal(
        tx,
        {
          proposalId: p.id,
          expectedUpdatedAt: p.updatedAt,
          decision: 'approve',
        },
        localReviewerId,
      ),
      /existing tags changed/,
    )
    assert.equal(
      (
        await tx
          .select()
          .from(offeringTags)
          .where(eq(offeringTags.offeringId, ids.offering))
      ).length,
      1,
    )
  }))
test('ungrounded model output is marked failed with a rule-only review fallback and no provider error payload', () =>
  isolated(async (tx) => {
    const run = await runTaggingBatch(
      tx,
      { mode: 'hybrid', recordIds: [ids.offering] },
      {
        model: 'fixture',
        classify: async () => ({
          assignments: [
            {
              slug: 'topic-ai',
              field: 'description',
              quote: 'Invented artificial intelligence course',
            },
          ],
          usage: { inputTokens: 10, outputTokens: 20 },
        }),
      },
      localReviewerId,
    )
    assert.equal(run.status, 'failed')
    assert.equal(run.itemsFailed, 1)
    const p = (await listTaggingProposals(tx, localReviewerId, run.id)).items[0]
    assert.equal(p.errorCode, 'UNGROUNDED_EVIDENCE')
    assert.ok(p.issues.some((s) => s.includes('Only deterministic')))
    assert.ok(!p.suggestions.some((s) => s.slug === 'topic-ai'))
  }))
test('missing configuration fails before creating runs and unsafe source URLs are never exposed', () =>
  isolated(async (tx) => {
    const before = await tx.select().from(taggingRuns)
    await assert.rejects(
      runTaggingBatch(
        tx,
        { mode: 'hybrid' },
        {
          model: 'fixture',
          classify: async () => {
            throw new Error('never called')
          },
          ready: () => {
            throw new Error('Missing Gateway configuration')
          },
        },
        localReviewerId,
      ),
      /Missing Gateway/,
    )
    assert.equal((await tx.select().from(taggingRuns)).length, before.length)
    await tx
      .update(organizations)
      .set({ websiteUrl: 'javascript:alert(1)' })
      .where(eq(organizations.id, ids.organization))
    assert.equal(
      (await listTaggingCandidates(tx)).find((r) => r.id === ids.organization)!
        .url,
      null,
    )
  }))

test('unchanged validated proposals can be reused while edited content triggers a new model call', () =>
  isolated(async (tx) => {
    const first = await pilot(tx)
    let calls = 0
    const ports = {
      model: 'fixture-model',
      classify: async () => {
        calls++
        return { assignments: [], usage: { inputTokens: 1, outputTokens: 1 } }
      },
    }
    const reused = await runTaggingBatch(
      tx,
      { mode: 'hybrid', reuseRunId: first.id },
      ports,
      localReviewerId,
    )
    assert.equal(calls, 0)
    assert.equal(reused.itemsCompleted, 1)
    const p = (await listTaggingProposals(tx, localReviewerId, reused.id))
      .items[0]
    assert.equal(p.suggestions[0].slug, 'topic-occupational-skills')
    await tx
      .update(offerings)
      .set({ description: 'Updated course description.' })
      .where(eq(offerings.id, ids.offering))
    await runTaggingBatch(
      tx,
      { mode: 'hybrid', reuseRunId: first.id },
      ports,
      localReviewerId,
    )
    assert.equal(calls, 1)
  }))
