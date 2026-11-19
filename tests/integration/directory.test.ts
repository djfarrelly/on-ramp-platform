import { test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { createDatabase } from '../../src/db/client'
import { fixtureId } from '../fixtures/directory'
import {
  searchOpportunities,
  searchOrganizations,
  getOrganization,
  getOpportunity,
  listLanes,
  DirectoryNotFoundError,
} from '../../src/services/directory'
import { handleDirectoryRpc } from '../../src/server/directory-rpc'

const url = process.env.TEST_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Run pnpm test:db against an isolated _test database.')
// Pin the connection: a pool's query helper discards a connection on SQL errors.
const client = new pg.Client({ connectionString: url })
const db = createDatabase(client)
before(() => client.connect())
after(() => client.end())
beforeEach(() => client.query('begin'))
afterEach(() => client.query('rollback'))

test('baseline contains four lanes, ten organizations and twenty programs', async () => {
  assert.equal((await listLanes(db)).length, 4)
  assert.equal((await searchOrganizations(db)).total, 10)
  assert.equal((await searchOpportunities(db)).total, 20)
  const first = await searchOpportunities(db, { limit: 3 })
  const next = await searchOpportunities(db, { limit: 3, offset: 3 })
  assert.equal(first.total, next.total)
  assert.equal(
    new Set([...first.items, ...next.items].map((i) => i.id)).size,
    6,
  )
})

test('search supports full text, misspellings, aliases, tags and parameterized inputs', async () => {
  assert.ok(
    (await searchOpportunities(db, { query: 'technical' })).items.some(
      (p) => p.slug === 'demo-evening-technical-foundations',
    ),
  )
  assert.ok(
    (await searchOrganizations(db, { query: 'Lakeshor Skills' })).items.some(
      (o) => o.slug === 'demo-lakeshore-skills-lab',
    ),
  )
  assert.ok(
    (await searchOrganizations(db, { query: 'LSL' })).items.some(
      (o) => o.slug === 'demo-lakeshore-skills-lab',
    ),
  )
  assert.ok(
    (await searchOpportunities(db, { query: 'Capital readiness' })).items.some(
      (p) => p.slug === 'demo-understand-your-funding-options',
    ),
  )
  await searchOrganizations(db, { query: "'; DROP TABLE organizations; --" })
  assert.equal((await searchOrganizations(db)).total, 10)
})

test('combined filters include online options and exclude unrelated local programs', async () => {
  const results = await searchOpportunities(db, {
    query: 'technical',
    region: 'Detroit Metro',
    lane: 'learning-development',
  })
  assert.ok(results.items.some((p) => p.slug === 'demo-try-a-technical-career'))
  assert.ok(
    !results.items.some((p) => p.slug === 'demo-evening-technical-foundations'),
  )
  const inPerson = await searchOpportunities(db, {
    query: 'technical',
    region: 'Detroit Metro',
    deliveryMode: 'in_person',
  })
  assert.equal(inPerson.total, 0)
  const orgs = await searchOrganizations(db, { lane: 'startup-ecosystem' })
  assert.ok(
    orgs.items.every((o) =>
      o.lanes.some((l) => l.slug === 'startup-ecosystem'),
    ),
  )
  assert.ok(
    orgs.items.every((o) => o.lanes.filter((l) => l.isPrimary).length === 1),
  )
})

test('archived organizations and their programs are absent from list and detail', async () => {
  await client.query('update organizations set status = $1 where id = $2', [
    'archived',
    fixtureId(1000),
  ])
  assert.equal((await searchOrganizations(db)).total, 9)
  assert.equal((await searchOpportunities(db)).total, 18)
  await assert.rejects(
    () => getOrganization(db, { slug: 'demo-motor-city-career-exchange' }),
    DirectoryNotFoundError,
  )
  await assert.rejects(
    () => getOpportunity(db, { slug: 'demo-career-reset-your-next-direction' }),
    DirectoryNotFoundError,
  )
})

test('pending replacements share a slug without replacing public content', async () => {
  await client.query(
    `insert into organizations (id, slug, display_name, status, supersedes_id, created_at, updated_at) values ($1, $2, 'Hidden proposal', 'pending_review', $3, now(), now())`,
    [fixtureId(9000), 'demo-motor-city-career-exchange', fixtureId(1000)],
  )
  const org = await getOrganization(db, {
    slug: 'demo-motor-city-career-exchange',
  })
  assert.equal(org.name, 'Motor City Career Exchange')
  assert.equal((await searchOrganizations(db)).total, 10)
  assert.ok(!JSON.stringify(org).includes('Hidden proposal'))
})

test('publishing invariants reject slug changes, duplicate primary lanes and missing alt text', async () => {
  await client.query('savepoint slug_test')
  await assert.rejects(
    () =>
      client.query('update organizations set slug = $1 where id = $2', [
        'changed',
        fixtureId(1000),
      ]),
    /canonical slug/,
  )
  await client.query('rollback to savepoint slug_test')
  await client.query('savepoint lane_test')
  await assert.rejects(
    () =>
      client.query(
        'update organization_lanes set is_primary = true where organization_id = $1',
        [fixtureId(1000)],
      ),
    /unique/,
  )
  await client.query('rollback to savepoint lane_test')
  await client.query(
    'insert into media_assets (id, created_at) values ($1, now())',
    [fixtureId(9001)],
  )
  await client.query('savepoint alt_test')
  await assert.rejects(
    () =>
      client.query(
        'update organizations set logo_media_id = $1 where id = $2',
        [fixtureId(9001), fixtureId(1000)],
      ),
    /alt text/,
  )
  await client.query('rollback to savepoint alt_test')
})

test('RPC returns canonical links and never exposes private columns', async () => {
  const request = new Request(
    'http://localhost/api/v1/directory.getOrganization',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'demo-lakeshore-skills-lab' }),
    },
  )
  const response = await handleDirectoryRpc(
    request,
    'directory.getOrganization',
    async (run) => run(db),
  )
  assert.equal(response.status, 200)
  const body = (await response.json()) as { result: Record<string, unknown> }
  assert.equal(
    body.result.canonicalPath,
    '/organizations/demo-lakeshore-skills-lab',
  )
  for (const key of ['crmId', 'reviewedBy', 'sourceRunId', 'searchVector'])
    assert.equal(key in body.result, false)
})

test('RPC validates input before opening the database and returns safe errors', async () => {
  const request = (body: string, contentType = 'application/json') =>
    new Request('http://localhost/api/v1/test', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    })
  const neverOpen = async (): Promise<never> => {
    throw new Error('database password secret')
  }
  for (const [method, body, status] of [
    ['unknown', '{}', 404],
    ['directory.searchOpportunities', '{', 400],
    ['directory.searchOpportunities', '{"sql":"select *"}', 400],
    [
      'directory.searchOpportunities',
      JSON.stringify({ query: 'a'.repeat(17000) }),
      413,
    ],
  ] as const)
    assert.equal(
      (await handleDirectoryRpc(request(body), method, neverOpen)).status,
      status,
    )
  assert.equal(
    (
      await handleDirectoryRpc(
        request('{}', 'text/plain'),
        'lanes.list',
        neverOpen,
      )
    ).status,
    415,
  )
  const failure = await handleDirectoryRpc(
    request('{}'),
    'lanes.list',
    neverOpen,
  )
  assert.equal(failure.status, 503)
  assert.ok(!(await failure.text()).includes('secret'))
  const missing = await handleDirectoryRpc(
    request('{"slug":"not-a-program"}'),
    'directory.getOpportunity',
    async (run) => run(db),
  )
  assert.equal(missing.status, 404)
})
