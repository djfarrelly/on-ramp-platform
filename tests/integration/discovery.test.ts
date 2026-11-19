import { test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { createDatabase } from '../../src/db/client'
import { emptyDiscoveryFilters } from '../../src/lib/discovery-contracts'
import {
  getDiscoverySetup,
  respondToDiscovery,
  searchDiscovery,
} from '../../src/services/discovery'
import { handleDiscoveryRpc } from '../../src/server/discovery-rpc'

const url = process.env.TEST_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Use pnpm test:db with an isolated _test database')
const client = new pg.Client({ connectionString: url })
const db = createDatabase(client)
const id = (n: number) =>
  `019a7e02-0000-7000-8000-${String(n).padStart(12, '0')}`
before(() => client.connect())
after(() => client.end())
beforeEach(async () => {
  await client.query('begin')
  for (const [n, status] of [
    [1, 'published'],
    [2, 'pending_review'],
  ] as const) {
    await client.query(
      `insert into organizations (id, slug, display_name, short_description, website_url, status, created_at, updated_at) values ($1,$2,'Quartz Skills Center','Quartz learning opportunities','javascript:alert(1)',$3,now(),now())`,
      [id(n), `quartz-center-${n}`, status],
    )
  }
  for (const [n, parent, status] of [
    [10, 1, 'published'],
    [11, 1, 'pending_review'],
    [12, 2, 'published'],
  ] as const) {
    await client.query(
      `insert into offerings (id, organization_id, kind, slug, name, summary, delivery_mode, cost_text, url, status, created_at, updated_at) values ($1,$2,'program',$3,'Quartz technical skills','Practical quartz training.','online','Contact for cost','https://example.org/quartz',$4,now(),now())`,
      [id(n), id(parent), `quartz-program-${n}`, status],
    )
  }
  for (const [n, parent, status, interval] of [
    [20, 1, 'published', '1 day'],
    [21, 1, 'published', '-1 day'],
    [22, 1, 'pending_review', '2 days'],
    [23, 2, 'published', '2 days'],
  ] as const) {
    await client.query(
      `insert into events (id, organization_id, slug, name, description, format, starts_at, url, status, created_at, updated_at) values ($1,$2,$3,'Quartz open workshop','Explore quartz skills.','virtual',now() + $4::interval,'https://example.org/quartz-event',$5,now(),now())`,
      [id(n), id(parent), `quartz-event-${n}`, interval, status],
    )
  }
})
afterEach(() => client.query('rollback'))
const input = { ...emptyDiscoveryFilters, query: 'quartz' }

test('one search combines public programs, upcoming events and organizations without leaking proposals', async () => {
  const result = await searchDiscovery(db, input)
  assert.equal(result.items.length, 3)
  assert.deepEqual(
    new Set(result.items.map((i) => i.id)),
    new Set([id(1), id(10), id(20)]),
  )
  assert.ok(result.items.every((i) => !i.isDemo))
  assert.equal(result.items.find((i) => i.id === id(1))?.sourceUrl, null)
  assert.equal(
    result.items.find((i) => i.id === id(10))?.canonicalPath,
    '/programs/quartz-program-10',
  )
  for (const key of ['crmId', 'reviewedBy', 'searchVector', 'score'])
    assert.equal(key in result.items[0], false)
})
test('demo data is explicit, bounded and kept out of published discovery', async () => {
  const real = await searchDiscovery(db, { ...emptyDiscoveryFilters })
  assert.ok(real.items.every((i) => !i.isDemo))
  const demo = await searchDiscovery(db, {
    ...emptyDiscoveryFilters,
    dataset: 'demo',
    limit: 2,
  })
  assert.equal(demo.items.length, 2)
  assert.ok(demo.items.every((i) => i.isDemo))
  await assert.rejects(() => searchDiscovery(db, { ...input, limit: 7 }))
  assert.equal((await getDiscoverySetup(db)).initialDataset, 'published')
})

test('Southeast discovery combines imported Detroit and Southeast labels across all listing types', async () => {
  await client.query(
    `insert into locations (id, organization_id, city, region, created_at, updated_at) values ($1,$2,'Local city','Southeast',now(),now())`,
    [id(30), id(1)],
  )
  await client.query(
    `update offerings set delivery_mode='in_person' where organization_id=$1`,
    [id(1)],
  )
  await client.query(
    `update events set format='in_person', city='Local city' where organization_id=$1`,
    [id(1)],
  )
  for (const region of ['Southeast', 'Detroit Metro', 'Southeast Michigan']) {
    await client.query('update locations set region=$1 where id=$2', [
      region,
      id(30),
    ])
    const results = await searchDiscovery(db, { ...input, region: 'Southeast' })
    assert.deepEqual(
      new Set(results.items.map((r) => r.id)),
      new Set([id(1), id(10), id(20)]),
    )
    assert.equal(
      (await searchDiscovery(db, { ...input, region: 'West Michigan' })).items
        .length,
      0,
    )
  }
})
test('online events map virtual format correctly; programs and events respect explicit formats and types', async () => {
  const online = await searchDiscovery(db, {
    ...input,
    deliveryMode: 'online',
    region: 'Upper Peninsula',
  })
  assert.deepEqual(
    new Set(online.items.map((i) => i.kind)),
    new Set(['program', 'event']),
  )
  assert.ok(online.items.every((i) => i.facts.includes('Online')))
  assert.equal(
    (await searchDiscovery(db, { ...input, deliveryMode: 'in_person' })).items
      .length,
    0,
  )
  assert.equal(
    (await searchDiscovery(db, { ...input, deliveryMode: 'self_paced' })).items
      .length,
    0,
  )
  assert.equal(
    (await searchDiscovery(db, { ...input, kind: 'event' })).items.length,
    1,
  )
  await searchDiscovery(db, {
    ...input,
    query: "'; DROP TABLE organizations; --",
  })
})
test('model failure and invalid arguments fall back to the readable baseline without persisting intake', async () => {
  const before = await client.query(
    'select count(*)::int as count from intake_sessions',
  )
  const initial = await respondToDiscovery(db, {
    message: 'I want technical training near Grand Rapids',
    dataset: 'demo',
  })
  const refined = await respondToDiscovery(
    db,
    { message: 'Online', dataset: 'demo', filters: initial.filters },
    async () => {
      throw new Error('private provider output')
    },
  )
  assert.equal(refined.strategy, 'fallback')
  assert.equal(refined.filters.query, 'technical')
  assert.equal(refined.filters.region, 'West Michigan')
  assert.ok(refined.items.length > 0)
  assert.ok(
    refined.items.every(
      (i) => i.format === 'online' || i.format === 'self_paced',
    ),
  )
  assert.ok(!JSON.stringify(refined).includes('private provider'))
  const ai = await respondToDiscovery(
    db,
    { message: 'Quartz' },
    async () => input,
  )
  assert.equal(ai.strategy, 'ai')
  assert.equal(ai.items.length, 3)
  assert.deepEqual(
    (await client.query('select count(*)::int as count from intake_sessions'))
      .rows,
    before.rows,
  )
})
test('discovery RPC uses the same search, sets no-store and bypasses the model for baseline requests', async () => {
  const response = await handleDiscoveryRpc(
    new Request('http://localhost/api/v1/discovery.respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Quartz', approach: 'deterministic' }),
    }),
    'discovery.respond',
    async (run) => run(db),
    async () => {
      throw new Error('Model must not run')
    },
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const body = (await response.json()) as {
    result: { items: unknown[]; strategy: string }
  }
  assert.equal(body.result.items.length, 3)
  assert.equal(body.result.strategy, 'deterministic')
})

