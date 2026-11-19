import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  taggingDefinitions,
  taggingRecord,
  taggingOutput,
  taggingRunInput,
} from '../src/lib/tagging-contracts'
import {
  deterministicTags,
  validateTagEvidence,
  combineTags,
} from '../src/services/tagging/classify'
import { selectTaggingSample } from '../src/services/tagging'
import { createTaggingModel } from '../src/server/tagging/model'
import { handleTaggingRpc } from '../src/server/tagging-rpc'
import { ingestionTaggingModel } from '../src/server/tagging/ingestion-model'

const record = taggingRecord.parse({
  type: 'offering',
  id: '019a8001-0000-7000-8000-000000000001',
  organizationId: '019a8001-0000-7000-8000-000000000002',
  organizationName: 'Test provider',
  listingStatus: 'pending_review',
  url: 'https://example.org/program',
  updatedAt: '2026-11-19T12:00:00Z',
  fields: {
    name: 'AI Prompt Engineering',
    description:
      'This workshop teaches artificial intelligence and generative AI.',
    summary: '',
    eligibility: '',
    cost: '',
    duration: '',
    schedule: '',
    prerequisites: '',
  },
  existingTagIds: [],
})
test('ingestion uses rules without Gateway configuration and never enables direct OpenAI', () => {
  assert.equal(
    ingestionTaggingModel({
      OPENAI_API_KEY: 'test-key',
      TAGGING_ALLOW_DIRECT_OPENAI: 'true',
    }).model,
    null,
  )
  assert.equal(
    ingestionTaggingModel({ INGEST_TAGGING_MODE: 'deterministic' }).model,
    null,
  )
  assert.throws(() => ingestionTaggingModel({ INGEST_TAGGING_MODE: 'invalid' }))
  assert.throws(
    () =>
      ingestionTaggingModel({
        INGEST_TAGGING_MODE: 'hybrid',
        OPENAI_API_KEY: 'test-key',
      }).ready?.(),
    /Configure/,
  )
})
test('AI and data are independent topics and negative phrasing does not create rule assignments', () => {
  assert.equal(taggingDefinitions.length, 45)
  assert.ok(!taggingDefinitions.some((d) => d.slug === 'topic-ai-data'))
  const ai = deterministicTags(record)
  assert.ok(ai.some((a) => a.slug === 'topic-ai'))
  assert.ok(!ai.some((a) => a.slug === 'topic-data'))
  const data = deterministicTags({
    ...record,
    fields: {
      ...record.fields,
      name: 'Data analytics',
      description: 'This course covers data analysis.',
    },
  })
  assert.ok(data.some((a) => a.slug === 'topic-data'))
  assert.ok(!data.some((a) => a.slug === 'topic-ai'))
  assert.ok(
    !deterministicTags({
      ...record,
      fields: {
        ...record.fields,
        name: 'Introduction',
        description: 'This is not artificial intelligence training.',
      },
    }).some((a) => a.slug === 'topic-ai'),
  )
})
test('tagging validates the vocabulary, duplicate tags, quote grounding and bounded inputs', () => {
  assert.throws(() =>
    taggingOutput.parse({
      assignments: [
        {
          slug: 'new-invented-tag',
          field: 'description',
          quote: 'This workshop',
        },
      ],
    }),
  )
  assert.throws(
    () =>
      validateTagEvidence(record, {
        assignments: [
          {
            slug: 'topic-ai',
            field: 'description',
            quote: 'AI for every industry',
          },
        ],
      }),
    /UNGROUNDED/,
  )
  const a = {
    slug: 'topic-ai',
    field: 'description',
    quote: 'artificial intelligence',
  }
  assert.throws(
    () => validateTagEvidence(record, { assignments: [a, a] }),
    /DUPLICATE/,
  )
  assert.equal(validateTagEvidence(record, { assignments: [a] }).length, 1)
  assert.throws(() => taggingRunInput.parse({ limit: 61 }))
  assert.throws(() => taggingRunInput.parse({ sql: 'select * from users' }))
})
test('hybrid disagreements are exposed and empty model output is an explicit abstention', () => {
  const result = combineTags(record, [])
  assert.equal(result.assignments.length, 0)
  assert.ok(result.issues.some((s) => s.includes('topic-ai')))
  const tagged = combineTags(record, [
    { slug: 'topic-ai', field: 'name', quote: 'AI Prompt Engineering' },
  ])
  assert.equal(tagged.assignments[0].basis, 'rule')
})
test('sampling is stable, bounded and provider-diverse and explicit unavailable IDs are rejected', () => {
  const records = Array.from({ length: 70 }, (_, i) => ({
    ...record,
    id: `019a8001-0000-7000-8000-${(100 + i).toString(16).padStart(12, '0')}`,
    organizationId: `019a8001-0000-7000-8000-${(200 + (i % 10)).toString(16).padStart(12, '0')}`,
  }))
  const first = selectTaggingSample(records, { limit: 55 })
  assert.equal(first.length, 55)
  assert.deepEqual(
    selectTaggingSample([...records].reverse(), { limit: 55 }).map((r) => r.id),
    first.map((r) => r.id),
  )
  assert.equal(
    new Set(first.slice(0, 10).map((r) => r.organizationId)).size,
    10,
  )
  assert.throws(
    () => selectTaggingSample(records, { recordIds: [record.id] }),
    /not eligible/,
  )
})
test('AI SDK adapter routes the OpenAI key through Cloudflare, disables payload logs and returns validated evidence', async () => {
  let sent: Record<string, unknown> | undefined
  const model = createTaggingModel(
    {
      openaiApiKey: 'test-openai-key',
      accountId: 'a'.repeat(32),
      gatewayId: 'onramp-test',
      gatewayToken: 'test-cloudflare-token',
      spendLimitConfigured: 'true',
    },
    async (url, options) => {
      assert.match(String(url), /^https:\/\/gateway.ai.cloudflare.com\//)
      const headers = new Headers(options?.headers)
      assert.equal(headers.get('authorization'), 'Bearer test-openai-key')
      assert.equal(
        headers.get('cf-aig-authorization'),
        'Bearer test-cloudflare-token',
      )
      assert.equal(headers.get('cf-aig-collect-log-payload'), 'false')
      sent = JSON.parse(String(options?.body))
      return Response.json({
        id: 'test',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4.1-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                assignments: [
                  {
                    slug: 'topic-ai',
                    evidenceId: 'p1',
                  },
                  { slug: 'topic-ai', evidenceId: 'p2' },
                ],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      })
    },
  )
  const result = await model.classify!(record)
  assert.equal(result.assignments[0].slug, 'topic-ai')
  assert.equal(result.assignments.length, 1)
  assert.equal(result.usage.inputTokens, 100)
  assert.equal(sent?.store, false)
  assert.ok(sent?.response_format)
  assert.throws(
    () => createTaggingModel({ openaiApiKey: 'test' }).ready!(),
    /Configure CLOUDFLARE/,
  )
})
test('tagging RPC gates local development, same-origin JSON and capability inputs before database access', async () => {
  let calls = 0
  const db = async <T>(_run: unknown): Promise<T> => {
    calls++
    throw new Error('must not run')
  }
  const request = (host = '127.0.0.1', origin = `http://${host}`) =>
    new Request(`http://${host}/api/v1/tagging.listProposals`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: '{}',
    })
  assert.equal(
    (await handleTaggingRpc(request(), 'tagging.listProposals', false, db))
      .status,
    404,
  )
  assert.equal(
    (
      await handleTaggingRpc(
        request('example.com'),
        'tagging.listProposals',
        true,
        db,
      )
    ).status,
    404,
  )
  assert.equal(
    (
      await handleTaggingRpc(
        request('127.0.0.1', 'https://evil.example'),
        'tagging.listProposals',
        true,
        db,
      )
    ).status,
    403,
  )
  assert.equal(
    (await handleTaggingRpc(request(), 'tagging.querySql', true, db)).status,
    404,
  )
  assert.equal(calls, 0)
})

test('Cloudflare provider switching uses the compatible SDK adapter without an OpenAI key', async () => {
  const model = createTaggingModel(
    {
      provider: 'cloudflare',
      accountId: 'a'.repeat(32),
      gatewayId: 'onramp-test',
      gatewayToken: 'test-cf-token',
      spendLimitConfigured: 'true',
    },
    async (url, options) => {
      assert.match(String(url), /^https:\/\/api.cloudflare.com\//)
      const headers = new Headers(options?.headers)
      assert.equal(headers.get('cf-aig-gateway-id'), 'onramp-test')
      assert.equal(headers.get('authorization'), 'Bearer test-cf-token')
      const body = JSON.parse(String(options?.body))
      assert.match(body.model, /^@cf\//)
      return Response.json({
        id: 'fixture',
        model: body.model,
        object: 'chat.completion',
        created: 1,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '{"assignments":[]}' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
      })
    },
  )
  model.ready!()
  assert.deepEqual((await model.classify!(record)).assignments, [])
})
