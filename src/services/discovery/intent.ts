import {
  discoveryFilters,
  emptyDiscoveryFilters,
  type DiscoveryFilters,
} from '../../lib/discovery-contracts'

const stopWords = new Set(
  'i me my we our you your am are is be being been a an the to for of in near around with and or but that this some something want need looking look find help can could would like please more just interested options opportunities program programs event events organization organizations michigan start starting get getting learn learning new change changing career careers business build building training skill skills online person hybrid paced remote anywhere only instead show any all either format formats lane lanes type types region regions explore grow'.split(
    ' ',
  ),
)
export function topicWords(text: string) {
  return [...new Set(text.toLowerCase().match(/[a-z][a-z0-9-]*/g) ?? [])]
    .filter((word) => word.length > 2 && !stopWords.has(word))
    .slice(0, 10)
}
const places: [RegExp, DiscoveryFilters['region']][] = [
  [/\b(detroit|metro detroit)\b/i, 'Southeast'],
  [/\b(ann arbor|southeast|ypsilanti)\b/i, 'Southeast'],
  [/\b(grand rapids|west michigan|muskegon|holland)\b/i, 'West Michigan'],
  [/\b(lansing|mid.?michigan)\b/i, 'Mid-Michigan'],
  [/\b(traverse city|northern michigan)\b/i, 'Northern Michigan'],
  [/\b(upper peninsula|marquette|houghton)\b/i, 'Upper Peninsula'],
]

// Readable comparison baseline. It deliberately does not infer eligibility.
export function interpretRequest(
  message: string,
  previous: DiscoveryFilters = emptyDiscoveryFilters,
): DiscoveryFilters {
  const next = { ...discoveryFilters.parse(previous) }
  let topic = message
  for (const [pattern, region] of places) {
    if (pattern.test(message)) {
      next.region = region
      topic = topic.replace(pattern, '')
    }
  }
  if (/\b(anywhere|all regions|across michigan|statewide)\b/i.test(message))
    next.region = null
  if (/\b(online|remote)\b/i.test(message)) next.deliveryMode = 'online'
  if (/\bin[ -]person\b/i.test(message)) next.deliveryMode = 'in_person'
  if (/\bhybrid\b/i.test(message)) next.deliveryMode = 'hybrid'
  if (/\bself[ -]paced\b/i.test(message)) next.deliveryMode = 'self_paced'
  if (/\b(any format|all formats|either format)\b/i.test(message))
    next.deliveryMode = null
  if (/\b(event|events|workshop|workshops)\b/i.test(message))
    next.kind = 'event'
  else if (/\b(program|programs|course|courses|training)\b/i.test(message))
    next.kind = 'program'
  else if (/\b(organization|organizations)\b/i.test(message))
    next.kind = 'organization'
  if (/\b(everything|all types)\b/i.test(message)) next.kind = 'all'
  if (/\b(startup|founder|venture)\b/i.test(message))
    next.lane = 'startup-ecosystem'
  else if (
    /\b(business|entrepreneur|entrepreneurship|self.employed)\b/i.test(message)
  )
    next.lane = 'entrepreneurship'
  else if (
    /\b(learn|learning|training|course|courses|skill|skills)\b/i.test(message)
  )
    next.lane = 'learning-development'
  else if (/\b(career|job|employment)\b/i.test(message))
    next.lane = 'corporate-careers'
  if (/\b(any lane|all lanes)\b/i.test(message)) next.lane = null
  if (
    next.lane !== previous.lane &&
    !/\b(event|events|workshop|workshops|program|programs|course|courses|training|organization|organizations)\b/i.test(
      message,
    )
  )
    next.kind = 'all'
  const words = topicWords(
    topic.replace(
      /\b(any format|all formats|any lane|all lanes|all types|all regions|across michigan|statewide|self[ -]paced|in[ -]person)\b/gi,
      '',
    ),
  )
  if (words.length) next.query = words.join(' ').slice(0, 120)
  // Broad goal phrases are represented by their lane, rather than noise in FTS.
  else if (
    /\b(career|job|business|learning|skills?|training|startup)\b/i.test(message)
  )
    next.query = ''
  return next
}
