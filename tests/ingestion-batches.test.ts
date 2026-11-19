import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  randomBatchKey,
  randomBatchProfiles,
  randomBatchSources,
  ingestionBatchSourceKeys,
  southeastBatchKey,
  southeastBatchProfiles,
  southeastBatchSources,
  remainingBatchKey,
  remainingBatchProfiles,
  remainingBatchSources,
} from '../src/services/ingestion/batches'
import { extractDom } from '../src/services/ingestion/extract'

test('remaining Southeast batch registers all twelve unused workbook rows without duplicating prior identities or TechTown', () => {
  assert.deepEqual(
    remainingBatchProfiles.map((p) => p.workbookRow),
    [34, 42, 60, 72, 73, 77, 79, 86, 89, 90, 93, 96],
  )
  assert.ok(
    remainingBatchProfiles.every((p) =>
      ['Southeast', 'Detroit Metro'].includes(p.region),
    ),
  )
  const previous = [...randomBatchProfiles, ...southeastBatchProfiles]
  const oldIds = new Set([
    ...previous.map((p) => p.id),
    ...randomBatchSources.map((s) => s.id),
    ...southeastBatchSources.map((s) => s.id),
  ])
  const ids = [
    ...remainingBatchProfiles.map((p) => p.id),
    ...remainingBatchProfiles.map((p) => p.locationId),
    ...remainingBatchSources.map((s) => s.id),
  ]
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.every((id) => !oldIds.has(id)))
  assert.ok(
    remainingBatchProfiles.every(
      (p) =>
        !previous.some((old) => old.workbookEntityId === p.workbookEntityId),
    ),
  )
  assert.equal(ingestionBatchSourceKeys(remainingBatchKey).length, 13)
  assert.equal(remainingBatchSources.filter((s) => !s.enabled).length, 4)
  const wayne = remainingBatchProfiles.find((p) => p.workbookRow === 96)!
  assert.equal(wayne.site, 'https://wayne.edu/')
  assert.ok(
    wayne.sources.every((s) => new URL(s.url).hostname.endsWith('.wayne.edu')),
  )
  const calendar = remainingBatchSources.find((s) => s.target === 'events')!
  assert.equal(new URL(calendar.url).searchParams.get('organizer'), '7901')
  assert.equal(calendar.config.limit, 3)
})

test('Purpose community extraction excludes SVG titles and member content', () => {
  const source = remainingBatchSources.find((s) =>
    s.config.key.includes('purposejobs'),
  )!
  const record = extractDom(
    {
      url: source.url,
      contentType: 'text/html',
      fetchedAt: '2026-11-17T17:00:00Z',
      body: '<html><head><title>Purpose Jobs Slack Community</title></head><body><main><svg><title>Follow us on LinkedIn</title></svg><div class="oc__row__text-content"><p>Connect with the startup community.</p></div><article><p>Unrelated member story.</p></article></main></body></html>',
    },
    source.config,
  )
  assert.equal(record.name, 'Purpose Jobs Slack Community')
  assert.equal(record.description, 'Connect with the startup community.')
})

test('Macomb training retains county and veteran priority alongside assessment requirements', () => {
  const source = remainingBatchSources.find((s) =>
    s.config.key.includes('macombstclair'),
  )!
  const record = extractDom(
    {
      url: source.url,
      contentType: 'text/html',
      fetchedAt: '2026-11-17T17:00:00Z',
      body: '<main id="content"><h1>Classroom Training</h1><div class="elementor-element-5ee23a4"><p>Tuition assistance for training.</p></div><div class="elementor-element-5377518"><p>Interview and assessment required.</p></div><div class="elementor-element-41e1d57"><p>WIOA or TAA eligibility confirmation required.</p></div><div class="elementor-element-0a187a4"><p>Priority for Macomb or St. Clair residents and military veterans.</p></div></main>',
    },
    source.config,
  )
  assert.match(record.eligibilitySummary!, /WIOA or TAA/)
  assert.match(record.eligibilitySummary!, /Macomb or St. Clair/)
  assert.match(record.eligibilitySummary!, /military veterans/)
})

test('random batch keeps twenty fixed workbook identities and disabled restricted sources', () => {
  assert.equal(randomBatchProfiles.length, 20)
  assert.equal(
    new Set(randomBatchProfiles.map((p) => p.workbookEntityId)).size,
    20,
  )
  assert.equal(
    new Set(randomBatchSources.map((s) => s.id)).size,
    randomBatchSources.length,
  )
  assert.equal(ingestionBatchSourceKeys(randomBatchKey).length, 21)
  assert.throws(
    () => ingestionBatchSourceKeys('unknown'),
    /Unknown ingestion batch/,
  )
  for (const row of [55, 75, 94, 114, 19, 116, 102]) {
    const profile = randomBatchProfiles.find((p) => p.workbookRow === row)!
    assert.ok(profile.sources.every((s) => !s.enabled))
    assert.ok(profile.sources.every((s) => s.policyNote.length > 50))
  }
  const fund = randomBatchProfiles.find((p) => p.workbookRow === 102)!
  assert.equal(fund.name, 'Michigan Economic Development Corporation')
})

