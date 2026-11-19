import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleReviewRpc, localReviewAllowed } from '../src/server/review-rpc'
import {
  ReviewAccessError,
  ReviewConflictError,
} from '../src/services/ingestion/review'
import { rpcInputs } from '../src/lib/contracts'
import { reviewEditInput } from '../src/lib/review-contracts'

const request = (
  body: unknown = {},
  headers: Record<string, string> = {},
  host = 'http://localhost:5173',
) =>
  new Request(`${host}/api/v1/review.listProposals`, {
    method: 'POST',
    headers: { Origin: host, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
const neverOpen = async (): Promise<never> => {
  throw new Error('database password secret')
}

test('unauthenticated review is restricted to development on loopback hosts', async () => {
  for (const host of [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://[::1]:5173',
  ]) {
    assert.equal(localReviewAllowed(request({}, {}, host), true), true)
    assert.equal(localReviewAllowed(request({}, {}, host), false), false)
    assert.equal(
      (
        await handleReviewRpc(
          request({}, {}, host),
          'review.listProposals',
          false,
          neverOpen,
        )
      ).status,
      404,
    )
  }
  for (const host of [
    'https://onramp.example',
    'http://192.168.1.12:5173',
    'http://localhost.evil.example:5173',
  ]) {
    assert.equal(
      (
        await handleReviewRpc(
          request({}, {}, host),
          'review.listProposals',
          true,
          neverOpen,
        )
      ).status,
      404,
    )
  }
  assert.equal(Object.hasOwn(rpcInputs, 'review.decideProposal'), false)
})
test('review rejects cross-origin writes, missing origins and non-JSON bodies before database access', async () => {
  const rejectedHeaders: Record<string, string>[] = [
    { Origin: 'https://evil.example' },
    { Origin: '' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ]
  for (const headers of rejectedHeaders) {
    assert.equal(
      (
        await handleReviewRpc(
          request({}, headers),
          'review.listProposals',
          true,
          neverOpen,
        )
      ).status,
      403,
    )
  }
  assert.equal(
    (
      await handleReviewRpc(
        request({}, { 'Content-Type': 'text/plain' }),
        'review.listProposals',
        true,
        neverOpen,
      )
    ).status,
    415,
  )
})
test('review methods reject unknown capabilities and inputs, including reviewer spoofing', async () => {
  assert.equal(
    (await handleReviewRpc(request(), 'review.runSource', true, neverOpen))
      .status,
    404,
  )
  assert.equal(
    (
      await handleReviewRpc(
        request({ sql: 'select *' }),
        'review.listProposals',
        true,
        neverOpen,
      )
    ).status,
    400,
  )
  assert.equal(
    (
      await handleReviewRpc(
        request({
          type: 'organization',
          id: '019a7e04-0000-7000-8000-000000000001',
          decision: 'approve',
          expectedUpdatedAt: new Date().toISOString(),
          reviewerId: 'someone-else',
        }),
        'review.decideProposal',
        true,
        neverOpen,
      )
    ).status,
    400,
  )
  assert.equal(
    (
      await handleReviewRpc(
        request({ text: 'a'.repeat(17000) }),
        'review.listProposals',
        true,
        neverOpen,
      )
    ).status,
    413,
  )
})
test('review exposes safe domain conflicts and hides database details', async () => {
  const failure = await handleReviewRpc(
    request(),
    'review.listProposals',
    true,
    neverOpen,
  )
  assert.equal(failure.status, 503)
  assert.ok(!(await failure.text()).includes('secret'))
  const conflict = await handleReviewRpc(
    request(),
    'review.listProposals',
    true,
    async () => {
      throw new ReviewConflictError(
        'Proposal changed; inspect it again before reviewing',
      )
    },
  )
  assert.equal(conflict.status, 409)
  assert.match(await conflict.text(), /Proposal changed/)
  const staff = await handleReviewRpc(
    request(),
    'review.listProposals',
    true,
    async () => {
      throw new ReviewAccessError()
    },
  )
  assert.equal(staff.status, 503)
  assert.match(await staff.text(), /pnpm ingest setup/)
})

test('editing has a strict field allowlist, validated facts and the same local-only gates', async () => {
  const input = {
    type: 'offering',
    id: '019a7e04-0000-7000-8000-000000000001',
    expectedUpdatedAt: new Date().toISOString(),
    changes: { description: '  Corrected description  ' },
  }
  assert.equal(
    reviewEditInput.parse(input).changes.description,
    'Corrected description',
  )
  const cleared = reviewEditInput.parse({
    ...input,
    changes: { costText: ' ' },
  })
  assert.equal(cleared.type, 'offering')
  if (cleared.type === 'offering') assert.equal(cleared.changes.costText, null)
  for (const changes of [
    {},
    { status: 'published' },
    { slug: 'new' },
    { sourceId: input.id },
    { name: ' ' },
    { applyUrl: 'javascript:alert(1)' },
    { applyUrl: 'https://user:password@example.org' },
    { deliveryMode: 'invented' },
  ]) {
    assert.equal(
      (
        await handleReviewRpc(
          request({ ...input, changes }),
          'review.editProposal',
          true,
          neverOpen,
        )
      ).status,
      400,
    )
  }
  for (const changes of [
    { timezone: 'invalid' },
    { startsAt: '2026-11-20T13:00:00' },
  ])
    assert.equal(
      reviewEditInput.safeParse({ ...input, type: 'event', changes }).success,
      false,
    )
  assert.equal(
    (
      await handleReviewRpc(
        request(input),
        'review.editProposal',
        false,
        neverOpen,
      )
    ).status,
    404,
  )
  assert.equal(
    (
      await handleReviewRpc(
        request(input, { Origin: 'https://elsewhere.example' }),
        'review.editProposal',
        true,
        neverOpen,
      )
    ).status,
    403,
  )
  assert.equal(Object.hasOwn(rpcInputs, 'review.editProposal'), false)
})
