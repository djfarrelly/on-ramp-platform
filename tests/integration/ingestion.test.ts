import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { and, eq, sql } from 'drizzle-orm'
import { createDatabase, type Database } from '../../src/db/client'
import { runTaggingBatch } from '../../src/services/tagging'
import { listRecordTagState } from '../../src/services/tagging/readiness'
import { getEvent, DirectoryNotFoundError } from '../../src/services/directory'
import { camwEventPage, ingestionPages } from '../fixtures/ingestion-pages'
import {
  organizations,
  offerings,
  events,
  sources,
  sourceRuns,
  offeringTags,
  eventTags,
  tags,
} from '../../src/db/schema'
import {
  bootstrapIngestion,
  initialSources,
  localReviewerId,
} from '../../src/services/ingestion/bootstrap'
import {
  configureSource,
  getRun,
  recordTermsReview,
  runSource,
} from '../../src/services/ingestion'
import {
  listProposals,
  reviewProposal,
} from '../../src/services/ingestion/review'
import {
  sourceConfig,
  emptyFacts,
  type IngestionPorts,
} from '../../src/services/ingestion/contracts'
import {
  bootstrapIngestionBatch,
  randomBatchKey,
  randomBatchProfiles,
  randomBatchSources,
  southeastBatchKey,
  southeastBatchProfiles,
  southeastBatchSources,
  remainingBatchKey,
  remainingBatchProfiles,
  remainingBatchSources,
} from '../../src/services/ingestion/batches'
import { listReviewQueue } from '../../src/services/review'
import { tagPendingIngestion } from '../../src/services/tagging/ingestion'

const connectionString = process.env.TEST_DATABASE_URL
if (!connectionString || !new URL(connectionString).pathname.endsWith('_test'))
  throw new Error('Use pnpm test:db and an isolated _test database')
const pool = new pg.Pool({ connectionString, max: 2 })
const db = createDatabase(pool)
after(() => pool.end())
class RollbackTest extends Error {}
async function isolated(
  run: (tx: Database, ids: { id: string; key: string }[]) => Promise<void>,
) {
  try {
    await db.transaction(async (tx) => {
      const setup = await bootstrapIngestion(tx)
      for (const source of setup.sources)
        await recordTermsReview(
          tx,
          source.id,
          'Fixture source terms reviewed for integration tests only',
        )
      await run(tx, setup.sources)
      throw new RollbackTest()
    })
  } catch (error) {
    if (!(error instanceof RollbackTest)) throw error
  }
}
const programUrl = 'https://www.grcc.edu/program/technical-training'
test('ingestion tags records before review, holds model failures and can retry unchanged listings', () =>
  isolated(async (tx, ids) => {
    const sourceId = ids[2].id
    await programConfig(tx, sourceId)
    const ports = portsFor('This workshop teaches data analytics.')
    ports.tagging = {
      model: 'ingestion-fixture',
      classify: async () => {
        throw new Error('Fixture model failure')
      },
    }
    const run = await runSource(tx, { sourceId }, ports)
    assert.equal(run.status, 'success')
    const [listing] = await tx
      .select()
      .from(offerings)
      .where(eq(offerings.sourceId, sourceId))
    assert.equal(
      (await listReviewQueue(tx, localReviewerId)).items.some(
        (p) => p.id === listing.id,
      ),
      false,
    )
    assert.equal(
      (run.diagnostics as { tagging: { waiting: number } }).tagging.waiting > 0,
      true,
    )
    await tagPendingIngestion(
      tx,
      localReviewerId,
      { model: null },
      [listing.id],
      true,
    )
    const ready = (await listReviewQueue(tx, localReviewerId)).items.find(
      (p) => p.id === listing.id,
    )!
    assert.ok(ready.tags.suggested.some((t) => t.slug === 'topic-data'))
    assert.equal(ready.tags.ready, true)
    assert.equal(
      (await tx.select().from(offerings).where(eq(offerings.id, listing.id)))[0]
        .status,
      'pending_review',
    )
    assert.deepEqual(
      await tx
        .select()
        .from(offeringTags)
        .where(eq(offeringTags.offeringId, listing.id)),
      [],
    )
  }))
