import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatLocalDateTime,
  isLocalDateTime,
  localDateTimeToInstant,
} from '../src/lib/datetime'

test('native date values round trip in an explicit timezone, preserving seconds and milliseconds', () => {
  for (const [local, zone, utc] of [
    ['2026-11-20T13:00', 'America/Detroit', '2026-11-20T18:00:00.000Z'],
    ['2026-07-20T13:00', 'America/Detroit', '2026-07-20T17:00:00.000Z'],
    ['2026-11-20T13:05:12.123', 'Asia/Kolkata', '2026-11-20T07:35:12.123Z'],
    ['2026-11-20T00:00', 'UTC', '2026-11-20T00:00:00.000Z'],
  ]) {
    assert.equal(localDateTimeToInstant(local, zone).toISOString(), utc)
    assert.equal(formatLocalDateTime(new Date(utc), zone), local)
  }
  for (const value of [
    '2026-02-30T13:00',
    '2026-11-20T24:00',
    'not a date',
    '2026-11-20T13:00Z',
  ])
    assert.equal(isLocalDateTime(value), false)
})
test('clock changes never silently shift nonexistent or ambiguous wall times', () => {
  assert.throws(
    () => localDateTimeToInstant('2026-03-08T02:30', 'America/Detroit'),
    /does not exist/,
  )
  assert.throws(
    () => localDateTimeToInstant('2026-11-01T01:30', 'America/Detroit'),
    /occurs twice/,
  )
  for (const utc of ['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z']) {
    const original = new Date(utc)
    assert.equal(
      localDateTimeToInstant(
        formatLocalDateTime(original, 'America/Detroit'),
        'America/Detroit',
        original,
      ).getTime(),
      original.getTime(),
    )
  }
})
