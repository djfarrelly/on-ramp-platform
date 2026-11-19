import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { eq, inArray } from 'drizzle-orm'
import { createDatabase, type Database } from '../../src/db/client'
import { seedCore } from '../../src/db/seed'
import {
  organizations,
  offerings,
  events,
  sources,
  lanes,
  tags,
  organizationTags,
} from '../../src/db/schema'
import { bootstrapIngestion } from '../../src/services/ingestion/bootstrap'
import { getDiscoverySetup } from '../../src/services/discovery'
import {
  fixtureId,
  removeDemoDirectory,
  seedDemoDirectory,
} from '../fixtures/directory'

const url = process.env.TEST_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Use pnpm test:db with an isolated _test database')
const pool = new pg.Pool({ connectionString: url, max: 2 })
const db = createDatabase(pool)
after(() => pool.end())
class RollbackTest extends Error {}
async function isolated(run: (tx: Database) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await run(tx)
      throw new RollbackTest()
    })
  } catch (error) {
    if (!(error instanceof RollbackTest)) throw error
  }
}

test('demo cleanup preserves real imports, shared taxonomy and all four core lanes', () =>
  isolated(async (tx) => {
    const imported = await bootstrapIngestion(tx)
    const importedTagIds = (await tx.select().from(tags))
      .map((t) => t.id)
      .filter(
        (id) =>
          !Array.from({ length: 9 }, (_, i) => fixtureId(100 + i)).includes(id),
      )
    const sourceRows = await tx.select().from(sources)
    const organizationIds = sourceRows
      .map((s) => s.organizationId!)
      .filter(Boolean)
    const importedOrganizations = await tx
      .select()
      .from(organizations)
      .where(inArray(organizations.id, organizationIds))
    const coreLanes = await tx.select().from(lanes)
    const now = new Date()
    const realId = '019a7e03-0000-7000-8000-000000000001'
    await tx.insert(offerings).values({
      id: realId,
      organizationId: organizationIds[0],
      sourceId: imported.sources[0].id,
      kind: 'program',
      slug: 'real-import',
      name: 'Real imported program',
      status: 'pending_review',
      createdAt: now,
      updatedAt: now,
    })
    await tx.insert(events).values({
      id: realId,
      organizationId: organizationIds[0],
      slug: 'real-event',
      name: 'Real event',
      status: 'pending_review',
      createdAt: now,
      updatedAt: now,
    })
    const realProgram = await tx
      .select()
      .from(offerings)
      .where(eq(offerings.id, realId))
    const realEvent = await tx
      .select()
      .from(events)
      .where(eq(events.id, realId))
    // A generic tag now used by real content is shared taxonomy, not disposable.
    await tx
      .insert(organizationTags)
      .values({ organizationId: organizationIds[0], tagId: fixtureId(100) })
    const removed = await removeDemoDirectory(tx)
    assert.equal(removed.organizations, 10)
    assert.equal(removed.programs, 20)
    assert.equal(removed.locations, 10)
    assert.equal(removed.aliases, 10)
    assert.deepEqual(
      await tx
        .select()
        .from(organizations)
        .where(inArray(organizations.id, organizationIds)),
      importedOrganizations,
    )
    assert.deepEqual(await tx.select().from(sources), sourceRows)
    assert.deepEqual(await tx.select().from(lanes), coreLanes)
    assert.deepEqual(
      await tx.select().from(offerings).where(eq(offerings.id, realId)),
      realProgram,
    )
    assert.deepEqual(
      await tx.select().from(events).where(eq(events.id, realId)),
      realEvent,
    )
    assert.deepEqual(
      (await tx.select().from(tags)).map((t) => t.id).sort(),
      [...importedTagIds, fixtureId(100)].sort(),
    )
    const setup = await getDiscoverySetup(tx)
    assert.equal(setup.initialDataset, 'published')
    assert.equal(setup.hasDemoOrganizations, false)
    assert.deepEqual(await removeDemoDirectory(tx), {
      organizations: 0,
      programs: 0,
      locations: 0,
      aliases: 0,
      unusedTags: 0,
    })
  }))

test('normal seeding never repopulates demos; explicit test fixtures remain repeatable', () =>
  isolated(async (tx) => {
    await removeDemoDirectory(tx)
    await tx
      .update(lanes)
      .set({ tagline: 'Operator-edited copy' })
      .where(eq(lanes.id, fixtureId(1)))
    await seedCore(tx)
    await seedCore(tx)
    assert.equal((await tx.select().from(organizations)).length, 0)
    assert.equal((await tx.select().from(offerings)).length, 0)
    assert.equal((await tx.select().from(lanes)).length, 4)
    assert.equal(
      (
        await tx
          .select()
          .from(lanes)
          .where(eq(lanes.id, fixtureId(1)))
      )[0].tagline,
      'Operator-edited copy',
    )
    assert.equal((await getDiscoverySetup(tx)).initialDataset, 'published')
    await seedDemoDirectory(tx)
    await seedDemoDirectory(tx)
    assert.equal((await tx.select().from(organizations)).length, 10)
    assert.equal((await tx.select().from(offerings)).length, 20)
    assert.equal((await getDiscoverySetup(tx)).hasDemoOrganizations, true)
    assert.equal((await getDiscoverySetup(tx)).initialDataset, 'demo')
  }))

test('unexpected non-fixture dependencies block deletion and roll back every change', () =>
  isolated(async (tx) => {
    await tx.insert(offerings).values({
      id: '019a7e03-0000-7000-8000-000000000002',
      organizationId: fixtureId(1000),
      kind: 'program',
      slug: 'external-child',
      name: 'Not a registered fixture',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await assert.rejects(() => removeDemoDirectory(tx))
    assert.equal((await tx.select().from(organizations)).length, 10)
    assert.equal((await tx.select().from(offerings)).length, 21)
    assert.equal(
      (
        await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, fixtureId(1000)))
      )[0].primaryLocationId,
      fixtureId(2000),
    )
    assert.ok(
      (
        await tx
          .select()
          .from(offerings)
          .where(eq(offerings.id, fixtureId(4000)))
      ).length,
    )
  }))