test('Southeast batch keeps distinct regional providers, shared City ownership and prior batch identities', () => {
  assert.equal(southeastBatchProfiles.length, 20)
  assert.ok(
    southeastBatchProfiles.every((p) =>
      ['Southeast', 'Detroit Metro'].includes(p.region),
    ),
  )
  const oldIds = new Set([
    ...randomBatchProfiles.map((p) => p.id),
    ...randomBatchSources.map((s) => s.id),
  ])
  const newIds = [
    ...southeastBatchProfiles.map((p) => p.id),
    ...southeastBatchSources.map((s) => s.id),
  ]
  assert.equal(new Set(newIds).size, newIds.length)
  assert.ok(newIds.every((id) => !oldIds.has(id)))
  assert.equal(ingestionBatchSourceKeys(southeastBatchKey).length, 22)
  const city = southeastBatchProfiles.find((p) => p.name === 'City of Detroit')!
  assert.equal(city.sources.length, 2)
  assert.ok(city.lanes.includes('entrepreneurship'))
  assert.ok(
    city.sources.some(
      (s) => s.config.key === 'se20-detroitstartupfund-offerings',
    ),
  )
  assert.equal(southeastBatchSources.filter((s) => !s.enabled).length, 6)
  const calendar = southeastBatchSources.find((s) => s.target === 'events')!
  assert.equal(new URL(calendar.url).searchParams.get('categories'), '32')
  assert.equal(calendar.config.limit, 3)
})

test('HFC extraction distinguishes duplicated HTML IDs and excludes the adjacent Apple program', () => {
  const source = southeastBatchSources.find((s) =>
    s.config.key.includes('henryfordcollege'),
  )!
  const record = extractDom(
    {
      url: source.url,
      contentType: 'text/html',
      fetchedAt: '2026-11-17T12:00:00Z',
      body: '<main><div id="apple-developer"><h2>Apple Certified Support Professional (ACSP)</h2><p>Support Apple devices.</p><p>This in-person course (24 hours) prepares support professionals.</p><p>Price: $325 per student</p></div><div id="apple-developer"><h2>Apple Foundation Program</h2><p>Unrelated app development program.</p></div></main>',
    },
    source.config,
  )
  assert.equal(record.name, 'Apple Certified Support Professional (ACSP)')
  assert.equal(record.costText, 'Price: $325 per student')
  assert.doesNotMatch(record.description!, /Foundation|Unrelated/)
})

test('DMB selectors import its coaching program without attributing third-party programs to DMB', () => {
  const source = randomBatchSources.find((s) =>
    s.config.key.includes('detroitmeansbusiness'),
  )!
  const record = extractDom(
    {
      url: source.url,
      contentType: 'text/html',
      fetchedAt: '2026-11-17T12:00:00Z',
      body: '<main><h1>Expert Guidance</h1><div id="comp-ku7v6lnu"><h1>313 STRONG</h1></div><div id="comp-ku7v6lnx"><p>One-on-one business coaching in Detroit.</p></div><section><h1>SCORE</h1><p>Unrelated partner content.</p></section></main>',
    },
    source.config,
  )
  assert.equal(record.name, '313 STRONG')
  assert.equal(record.description, 'One-on-one business coaching in Detroit.')
  assert.doesNotMatch(record.description!, /SCORE|Unrelated/)
})

test('Kettering extraction retains enrollment context instead of a department contact as eligibility', () => {
  const source = randomBatchSources.find((s) =>
    s.config.key.includes('ketteringuniversity'),
  )!
  const record = extractDom(
    {
      url: source.url,
      contentType: 'text/html',
      fetchedAt: '2026-11-17T12:00:00Z',
      body: '<main><h1>Innovation and Entrepreneurship Minor</h1><div class="field--name-field-description"><p>Innovation is central to this program.</p><p>Learn to develop business ideas.</p><p>Requires 28 credit hours.</p><p>For non-management degree-seeking students.</p><p>School of Management</p></div></main>',
    },
    source.config,
  )
  assert.equal(
    record.eligibilitySummary,
    'For non-management degree-seeking students.',
  )
  assert.equal(record.durationText, 'Requires 28 credit hours.')
})