test('remaining Southeast setup is isolated and preserves existing source holds and organization edits', () =>
  isolated(async (tx) => {
    await bootstrapIngestionBatch(tx, randomBatchKey)
    await bootstrapIngestionBatch(tx, southeastBatchKey)
    const oldSource = southeastBatchSources.find((s) => !s.enabled)!
    await tx
      .update(sources)
      .set({ termsReviewNote: 'Prior publisher hold' })
      .where(eq(sources.id, oldSource.id))
    const setup = await bootstrapIngestionBatch(tx, remainingBatchKey)
    assert.equal(setup.createdOrganizations, 12)
    assert.equal(setup.createdSources, 13)
    const profile = remainingBatchProfiles[0]
    await tx
      .update(organizations)
      .set({ shortDescription: 'Edited remaining profile' })
      .where(eq(organizations.id, profile.id))
    const source = remainingBatchSources.find((s) => s.enabled)!
    await tx
      .update(sources)
      .set({ isEnabled: false, termsReviewNote: 'Editorial hold' })
      .where(eq(sources.id, source.id))
    const repeated = await bootstrapIngestionBatch(tx, remainingBatchKey)
    assert.equal(repeated.createdOrganizations, 0)
    assert.equal(repeated.createdSources, 0)
    const [saved] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, source.id))
    assert.equal(saved.isEnabled, false)
    assert.equal(saved.termsReviewNote, 'Editorial hold')
    const [org] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, profile.id))
    assert.equal(org.shortDescription, 'Edited remaining profile')
    assert.equal(org.status, 'pending_review')
    const [prior] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, oldSource.id))
    assert.equal(prior.isEnabled, false)
    assert.equal(prior.termsReviewNote, 'Prior publisher hold')
    for (const restricted of remainingBatchSources.filter((s) => !s.enabled)) {
      const [stored] = await tx
        .select()
        .from(sources)
        .where(eq(sources.id, restricted.id))
      assert.equal(stored.isEnabled, false)
      assert.equal(stored.termsReviewedAt, null)
    }
  }))
test('batch registration is idempotent and preserves profile edits, source policy and source configuration', () =>
  isolated(async (tx, existingSources) => {
    const initial = await bootstrapIngestionBatch(tx, randomBatchKey)
    assert.equal(initial.createdOrganizations, 20)
    assert.equal(initial.createdSources, 21)
    const profile = randomBatchProfiles[0]
    const source = randomBatchSources.find((s) => s.enabled)!
    await tx
      .update(organizations)
      .set({ shortDescription: 'Edited profile' })
      .where(eq(organizations.id, profile.id))
    await tx
      .update(sources)
      .set({
        isEnabled: false,
        termsReviewNote: 'Editorial hold',
        config: { ...source.config, limit: 1, timezone: 'UTC' },
      })
      .where(eq(sources.id, source.id))
    const repeated = await bootstrapIngestionBatch(tx, randomBatchKey)
    assert.equal(repeated.createdOrganizations, 0)
    assert.equal(repeated.createdSources, 0)
    const [org] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, profile.id))
    const [saved] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, source.id))
    assert.equal(org.shortDescription, 'Edited profile')
    assert.equal(org.status, 'pending_review')
    assert.equal(saved.isEnabled, false)
    assert.equal(saved.termsReviewNote, 'Editorial hold')
    assert.equal(sourceConfig.parse(saved.config).timezone, 'UTC')
    assert.ok(
      (
        await tx
          .select()
          .from(sources)
          .where(eq(sources.id, existingSources[0].id))
      ).length,
    )
  }))
