import { load } from 'cheerio'
import {
  candidateSchema,
  emptyFacts,
  type Candidate,
  type Document,
  type SourceConfig,
} from './contracts'

export function allowedUrl(
  value: string,
  base: string,
  hosts: string[],
): string {
  const u = new URL(value, base)
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.port ||
    !hosts.includes(u.hostname) ||
    u.hostname === 'localhost' ||
    !u.hostname.includes('.') ||
    /^(\d+\.){3}\d+$/.test(u.hostname) ||
    u.hostname.endsWith('.local')
  )
    throw new Error('Source URL is outside its allowed public HTTPS hosts')
  u.hash = ''
  return u.href
}
export function plainText(html: string) {
  const $ = load(html)
  $('script, style, noscript, iframe, form, nav, header, footer').remove()
  $('br').replaceWith('\n')
  $('p, li, h1, h2, h3, h4, tr').each((_, el) => {
    $(el).append('\n')
  })
  return $.root()
    .text()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
}
export function discoverLinks(
  document: Document,
  config: SourceConfig,
): string[] {
  if (config.discovery.type === 'pages')
    return config.discovery.urls.map((url) =>
      allowedUrl(url, document.url, config.allowedHosts),
    )
  if (config.discovery.type !== 'links') return []
  const discovery = config.discovery
  const $ = load(document.body)
  const urls = new Set<string>()
  $(discovery.selector).each((_, element) => {
    const href = $(element).attr('href')
    if (!href) return
    const url = allowedUrl(href, document.url, config.allowedHosts)
    const path = new URL(url).pathname
    if (path.startsWith(discovery.includePath) && url !== document.url)
      urls.add(url)
  })
  if (!urls.size)
    throw new Error(
      'Discovery selectors matched no detail links; review sources.config',
    )
  return [...urls]
}
export function extractDom(
  document: Document,
  config: SourceConfig,
): Candidate {
  if (!config.dom) throw new Error('DOM rules are missing')
  const $ = load(document.body)
  const scope = $(config.dom.scope)
  if (scope.length !== 1)
    throw new Error(
      `DOM scope must match exactly one element (matched ${scope.length})`,
    )
  const facts: Record<string, string | null> = {}
  for (const [field, rule] of Object.entries(config.dom.fields)) {
    const elements = scope.find(rule.selector)
    const value = rule.attribute
      ? elements.first().attr(rule.attribute)
      : plainText(
          elements
            .toArray()
            .map((el) => $.html(el))
            .join('\n'),
        )
    if (rule.required && !value?.trim())
      throw new Error(
        `Required DOM field '${field}' is missing; review sources.config`,
      )
    facts[field] = value?.trim() || null
  }
  for (const field of ['applyUrl'] as const)
    if (facts[field])
      facts[field] = allowedUrl(
        facts[field]!,
        document.url,
        config.allowedHosts,
      )
  const url = allowedUrl(document.url, document.url, config.allowedHosts)
  return candidateSchema.parse({
    ...emptyFacts,
    ...facts,
    sourceRecordId: url,
    url,
  })
}
export function extractTribe(
  document: Document,
  config: SourceConfig,
): Candidate[] {
  const data = JSON.parse(document.body) as { events?: unknown[] }
  if (!Array.isArray(data.events))
    throw new Error('Calendar JSON has no events array')
  return data.events.map((value) => {
    const row = value as Record<string, unknown>
    const venue = row.venue as Record<string, unknown> | undefined
    const utc = (key: string) =>
      typeof row[key] === 'string'
        ? new Date(row[key].replace(' ', 'T') + 'Z').toISOString()
        : null
    const url = allowedUrl(
      String(row.url ?? ''),
      document.url,
      config.allowedHosts,
    )
    if (row.id === undefined || !row.title || !row.utc_start_date)
      throw new Error('Calendar record lacks stable ID, title or UTC date')
    const description = plainText(String(row.description ?? '')) || null
    return candidateSchema.parse({
      ...emptyFacts,
      sourceRecordId: String(row.id),
      url,
      name: plainText(String(row.title)),
      description,
      summary: description?.slice(0, 600) ?? null,
      costText: String(row.cost || '').trim() || null,
      startsAt: utc('utc_start_date'),
      endsAt: utc('utc_end_date'),
      venueText:
        typeof venue?.venue === 'string' ? plainText(venue.venue) : null,
      city: typeof venue?.city === 'string' ? venue.city : null,
    })
  })
}
export function validateCandidates(
  records: Candidate[],
  docs: Document[],
  config: SourceConfig,
  target: 'events' | 'offerings',
  now: Date,
): Candidate[] {
  const evidenceUrls = new Set<string>()
  const evidenceLinks = new Set<string>()
  const evidenceIds = new Map<string, string>()
  for (const doc of docs) {
    evidenceUrls.add(doc.url)
    if (doc.contentType.includes('html')) {
      const $ = load(doc.body)
      $('a[href]').each((_, element) => {
        try {
          evidenceLinks.add(
            allowedUrl($(element).attr('href')!, doc.url, config.allowedHosts),
          )
        } catch {
          /* Out-of-scope links are not eligible extraction evidence. */
        }
      })
    }
    if (doc.contentType.includes('json')) {
      const json = JSON.parse(doc.body) as {
        events?: { id?: string | number; url?: string; website?: string }[]
      }
      for (const row of json.events ?? [])
        if (row.url) {
          const url = allowedUrl(row.url, doc.url, config.allowedHosts)
          evidenceUrls.add(url)
          if (row.id !== undefined) evidenceIds.set(url, String(row.id))
          if (row.website) {
            try {
              evidenceLinks.add(
                allowedUrl(row.website, doc.url, config.allowedHosts),
              )
            } catch {
              /* Explicit host configuration is required for external registration sites. */
            }
          }
        }
    }
  }
  const unique = new Map<string, Candidate>()
  for (const raw of records) {
    const record = candidateSchema.parse(raw)
    if (target === 'offerings' && !record.summary && record.description) {
      record.summary = record.description.split(/\n\s*\n/)[0].slice(0, 600)
    }
    record.url = allowedUrl(record.url, docs[0].url, config.allowedHosts)
    if (!evidenceUrls.has(record.url))
      throw new Error('Extracted record URL is not in the fetched evidence')
    // Use observed provider IDs when available, otherwise the canonical URL.
    // Never trust a model-generated identifier. Provider IDs survive URL changes.
    record.sourceRecordId = evidenceIds.get(record.url) ?? record.url
    if (record.applyUrl)
      record.applyUrl = allowedUrl(
        record.applyUrl,
        record.url,
        config.allowedHosts,
      )
    if (
      record.applyUrl &&
      !evidenceLinks.has(record.applyUrl) &&
      !evidenceUrls.has(record.applyUrl)
    )
      throw new Error(
        'Extracted application URL is not in the fetched evidence',
      )
    if (target === 'events' && !record.startsAt)
      throw new Error('Events require an explicit date with time-zone offset')
    if (
      target === 'events' &&
      new Date(record.endsAt ?? record.startsAt!) < now
    )
      continue
    if (unique.has(record.sourceRecordId))
      throw new Error('Extractor returned duplicate identities')
    unique.set(record.sourceRecordId, record)
  }
  return [...unique.values()]
}
