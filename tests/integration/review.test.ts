import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { eq } from 'drizzle-orm'
import { createDatabase, type Database } from '../../src/db/client'
import { offerings, organizations, events } from '../../src/db/schema'
import { localReviewerId } from '../../src/services/ingestion/bootstrap'
import {
  listReviewQueue,
  decideReviewProposal,
  editReviewProposal,
} from '../../src/services/review'
import { handleReviewRpc } from '../../src/server/review-rpc'
import { reviewFixtureIds as ids, seedReviewFixtures } from '../fixtures/review'

const url = process.env.TEST_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Use pnpm test:db with an isolated database')
const pool = new pg.Pool({ connectionString: url, max: 2 })
const db = createDatabase(pool)
after(() => pool.end())
class RollbackTest extends Error {}
async function isolated(run: (tx: Database) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await seedReviewFixtures(tx)
      await run(tx)
      throw new RollbackTest()
    })
  } catch (error) {
    if (!(error instanceof RollbackTest)) throw error
  }
}
const request = (input: unknown) =>
  new Request('http://localhost:5173/api/v1/review.decideProposal', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

test('review queue exposes factual details, parent blockers and safe source links', () =>
  isolated(async (tx) => {
    const queue = await listReviewQueue(tx, localReviewerId)
    assert.equal(queue.items.length, 3)
    assert.equal(queue.items[0].type, 'organization')
    const program = queue.items.find((p) => p.id === ids.offering)!
    assert.equal(program.parentProposalId, ids.organization)
    assert.match(program.blockedReason!, /organization profile/)
    assert.equal(program.fields.find((f) => f.label === 'Cost')?.value, 'Free')
    assert.equal(
      program.fields.find((f) => f.label === 'Source page')?.href,
      'https://example.org/program',
    )
    await tx
      .update(offerings)
      .set({ url: 'javascript:alert(1)' })
      .where(eq(offerings.id, ids.offering))
    const unsafe = (await listReviewQueue(tx, localReviewerId)).items.find(
      (p) => p.id === ids.offering,
    )!
    assert.equal(unsafe.sourceUrl, null)
    assert.equal(
      unsafe.fields.find((f) => f.label === 'Source page')?.href,
      null,
    )
    for (const key of ['crmId', 'reviewedBy', 'sourceRunId', 'contentHash'])
      assert.equal(key in unsafe, false)
  }))

test('editing keeps proposals pending, preserves identity and provenance, and approval uses saved content', () =>
  isolated(async (tx) => {
    const queue = await listReviewQueue(tx, localReviewerId)
    const parent = queue.items.find((p) => p.id === ids.organization)!
    await editReviewProposal(
      tx,
      {
        type: parent.type,
        id: parent.id,
        expectedUpdatedAt: parent.updatedAt,
        changes: { name: 'Corrected organization' },
      },
      localReviewerId,
    )
    const item = (await listReviewQueue(tx, localReviewerId)).items.find(
      (p) => p.id === ids.offering,
    )!
    const [before] = await tx
      .select()
      .from(offerings)
      .where(eq(offerings.id, item.id))
    const response = await handleReviewRpc(
      request({
        type: item.type,
        id: item.id,
        expectedUpdatedAt: item.updatedAt,
        changes: {
          name: 'Corrected program',
          description: 'A staff-corrected description.',
          costText: ' ',
          deliveryMode: 'hybrid',
        },
      }),
      'review.editProposal',
      true,
      async (run) => run(tx),
    )
    assert.equal(response.status, 200)
    const [saved] = await tx
      .select()
      .from(offerings)
      .where(eq(offerings.id, item.id))
    assert.equal(saved.name, 'Corrected program')
    assert.equal(saved.description, 'A staff-corrected description.')
    assert.equal(saved.costText, null)
    assert.equal(saved.status, 'pending_review')
    for (const key of [
      'slug',
      'url',
      'sourceId',
      'sourceRunId',
      'contentHash',
      'reviewedBy',
      'reviewedAt',
    ] as const)
      assert.deepEqual(saved[key], before[key])
    const updatedQueue = await listReviewQueue(tx, localReviewerId)
    const updatedParent = updatedQueue.items.find((p) => p.id === parent.id)!
    await decideReviewProposal(
      tx,
      {
        type: parent.type,
        id: parent.id,
        expectedUpdatedAt: updatedParent.updatedAt,
        decision: 'approve',
      },
      localReviewerId,
    )
    const updated = (await listReviewQueue(tx, localReviewerId)).items.find(
      (p) => p.id === item.id,
    )!
    await decideReviewProposal(
      tx,
      {
        type: updated.type,
        id: updated.id,
        expectedUpdatedAt: updated.updatedAt,
        decision: 'approve',
      },
      localReviewerId,
    )
    const [published] = await tx
      .select()
      .from(offerings)
      .where(eq(offerings.id, item.id))
    assert.equal(published.description, 'A staff-corrected description.')
    assert.equal(published.slug, before.slug)
    await assert.rejects(
      () =>
        editReviewProposal(
          tx,
          {
            type: item.type,
            id: item.id,
            expectedUpdatedAt: updated.updatedAt,
            changes: { name: 'Too late' },
          },
          localReviewerId,
        ),
      /already been reviewed/,
    )
  }))

test('stale saves cannot overwrite changes and event edits validate the full date range', () =>
  isolated(async (tx) => {
    const item = (await listReviewQueue(tx, localReviewerId)).items.find(
      (p) => p.id === ids.event,
    )!
    await tx
      .update(events)
      .set({ name: 'Changed elsewhere' })
      .where(eq(events.id, item.id))
    const response = await handleReviewRpc(
      request({
        type: item.type,
        id: item.id,
        expectedUpdatedAt: item.updatedAt,
        changes: { name: 'Stale edit' },
      }),
      'review.editProposal',
      true,
      async (run) => run(tx),
    )
    assert.equal(response.status, 409)
    const latest = (await listReviewQueue(tx, localReviewerId)).items.find(
      (p) => p.id === item.id,
    )!
    const invalid = await handleReviewRpc(
      request({
        type: latest.type,
        id: latest.id,
        expectedUpdatedAt: latest.updatedAt,
        changes: {
          startsAt: '2030-11-20T13:00:00-05:00',
          endsAt: '2030-11-19T13:00:00-05:00',
        },
      }),
      'review.editProposal',
      true,
      async (run) => run(tx),
    )
    assert.equal(invalid.status, 400)
    await editReviewProposal(
      tx,
      {
        type: latest.type,
        id: latest.id,
        expectedUpdatedAt: latest.updatedAt,
        changes: {
          startsAt: '2030-11-20T13:00:00-05:00',
          endsAt: '2030-11-20T14:00:00-05:00',
          venueText: 'Corrected venue',
        },
      },
      localReviewerId,
    )
    const [saved] = await tx.select().from(events).where(eq(events.id, item.id))
    assert.equal(saved.name, 'Changed elsewhere')
    assert.equal(saved.startsAt?.toISOString(), '2030-11-20T18:00:00.000Z')
    assert.equal(saved.status, 'pending_review')
  }))
test('local RPC approves the parent first, publishes a program and records the fixed local reviewer', () =>
  isolated(async (tx) => {
    const queue = await listReviewQueue(tx, localReviewerId)
    const program = queue.items.find((p) => p.id === ids.offering)!
    const input = (p: typeof program) => ({
      type: p.type,
      id: p.id,
      decision: 'approve',
      expectedUpdatedAt: p.updatedAt,
    })
    assert.equal(
      (
        await handleReviewRpc(
          request(input(program)),
          'review.decideProposal',
          true,
          async (run) => run(tx),
        )
      ).status,
      409,
    )
    const parent = queue.items.find((p) => p.id === ids.organization)!
    const published = await handleReviewRpc(
      request(input(parent)),
      'review.decideProposal',
      true,
      async (run) => run(tx),
    )
    assert.equal(published.status, 200)
    assert.equal(published.headers.get('cache-control'), 'no-store')
    const refreshed = (await listReviewQueue(tx, localReviewerId)).items.find(
      (p) => p.id === ids.offering,
    )!
    assert.equal(refreshed.blockedReason, null)
    const result = await decideReviewProposal(
      tx,
      { ...input(refreshed), decision: 'approve' },
      localReviewerId,
    )
    assert.equal(result.publishedPath, '/programs/review-test-program')
    const [row] = await tx
      .select()
      .from(offerings)
      .where(eq(offerings.id, ids.offering))
    assert.equal(row.status, 'published')
    assert.equal(row.reviewedBy, localReviewerId)
    assert.ok(row.reviewedAt)
  }))
test('stale and duplicate decisions fail; rejection removes a proposal without publishing', () =>
  isolated(async (tx) => {
    const event = (await listReviewQueue(tx, localReviewerId)).items.find(
      (p) => p.id === ids.event,
    )!
    await tx
      .update(events)
      .set({ updatedAt: new Date(Date.parse(event.updatedAt) + 1000) })
      .where(eq(events.id, ids.event))
    const stale = await handleReviewRpc(
      request({
        type: event.type,
        id: event.id,
        decision: 'reject',
        expectedUpdatedAt: event.updatedAt,
      }),
      'review.decideProposal',
      true,
      async (run) => run(tx),
    )
    assert.equal(stale.status, 409)
    const latest = (await listReviewQueue(tx, localReviewerId)).items.find(
      (p) => p.id === ids.event,
    )!
    const input = {
      type: latest.type,
      id: latest.id,
      decision: 'reject' as const,
      expectedUpdatedAt: latest.updatedAt,
    }
    const result = await decideReviewProposal(tx, input, localReviewerId)
    assert.equal(result.publishedPath, null)
    assert.ok(
      !(await listReviewQueue(tx, localReviewerId)).items.some(
        (p) => p.id === ids.event,
      ),
    )
    assert.equal(
      (
        await handleReviewRpc(
          request(input),
          'review.decideProposal',
          true,
          async (run) => run(tx),
        )
      ).status,
      409,
    )
    assert.equal(
      (
        await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, ids.organization))
      )[0].status,
      'pending_review',
    )
  }))