const now = () => new Date('2026-11-12T12:00:00Z')
test('Southeast registration preserves prior batches and shared City source ownership on repeated setup', () =>
  isolated(async (tx) => {
    await bootstrapIngestionBatch(tx, randomBatchKey)
    const setup = await bootstrapIngestionBatch(tx, southeastBatchKey)
    assert.equal(setup.createdOrganizations, 20)
    assert.equal(setup.createdSources, 22)
    const city = southeastBatchProfiles.find(
      (p) => p.name === 'City of Detroit',
    )!
    for (const source of city.sources) {
      const [stored] = await tx
        .select()
        .from(sources)
        .where(eq(sources.id, source.id))
      assert.equal(stored.organizationId, city.id)
    }
    const source = southeastBatchSources.find((s) => s.enabled)!
    await tx
      .update(sources)
      .set({ isEnabled: false, termsReviewNote: 'Keep source paused' })
      .where(eq(sources.id, source.id))
    const repeated = await bootstrapIngestionBatch(tx, southeastBatchKey)
    assert.equal(repeated.createdOrganizations, 0)
    assert.equal(repeated.createdSources, 0)
    const [saved] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, source.id))
    assert.equal(saved.isEnabled, false)
    assert.equal(saved.termsReviewNote, 'Keep source paused')
    const [prior] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, randomBatchProfiles[0].id))
    assert.equal(prior.displayName, randomBatchProfiles[0].name)
  }))
function portsFor(
  description = 'Build practical skills.',
  snapshots = new Map<string, unknown>(),
): IngestionPorts {
  return {
    now,
    fetchDocument: async (url) => ({
      url,
      contentType: 'text/html',
      fetchedAt: now().toISOString(),
      body: `<html><body><main><h1>Technical Training</h1><p>${description}</p></main></body></html>`,
    }),
    saveSnapshot: async (id, path, value) => {
      const key = `${id}/${path}`
      snapshots.set(key, value)
      return key
    },
  }
}
async function programConfig(tx: Database, sourceId: string) {
  return configureSource(tx, sourceId, {
    ...initialSources[2].config,
    discovery: { type: 'pages', urls: [programUrl] },
    dom: {
      scope: 'main',
      fields: {
        name: { selector: 'h1', required: true },
        description: { selector: 'p', required: true },
      },
    },
  })
}
async function approve(
  tx: Database,
  type: 'organization' | 'offering' | 'event',
  id: string,
) {
  const table =
    type === 'organization'
      ? organizations
      : type === 'offering'
        ? offerings
        : events
  const [row] = await tx.select().from(table).where(eq(table.id, id))
  let state = (
    await listRecordTagState(tx, [{ type, id, updatedAt: row.updatedAt }])
  ).get(id)!
  if (!state.ready) {
    await runTaggingBatch(
      tx,
      { mode: 'hybrid', recordIds: [id] },
      {
        model: 'approval-fixture',
        classify: async (r) => ({
          assignments: [
            { slug: 'support-training', field: 'name', quote: r.fields.name },
          ],
          usage: { inputTokens: 0, outputTokens: 0 },
        }),
      },
      localReviewerId,
    )
    state = (
      await listRecordTagState(tx, [{ type, id, updatedAt: row.updatedAt }])
    ).get(id)!
  }
  return reviewProposal(
    tx,
    {
      type,
      id,
      decision: 'approve',
      expectedUpdatedAt: row.updatedAt.toISOString(),
      expectedTagProposal: state.proposal,
    },
    localReviewerId,
  )
}

test('ingestion snapshots evidence, creates unpublished proposals, and reruns without duplicates', () =>
  isolated(async (tx, ids) => {
    const sourceId = ids[2].id
    await programConfig(tx, sourceId)
    const snapshots = new Map<string, unknown>()
    const ports = portsFor('Build practical skills.', snapshots)
    const first = await runSource(tx, { sourceId }, ports)
    assert.equal(first.status, 'success')
    assert.equal(first.itemsProposed, 1)
    assert.ok(snapshots.has(first.rawSnapshotKey!))
    assert.ok(first.configSnapshot)
    const rows = await tx
      .select()
      .from(offerings)
      .where(eq(offerings.sourceId, sourceId))
    assert.equal(rows.length, 1)
    assert.equal(rows[0].status, 'pending_review')
    assert.equal(rows[0].sourceRunId, first.id)
    assert.equal(rows[0].url, programUrl)
    const second = await runSource(tx, { sourceId }, ports)
    assert.equal(second.itemsProposed, 0)
    assert.equal(second.itemsUnchanged, 1)
    assert.equal(
      (
        await tx
          .select()
          .from(offerings)
          .where(eq(offerings.sourceId, sourceId))
      ).length,
      1,
    )
  }))

