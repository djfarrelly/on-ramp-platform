import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  directoryPageInput,
  rpcInputs,
  searchOpportunitiesTool,
} from '../src/lib/contracts'

test('tool inputs reject SQL, unknown fields, invalid lanes and unbounded results', () => {
  const schema = rpcInputs['directory.searchOpportunities']
  for (const value of [
    { sql: 'select * from users' },
    { limit: 100000 },
    { offset: -1 },
    { lane: 'made-up' },
    { query: 'a'.repeat(201) },
  ])
    assert.equal(schema.safeParse(value).success, false)
  assert.equal(schema.parse({ query: ' technical ' }).query, 'technical')
  assert.equal(searchOpportunitiesTool.method, 'directory.searchOpportunities')
  assert.equal(searchOpportunitiesTool.inputSchema.type, 'object')
})
test('malformed browser search parameters fall back to usable defaults', () => {
  const value = directoryPageInput.parse({
    page: '-9',
    lane: 'unknown',
    q: {},
    view: 'unknown',
  })
  assert.deepEqual(value, { q: '', page: 1, view: 'programs', lane: undefined })
})