test('structured conversation choices bypass model setup and carry exact preferences into the same search', async () => {
  const response = await handleDiscoveryRpc(
    new Request('http://localhost/api/v1/discovery.respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selection: { type: 'goal', value: 'entrepreneurship' },
        dataset: 'demo',
      }),
    }),
    'discovery.respond',
    async (run) => run(db),
    async () => {
      throw new Error('Button choices must never load a model')
    },
  )
  assert.equal(response.status, 200)
  const body = (await response.json()) as {
    result: {
      filters: { lane: string }
      completed: string[]
      followUp: { question: string }
      execution: { modelCalls: number }
      items: unknown[]
    }
  }
  assert.equal(body.result.filters.lane, 'entrepreneurship')
  assert.equal(body.result.execution.modelCalls, 0)
  assert.equal(body.result.items.length, 3)
  assert.equal(body.result.followUp.question, 'Where do you live?')
})
test('broader suggestions retain publication and format boundaries', async () => {
  const response = await respondToDiscovery(db, {
    message: 'Show options',
    approach: 'deterministic',
    filters: {
      ...input,
      query: 'unmatchedtopic',
      deliveryMode: 'online',
      kind: 'program',
    },
  })
  assert.equal(response.match, 'broader')
  assert.equal(response.execution.searchCalls, 2)
  assert.deepEqual(
    response.items.map((i) => i.id),
    [id(10)],
  )
  assert.equal(response.filters.query, 'unmatchedtopic')
  assert.equal(response.effectiveFilters.query, '')
})