test('new program sources retain DB selectors, create bounded review proposals and deduplicate reruns', () =>
  isolated(async (tx, ids) => {
    for (const key of [
      'wcc-programs',
      'innovate-marquette-programs',
      'michigan-sbdc-programs',
    ] as const) {
      const sourceId = ids.find((s) => s.key === key)!.id
      const source = initialSources.find((s) => s.config.key === key)!
      const ports: IngestionPorts = {
        ...portsFor(),
        fetchDocument: async (url) => ({
          url,
          contentType: 'text/html',
          fetchedAt: now().toISOString(),
          body: ingestionPages[key],
        }),
      }
      const first = await runSource(tx, { sourceId }, ports)
      assert.equal(first.status, 'success')
      assert.equal(first.itemsProposed, source.config.limit)
      const rows = await tx
        .select()
        .from(offerings)
        .where(eq(offerings.sourceId, sourceId))
      assert.equal(rows.length, source.config.limit)
      assert.ok(
        rows.every(
          (row) =>
            row.status === 'pending_review' && row.sourceRunId === first.id,
        ),
      )
      const second = await runSource(tx, { sourceId }, ports)
      assert.equal(second.itemsProposed, 0)
      assert.equal(second.itemsUnchanged, source.config.limit)
    }
    const techTownId = ids.find((s) => s.key === 'techtown-programs')!.id
    await assert.rejects(
      () =>
        runSource(
          tx,
          { sourceId: techTownId },
          {
            ...portsFor(),
            fetchDocument: async () => {
              throw new Error('Disabled source must not fetch')
            },
          },
        ),
      /Source is disabled/,
    )
    // Repeat setup preserves edits, review status and source policy restrictions.
    const sourceId = ids.find((s) => s.key === 'wcc-programs')!.id
    await tx
      .update(sources)
      .set({ config: { ...initialSources[4].config, limit: 1 } })
      .where(eq(sources.id, sourceId))
    await bootstrapIngestion(tx)
    const [edited] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, sourceId))
    assert.equal(sourceConfig.parse(edited.config).limit, 1)
  }))

test('CAMW link discovery imports unpublished dated events and reruns without duplicates', () =>
  isolated(async (tx, ids) => {
    const sourceId = ids.find(
      (s) => s.key === 'capital-area-mi-works-events',
    )!.id
    const source = initialSources.find(
      (s) => s.config.key === 'capital-area-mi-works-events',
    )!
    const root =
      '<main>' +
      Array.from(
        { length: 7 },
        (_, i) => `<a href="/events/workshop-${i}">Workshop</a>`,
      ).join('') +
      '</main>'
    const ports: IngestionPorts = {
      ...portsFor(),
      fetchDocument: async (url) => ({
        url,
        contentType: 'text/html',
        fetchedAt: now().toISOString(),
        body: url === source.url ? root : camwEventPage,
      }),
    }
    const first = await runSource(tx, { sourceId }, ports)
    assert.equal(first.status, 'success')
    assert.equal(first.itemsProposed, 5)
    const rows = await tx
      .select()
      .from(events)
      .where(eq(events.sourceId, sourceId))
    assert.equal(rows.length, 5)
    assert.ok(
      rows.every(
        (row) =>
          row.status === 'pending_review' &&
          row.startsAt?.toISOString() === '2026-11-20T18:00:00.000Z',
      ),
    )
    const second = await runSource(tx, { sourceId }, ports)
    assert.equal(second.itemsProposed, 0)
    assert.equal(second.itemsUnchanged, 5)
  }))

