import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sourceConfig,
  emptyFacts,
  type Document,
} from '../src/services/ingestion/contracts'
import {
  extractDom,
  discoverLinks,
  extractTribe,
  validateCandidates,
  allowedUrl,
} from '../src/services/ingestion/extract'
import { initialSources } from '../src/services/ingestion/bootstrap'
import { camwEventPage, ingestionPages } from './fixtures/ingestion-pages'
import { createPublicFetcher } from '../src/server/ingestion/fetch'
import { createGatewayExtractor } from '../src/server/ingestion/llm'
import { handleIngestionRpc } from '../src/server/ingestion-rpc'

const document = (
  body: string,
  url = 'https://www.grcc.edu/program/example',
): Document => ({
  body,
  url,
  fetchedAt: '2026-11-12T12:00:00Z',
  contentType: 'text/html',
})
test('second-pass source selectors isolate program facts from navigation, news and related programs', () => {
  const expectedNames = [
    'Business Bootcamp',
    'Product Prototyping',
    'Business Growth Services',
    'Retail Boot Camp',
  ]
  for (const [index, [key, html]] of Object.entries(ingestionPages).entries()) {
    const source = initialSources.find((s) => s.config.key === key)!
    assert.equal(source.config.discovery.type, 'pages')
    const doc = document(html, source.url)
    const [record] = validateCandidates(
      [extractDom(doc, source.config)],
      [doc],
      source.config,
      'offerings',
      new Date(),
    )
    assert.equal(record.name, expectedNames[index])
    assert.doesNotMatch(record.description!, /Unrelated/)
    assert.equal(record.sourceRecordId, source.url)
    assert.equal(record.startsAt, null)
    assert.equal(record.applyUrl, null)
    // An HTML redesign must fail visibly, rather than creating an empty proposal.
    assert.throws(
      () =>
        extractDom(
          document('<body><h1>Changed layout</h1></body>', source.url),
          source.config,
        ),
      /Required DOM field/,
    )
    if (key === 'wcc-programs') {
      assert.match(record.costText!, /others pay a one-time \$25/)
      assert.match(record.eligibilitySummary!, /18 years or older/)
      assert.match(record.durationText!, /five months/)
      assert.match(record.scheduleText!, /hybrid format/)
    }
    if (key === 'michigan-sbdc-programs') {
      assert.equal(record.costText, 'Receive No-Cost Assistance')
      assert.match(record.eligibilitySummary!, /at least 2/)
    }
  }
  const techTown = initialSources.find(
    (s) => s.config.key === 'techtown-programs',
  )!
  assert.equal(techTown.isEnabled, false)
  assert.match(techTown.setupNote!, /permission before enabling/)
})
test('CAMW HTML discovery and dates use observed links and explicit offsets', () => {
  const source = initialSources.find(
    (s) => s.config.key === 'capital-area-mi-works-events',
  )!
  const root = document(
    '<main><a href="/events/career-planning">Workshop</a><a href="/events/career-planning">Duplicate</a><a href="/about-us">About</a></main>',
    source.url,
  )
  const urls = discoverLinks(root, source.config)
  assert.deepEqual(urls, ['https://www.camw.org/events/career-planning'])
  const doc = document(camwEventPage, urls[0])
  const record = extractDom(doc, source.config)
  assert.equal(record.name, 'Career Planning Workshop')
  assert.equal(
    record.description,
    'Develop a practical job search and career plan.',
  )
  assert.equal(record.startsAt, '2026-11-20T13:00:00-05:00')
  assert.equal(record.endsAt, null)
  assert.equal(record.venueText, 'Lansing American Job Center')
  assert.equal(record.format, null)
  assert.equal(
    validateCandidates(
      [record],
      [doc],
      source.config,
      'events',
      new Date('2026-11-13'),
    ).length,
    1,
  )
  assert.equal(
    validateCandidates(
      [record],
      [doc],
      source.config,
      'events',
      new Date('2026-11-21'),
    ).length,
    0,
  )
  assert.throws(() =>
    extractDom(
      document(
        camwEventPage.replace('2026-11-20T13:00:00-05:00', 'Friday afternoon'),
        urls[0],
      ),
      source.config,
    ),
  )
})
test('DOM selectors are database-serializable, strict and fail on missing required data', () => {
  const config = sourceConfig.parse({
    ...initialSources[2].config,
    dom: {
      scope: 'main',
      fields: {
        name: { selector: 'h1', required: true },
        description: { selector: '.content p', required: true },
      },
    },
  })
  const record = extractDom(
    document(
      '<nav>Ignore this</nav><main><h1>Technical Training</h1><div class="content"><p>Build practical skills.</p><script>stealSecrets()</script></div></main>',
    ),
    JSON.parse(JSON.stringify(config)),
  )
  assert.equal(record.name, 'Technical Training')
  assert.equal(record.description, 'Build practical skills.')
  assert.equal(record.costText, null)
  assert.throws(
    () => extractDom(document('<main><h1>Heading only</h1></main>'), config),
    /Required DOM field/,
  )
  assert.throws(
    () => extractDom(document('<main></main><main></main>'), config),
    /exactly one/,
  )
  assert.equal(
    sourceConfig.safeParse({ ...config, arbitraryCode: 'eval()' }).success,
    false,
  )
})
test('discovery uses the configured selector and deduplicates bounded program links', () => {
  const config = initialSources[2].config
  const urls = discoverLinks(
    document(
      '<main><a href="/schools-departments/school-workforce-training/job-training-programs/computer-support-technician">Program</a><a href="/schools-departments/school-workforce-training/job-training-programs/computer-support-technician">Again</a><a href="/news">Unrelated</a></main>',
    ),
    config,
  )
  assert.equal(urls.length, 1)
  assert.throws(
    () => discoverLinks(document('<main>No links</main>'), config),
    /no detail links/,
  )
})
test('calendar extraction preserves UTC dates, decoding and stable observed identities', () => {
  const doc = {
    ...document(
      JSON.stringify({
        events: [
          {
            id: 1,
            title: 'Build &amp; Learn',
            description: '<p>A workshop</p>',
            url: 'https://20fathoms.org/event/build/',
            utc_start_date: '2026-11-20 15:00:00',
            utc_end_date: '2026-11-20 17:00:00',
            cost: 'Free',
            venue: { venue: 'Community room', city: 'Traverse City' },
          },
        ],
      }),
      'https://20fathoms.org/wp-json/tribe/events/v1/events',
    ),
    contentType: 'application/json',
  }
  const rows = extractTribe(doc, initialSources[0].config)
  assert.equal(rows[0].name, 'Build & Learn')
  assert.equal(rows[0].startsAt, '2026-11-20T15:00:00.000Z')
  const validated = validateCandidates(
    rows,
    [doc],
    initialSources[0].config,
    'events',
    new Date('2026-11-12T12:00:00Z'),
  )
  assert.equal(validated[0].sourceRecordId, '1')
  assert.equal(
    validateCandidates(
      rows,
      [doc],
      initialSources[0].config,
      'events',
      new Date('2027-01-01T00:00:00Z'),
    ).length,
    0,
  )
})
test('extraction rejects invented URLs and public-source URLs cannot target private hosts', () => {
  const doc = document('<main>Known source</main>')
  const record = {
    ...emptyFacts,
    name: 'A program',
    url: 'https://www.grcc.edu/program/invented',
    sourceRecordId: 'invented',
  }
  assert.throws(
    () =>
      validateCandidates(
        [record],
        [doc],
        initialSources[2].config,
        'offerings',
        new Date(),
      ),
    /fetched evidence/,
  )
  assert.throws(
    () =>
      validateCandidates(
        [
          {
            ...record,
            url: doc.url,
            applyUrl: 'https://www.grcc.edu/invented-apply',
          },
        ],
        [doc],
        initialSources[2].config,
        'offerings',
        new Date(),
      ),
    /application URL/,
  )
  for (const url of [
    'http://www.grcc.edu/private',
    'https://127.0.0.1/',
    'https://localhost/',
    'https://www.grcc.edu:444/',
    'https://user:password@www.grcc.edu/',
  ])
    assert.throws(() =>
      allowedUrl(url, doc.url, ['www.grcc.edu', '127.0.0.1', 'localhost']),
    )
})
test('fetcher respects robots.txt and prevents off-host redirects', async () => {
  let requests = 0
  const blocked = createPublicFetcher(async () => {
    requests++
    return new Response('User-agent: *\nDisallow: /private')
  })
  await assert.rejects(
    () => blocked('https://example.org/private', ['example.org']),
    /robots.txt/,
  )
  assert.equal(requests, 1)
  const redirect = createPublicFetcher(async (url) =>
    String(url).endsWith('/robots.txt')
      ? new Response('User-agent: *\nAllow: /')
      : new Response('', {
          status: 302,
          headers: { location: 'http://127.0.0.1/' },
        }),
  )
  await assert.rejects(
    () => redirect('https://example.org/public', ['example.org']),
    /allowed public HTTPS/,
  )
})
test('LLM extraction routes only through AI Gateway, disables payload logs and validates output', async () => {
  const config = sourceConfig.parse({
    ...initialSources[2].config,
    llm: { model: 'test/model', promptVersion: 'extract-v1', scope: 'main' },
  })
  const doc = document(
    '<h1>Technical Training</h1><main><p>Observed facts.</p></main>',
  )
  const record = {
    ...emptyFacts,
    name: 'Technical Training',
    url: doc.url,
    sourceRecordId: doc.url,
  }
  const settings = {
    accountId: 'a'.repeat(32),
    gatewayId: 'ingestion',
    token: 'test-secret',
    spendLimitConfigured: 'true',
  }
  let calls = 0
  const extract = createGatewayExtractor(settings, async (url, init) => {
    calls++
    assert.equal(new URL(String(url)).hostname, 'api.cloudflare.com')
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('cf-aig-collect-log-payload'), 'false')
    const body = JSON.parse(String(init?.body))
    assert.equal(body.response_format.type, 'json_schema')
    assert.ok(!String(init?.body).includes('test-secret'))
    return Response.json({
      choices: [
        { message: { content: JSON.stringify({ records: [record] }) } },
      ],
      usage: { total_tokens: 100 },
    })
  })
  assert.equal((await extract([doc], config, 'offerings')).records.length, 1)
  assert.equal(calls, 1)
  await assert.rejects(
    () =>
      createGatewayExtractor({ ...settings, spendLimitConfigured: 'false' })(
        [doc],
        config,
        'offerings',
      ),
    /spend limit/,
  )
  await assert.rejects(
    () =>
      createGatewayExtractor(
        settings,
        async () => new Response('', { status: 429 }),
      )([doc], config, 'offerings'),
    /429/,
  )
  await assert.rejects(() =>
    createGatewayExtractor(settings, async () =>
      Response.json({
        choices: [
          { message: { content: '{"records":[{"name":"invented"}]}' } },
        ],
      }),
    )([doc], config, 'offerings'),
  )
})
test('administrative ingestion RPC is disabled or unauthorized before opening a database', async () => {
  const request = (token?: string) =>
    new Request('https://example.org/api/v1/ingestion.listSources', {
      method: 'POST',
      headers: token
        ? {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          }
        : {},
      body: '{}',
    })
  const noDatabase = async (): Promise<never> => {
    throw new Error('Database must not be opened')
  }
  assert.equal(
    (
      await handleIngestionRpc(
        request(),
        'ingestion.listSources',
        {},
        noDatabase,
      )
    ).status,
    503,
  )
  const env = {
    INGEST_ADMIN_TOKEN: 'a'.repeat(40),
    INGEST_REVIEWER_ID: '019a7e01-0000-7000-8000-000000000001',
  }
  assert.equal(
    (
      await handleIngestionRpc(
        request('wrong'),
        'ingestion.listSources',
        env,
        noDatabase,
      )
    ).status,
    401,
  )
  assert.equal(
    (
      await handleIngestionRpc(
        request('é'.repeat(40)),
        'ingestion.listSources',
        env,
        noDatabase,
      )
    ).status,
    401,
  )
})
