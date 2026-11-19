import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runDiscoveryTurn } from '../src/services/discovery/conversation'
import {
  emptyDiscoveryFilters,
  discoveryTurnInput,
  discoveryRegions,
  type DiscoveryFilters,
  type DiscoveryTurnInput,
} from '../src/lib/discovery-contracts'
import type { DiscoverySearchResult } from '../src/services/discovery'
import {
  createDiscoveryInterpreter,
  defaultDiscoveryModel,
} from '../src/server/discovery/gateway'

function result(
  filters: DiscoveryFilters,
  populated = true,
): DiscoverySearchResult {
  return {
    filters,
    dataset: 'published',
    items: populated
      ? [
          {
            id: '019a7e05-0000-7000-8000-000000000001',
            slug: 'test',
            name: 'Known database program',
            summary: 'Verified listing text.',
            organizationName: 'Known organization',
            format: 'online',
            cost: 'Free',
            sourceUrl: 'https://example.org/program',
            startsAt: null,
            kind: 'program',
            canonicalPath: '/programs/test',
            isDemo: false,
            facts: ['Online', 'Free'],
          },
        ]
      : [],
  }
}
test('structured choices bypass interpretation and advance through optional questions without repeating skips', async () => {
  const interpret = async (): Promise<never> => {
    throw new Error('Choices must never call an interpreter')
  }
  let input: DiscoveryTurnInput = {
    selection: { type: 'goal', value: 'entrepreneurship' },
  }
  let reply = await runDiscoveryTurn(input, {
    interpret,
    search: async (filters) => result(filters),
  })
  assert.equal(reply.strategy, 'deterministic')
  assert.equal(reply.filters.lane, 'entrepreneurship')
  assert.equal(reply.followUp?.question, 'Where do you live?')
  for (const region of discoveryRegions)
    assert.ok(
      reply.followUp?.choices.some(
        (c) => c.selection.type === 'region' && c.selection.value === region,
      ),
    )
  assert.ok(
    !reply.followUp?.choices.some(
      (c) => c.selection.type === 'region' && c.selection.value === null,
    ),
  )
  for (const selection of [
    { type: 'region', value: null },
    { type: 'format', value: null },
    { type: 'kind', value: 'all' },
  ] as const) {
    input = { filters: reply.filters, completed: reply.completed, selection }
    reply = await runDiscoveryTurn(input, {
      interpret,
      search: async (filters) => result(filters),
    })
    assert.equal(reply.execution.modelCalls, 0)
    assert.equal(reply.execution.searchCalls, 1)
  }
  assert.equal(reply.followUp, null)
  assert.deepEqual(
    new Set(reply.completed),
    new Set(['goal', 'region', 'format', 'kind']),
  )
})
test('freeform text uses one model call with structured context and returns only search records', async () => {
  let calls = 0
  const filters: DiscoveryFilters = {
    ...emptyDiscoveryFilters,
    lane: 'entrepreneurship',
    region: 'Southeast',
  }
  const response = await runDiscoveryTurn(
    { message: 'Online mentoring, please', filters },
    {
      interpret: async (text, previous) => {
        calls++
        assert.equal(text, 'Online mentoring, please')
        assert.deepEqual(previous, filters)
        return { ...previous, query: 'mentoring', deliveryMode: 'online' }
      },
      search: async (applied) => result(applied),
    },
  )
  assert.equal(calls, 1)
  assert.equal(response.execution.modelCalls, 1)
  assert.equal(response.strategy, 'ai')
  assert.equal(response.followUp?.step, 'kind')
  assert.equal(response.items[0].name, 'Known database program')
})
test('an empty topic gets at most one broader search, keeping hard preferences and labeling alternatives', async () => {
  const seen: DiscoveryFilters[] = []
  const filters: DiscoveryFilters = {
    query: 'robotics',
    lane: 'learning-development',
    region: 'West Michigan',
    deliveryMode: 'online',
    kind: 'program',
  }
  const response = await runDiscoveryTurn(
    { message: 'Show options', filters, approach: 'deterministic' },
    {
      search: async (applied) => {
        seen.push(applied)
        return result(applied, !applied.query)
      },
    },
  )
  assert.equal(seen.length, 2)
  assert.deepEqual(seen[1], { ...filters, query: '' })
  assert.equal(response.match, 'broader')
  assert.equal(response.filters.query, 'robotics')
  assert.equal(response.effectiveFilters.query, '')
  assert.match(response.message, /couldn’t find an exact match/)
  assert.equal(response.execution.searchCalls, 2)
  assert.ok(response.execution.steps.includes('broaden-topic'))
})
test('no results asks for permission to broaden hard filters instead of silently relaxing them', async () => {
  const response = await runDiscoveryTurn(
    {
      selection: { type: 'region', value: 'Upper Peninsula' },
      filters: {
        ...emptyDiscoveryFilters,
        query: 'robotics',
        lane: 'learning-development',
        deliveryMode: 'in_person',
      },
    },
    {
      search: async (filters) => result(filters, false),
    },
  )
  assert.equal(response.execution.searchCalls, 2)
  assert.equal(response.filters.region, 'Upper Peninsula')
  assert.equal(response.filters.deliveryMode, 'in_person')
  assert.equal(response.match, 'none')
  assert.equal(response.followUp?.step, 'recover')
  assert.ok(
    response.followUp?.choices.some(
      (c) =>
        c.selection.type === 'region' && c.selection.value === 'West Michigan',
    ),
  )
})
test('model failures and invalid plans use the baseline; database failures remain failures', async () => {
  const response = await runDiscoveryTurn(
    { message: 'I want technical training near Grand Rapids' },
    {
      interpret: async () => {
        throw new Error('private provider payload')
      },
      search: async (filters) => result(filters),
    },
  )
  assert.equal(response.strategy, 'fallback')
  assert.equal(response.filters.region, 'West Michigan')
  assert.equal(response.filters.query, 'technical')
  assert.ok(!JSON.stringify(response).includes('private provider'))
  await assert.rejects(
    () =>
      runDiscoveryTurn(
        { selection: { type: 'goal', value: 'entrepreneurship' } },
        {
          search: async () => {
            throw new Error('Database unavailable')
          },
        },
      ),
    /Database unavailable/,
  )
})
test('changing direction resets topic/type while keeping previously chosen location and format', async () => {
  const response = await runDiscoveryTurn(
    {
      selection: { type: 'goal', value: 'entrepreneurship' },
      filters: {
        query: 'coding',
        lane: 'learning-development',
        region: 'Southeast',
        deliveryMode: 'online',
        kind: 'event',
      },
      completed: ['goal', 'region', 'format', 'kind'],
    },
    { search: async (filters) => result(filters) },
  )
  assert.deepEqual(response.filters, {
    query: '',
    lane: 'entrepreneurship',
    region: 'Southeast',
    deliveryMode: 'online',
    kind: 'all',
  })
  assert.equal(response.followUp?.step, 'kind')
})
test('turn contract rejects arbitrary actions, duplicate state and ambiguous text-plus-choice requests', () => {
  for (const input of [
    {},
    { selection: { type: 'runSource', value: 'all' } },
    { selection: { type: 'region', value: 'invented' } },
    { message: 'Hi', selection: { type: 'goal', value: null } },
    { message: 'Hi', completed: ['region', 'region'] },
  ])
    assert.equal(discoveryTurnInput.safeParse(input).success, false)
})
test('the low-cost Gateway default still requires configured credentials and spend caps', async () => {
  const interpret = createDiscoveryInterpreter(
    {
      accountId: 'a'.repeat(32),
      gatewayId: 'test',
      token: 'test',
      spendLimitConfigured: 'true',
    },
    async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      assert.equal(body.model, defaultDiscoveryModel)
      assert.equal(body.max_tokens, 500)
      return Response.json({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  type: 'function',
                  function: {
                    name: 'discovery_search',
                    arguments: JSON.stringify(emptyDiscoveryFilters),
                  },
                },
              ],
            },
          },
        ],
      })
    },
  )!
  assert.deepEqual(
    await interpret('Hi', emptyDiscoveryFilters),
    emptyDiscoveryFilters,
  )
  assert.equal(
    createDiscoveryInterpreter({
      accountId: 'a'.repeat(32),
      gatewayId: 'test',
      token: 'test',
    }),
    undefined,
  )
})