test('published changes wait for review, then retain the canonical ID and slug', () =>
  isolated(async (tx, ids) => {
    const sourceId = ids[2].id
    await programConfig(tx, sourceId)
    await runSource(tx, { sourceId }, portsFor('Original description.'))
    const [source] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, sourceId))
    await approve(tx, 'organization', source.organizationId!)
    const [original] = await tx
      .select()
      .from(offerings)
      .where(eq(offerings.sourceId, sourceId))
    await approve(tx, 'offering', original.id)
    const run = await runSource(
      tx,
      { sourceId },
      portsFor('Updated description with data analytics.'),
    )
    assert.equal(run.itemsProposed, 1)
    const [unchangedPublic] = await tx
      .select()
      .from(offerings)
      .where(eq(offerings.id, original.id))
    assert.equal(unchangedPublic.description, 'Original description.')
    const [pending] = await tx
      .select()
      .from(offerings)
      .where(
        and(
          eq(offerings.supersedesId, original.id),
          eq(offerings.status, 'pending_review'),
        ),
      )
    assert.equal(
      pending.description,
      'Updated description with data analytics.',
    )
    const repeated = await runSource(
      tx,
      { sourceId },
      portsFor('Updated description with data analytics.'),
    )
    assert.equal(repeated.itemsUnchanged, 1)
    const reviewed = await approve(tx, 'offering', pending.id)
    assert.equal(reviewed.id, original.id)
    const [published] = await tx
      .select()
      .from(offerings)
      .where(eq(offerings.id, original.id))
    assert.equal(published.slug, original.slug)
    assert.equal(
      published.description,
      'Updated description with data analytics.',
    )
    assert.ok(
      (
        await tx
          .select({ slug: tags.slug })
          .from(offeringTags)
          .innerJoin(tags, eq(tags.id, offeringTags.tagId))
          .where(eq(offeringTags.offeringId, original.id))
      ).some((t) => t.slug === 'topic-data'),
    )
    assert.equal(published.reviewedBy, localReviewerId)
    assert.equal(
      (await tx.select().from(offerings).where(eq(offerings.id, pending.id)))[0]
        .status,
      'archived',
    )
  }))

test('rejection and stale review protection prevent accidental publication', () =>
  isolated(async (tx, ids) => {
    const sourceId = ids[2].id
    await programConfig(tx, sourceId)
    await runSource(tx, { sourceId }, portsFor())
    const [p] = await tx
      .select()
      .from(offerings)
      .where(eq(offerings.sourceId, sourceId))
    await assert.rejects(
      () =>
        reviewProposal(
          tx,
          {
            type: 'offering',
            id: p.id,
            decision: 'approve',
            expectedUpdatedAt: '2000-01-01T00:00:00.000Z',
          },
          localReviewerId,
        ),
      /changed/,
    )
    await assert.rejects(
      () => approve(tx, 'offering', p.id),
      /organization profile/,
    )
    await reviewProposal(
      tx,
      {
        type: 'offering',
        id: p.id,
        decision: 'reject',
        expectedUpdatedAt: p.updatedAt.toISOString(),
      },
      localReviewerId,
    )
    const rerun = await runSource(tx, { sourceId }, portsFor())
    assert.equal(rerun.itemsUnchanged, 1)
    assert.equal(
      (await tx.select().from(offerings).where(eq(offerings.id, p.id)))[0]
        .status,
      'rejected',
    )
  }))

test('missing DOM data fails visibly with snapshots and no partial batch', () =>
  isolated(async (tx, ids) => {
    const sourceId = ids[2].id
    await programConfig(tx, sourceId)
    const snapshots = new Map<string, unknown>()
    const ports = portsFor('', snapshots)
    const run = await runSource(tx, { sourceId }, ports)
    assert.equal(run.status, 'failed')
    assert.match(run.errorMessage!, /Required DOM field/)
    assert.ok(snapshots.has(run.rawSnapshotKey!))
    assert.equal(
      (
        await tx
          .select()
          .from(offerings)
          .where(eq(offerings.sourceId, sourceId))
      ).length,
      0,
    )
  }))

test('LLM and deterministic modes share validation and proposal persistence', () =>
  isolated(async (tx, ids) => {
    const sourceId = ids[2].id
    await programConfig(tx, sourceId)
    const [source] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, sourceId))
    await configureSource(tx, sourceId, {
      ...sourceConfig.parse(source.config),
      llm: { model: 'test/model', promptVersion: 'extract-v1', scope: 'main' },
    })
    const ports = {
      ...portsFor(),
      extractWithLlm: async () => ({
        records: [
          {
            ...emptyFacts,
            name: 'Technical Training',
            description: 'Build practical skills.',
            url: programUrl,
            sourceRecordId: 'model-invented-id',
          },
        ],
        model: 'test/model',
        usage: { total_tokens: 25 },
      }),
    }
    const llm = await runSource(tx, { sourceId, mode: 'llm' }, ports)
    assert.equal(llm.status, 'success')
    assert.equal(llm.extractionMode, 'llm')
    const deterministic = await runSource(
      tx,
      { sourceId, mode: 'deterministic' },
      portsFor(),
    )
    assert.equal(deterministic.itemsUnchanged, 1)
    assert.equal(
      (
        await tx
          .select()
          .from(offerings)
          .where(eq(offerings.sourceId, sourceId))
      )[0].sourceRecordId,
      programUrl,
    )
  }))

