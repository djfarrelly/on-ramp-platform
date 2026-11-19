// Native datetime-local values have no offset. Interpret them in an explicit
// IANA timezone, never the browser's or server's default timezone.
function wallClock(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === name)!.value
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}.${String(date.getUTCMilliseconds()).padStart(3, '0')}`
}
export function formatLocalDateTime(date: Date, timeZone: string) {
  return wallClock(date, timeZone)
    .replace(/\.000$/, '')
    .replace(/:00$/, '')
}
export function isLocalDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value))
    return false
  const date = new Date(`${value}Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value)
}
export function localDateTimeToInstant(
  value: string,
  timeZone: string,
  current?: Date | null,
) {
  if (!isLocalDateTime(value))
    throw new RangeError('Choose a valid date and time.')
  const naive = new Date(`${value}Z`)
  const wanted = naive.toISOString().slice(0, -1)
  // Preserve an unchanged instant, including the second occurrence of a repeated
  // DST hour. New ambiguous times require explicit correction rather than guessing.
  if (current && wallClock(current, timeZone) === wanted) return current
  const offsets = new Set<number>()
  for (const hours of [-48, -24, 0, 24, 48]) {
    const probe = new Date(naive.getTime() + hours * 3600000)
    offsets.add(Date.parse(`${wallClock(probe, timeZone)}Z`) - probe.getTime())
  }
  const matches = [...offsets]
    .map((offset) => new Date(naive.getTime() - offset))
    .filter((candidate) => wallClock(candidate, timeZone) === wanted)
  if (!matches.length)
    throw new RangeError(
      'This time does not exist in the listing’s timezone because the clocks change. Choose another time.',
    )
  if (matches.length > 1)
    throw new RangeError(
      'This time occurs twice in the listing’s timezone because the clocks change. Choose a time outside the repeated hour.',
    )
  return matches[0]
}