test('valid empty calendars succeed without disappearing or deleting records', () =>
  isolated(async (tx, ids) => {
    const sourceId = ids[0].id
    const ports = {
      ...portsFor(),
      fetchDocument: async (url: string) => ({
        url,
        body: '{"events":[]}',
        contentType: 'application/json',
        fetchedAt: now().toISOString(),
      }),
    }
    const run = await runSource(tx, { sourceId }, ports)
    assert.equal(run.status, 'success')
    assert.equal(run.itemsFound, 0)
    assert.equal(run.itemsDisappeared, 0)
  }))

test('active-source lease prevents concurrent runs and bootstrap preserves custom rules', () =>
  isolated(async (tx, ids) => {
    const sourceId = ids[2].id
    await programConfig(tx, sourceId)
    await tx.insert(sourceRuns).values({
      id: '019a7e09-0000-7000-8000-000000000001',
      sourceId,
      trigger: 'manual',
      startedAt: new Date(),
      status: 'running',
    })
    // A nested savepoint contains the expected unique-constraint failure.
    await assert.rejects(
      () =>
        tx.transaction((nested) => runSource(nested, { sourceId }, portsFor())),
      /active run/,
    )
    await bootstrapIngestion(tx)
    const [source] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, sourceId))
    assert.equal(sourceConfig.parse(source.config).discovery.type, 'pages')
  }))

test('provider IDs survive event URL changes and event approval preserves canonical identity', () =>
  isolated(async (tx, ids) => {
    const sourceId = ids[0].id
    const apiPorts = (changed: boolean): IngestionPorts => ({
      ...portsFor(),
      fetchDocument: async (url) => ({
        url,
        contentType: 'application/json',
        fetchedAt: now().toISOString(),
        body: JSON.stringify({
          events: [
            {
              id: 123,
              title: changed ? 'Updated founder workshop' : 'Founder workshop',
              url: changed
                ? 'https://20fathoms.org/event/new-url/'
                : 'https://20fathoms.org/event/original/',
              utc_start_date: '2026-11-20 15:00:00',
              utc_end_date: '2026-11-20 16:00:00',
              description: '<p>Learn together.</p>',
              cost: 'Free',
            },
          ],
        }),
      }),
    })
    await runSource(tx, { sourceId }, apiPorts(false))
    const [source] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, sourceId))
    await approve(tx, 'organization', source.organizationId!)
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.sourceId, sourceId))
    await assert.rejects(
      () => getEvent(tx, { slug: event.slug }),
      DirectoryNotFoundError,
    )
    await approve(tx, 'event', event.id)
    await runSource(tx, { sourceId }, apiPorts(true))
    const [pending] = await tx
      .select()
      .from(events)
      .where(
        and(
          eq(events.supersedesId, event.id),
          eq(events.status, 'pending_review'),
        ),
      )
    assert.equal(pending.sourceEventUid, '123')
    assert.equal(pending.slug, event.slug)
    const result = await approve(tx, 'event', pending.id)
    assert.equal(result.id, event.id)
    const [published] = await tx
      .select()
      .from(events)
      .where(eq(events.id, event.id))
    assert.equal(published.name, 'Updated founder workshop')
    assert.equal(published.startsAt?.toISOString(), '2026-11-20T15:00:00.000Z')
    const publicRecord = await getEvent(tx, { slug: event.slug })
    assert.equal(publicRecord.canonicalPath, `/events/${event.slug}`)
    assert.equal(publicRecord.name, 'Updated founder workshop')
    assert.ok(!('sourceId' in publicRecord))
  }))
