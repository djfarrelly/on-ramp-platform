import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { events, offerings, organizations } from '../../db/schema'
import {
  discoverySearchInput,
  type DiscoverySearchInput,
  type DiscoveryTurnInput,
} from '../../lib/discovery-contracts'
import { listLanes } from '../directory'
import { topicWords } from './intent'
import { runDiscoveryTurn, type IntentInterpreter } from './conversation'
export type { IntentInterpreter, DiscoveryResponse } from './conversation'

const demoPrefix = '019a7e00-0000-7000-8000-%'
const formatLabels: Record<string, string> = {
  in_person: 'In person',
  online: 'Online',
  virtual: 'Online',
  hybrid: 'Hybrid',
  self_paced: 'Self-paced',
}
const safeUrl = (value: string | null) => {
  try {
    const url = new URL(value ?? '')
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

export async function searchDiscovery(
  db: Database,
  input: DiscoverySearchInput,
) {
  const p = discoverySearchInput.parse(input)
  const words = topicWords(p.query)
  const tsquery = words.join(' OR ')
  const parent = and(
    eq(organizations.status, 'published'),
    isNull(organizations.supersedesId),
    p.dataset === 'demo'
      ? sql`${organizations.id}::text like ${demoPrefix}`
      : sql`${organizations.id}::text not like ${demoPrefix}`,
  )!
  // Preserve imported source labels while presenting one Southeast region.
  const regionValues =
    p.region === 'Southeast'
      ? ['Southeast', 'Detroit Metro', 'Southeast Michigan']
      : p.region === 'Mid-Michigan'
        ? ['Mid-Michigan', 'South Central']
        : [p.region ?? '']
  const locationRegion = inArray(sql`loc.region`, regionValues)
  const regionLocation = sql`exists (select 1 from locations loc where loc.organization_id = ${organizations.id} and (${locationRegion} or loc.region = 'Statewide' or loc.is_statewide or loc.is_virtual))`
  const orgLane = sql`exists (select 1 from organization_lanes ol join lanes l on l.id = ol.lane_id where ol.organization_id = ${organizations.id} and l.slug = ${p.lane} and l.is_active)`
  const orgVector = sql`to_tsvector('english', concat_ws(' ', ${organizations.displayName}, ${organizations.shortDescription}, ${organizations.longDescription}))`
  const programVector = sql`to_tsvector('english', concat_ws(' ', ${offerings.name}, ${offerings.summary}, ${offerings.description}, ${organizations.displayName}))`
  const eventVector = sql`to_tsvector('english', concat_ws(' ', ${events.name}, ${events.description}, ${organizations.displayName}))`
  const rank = (vector: SQL) =>
    words.length
      ? sql<number>`ts_rank_cd(${vector}, websearch_to_tsquery('english', ${tsquery}))`
      : sql<number>`0::real`
  const textMatch = (vector: SQL) =>
    words.length
      ? sql`${vector} @@ websearch_to_tsquery('english', ${tsquery})`
      : undefined
  const [programs, upcoming, providers] = await Promise.all([
    p.kind === 'all' || p.kind === 'program'
      ? db
          .select({
            id: offerings.id,
            slug: offerings.slug,
            name: offerings.name,
            summary: offerings.summary,
            organizationName: organizations.displayName,
            format: offerings.deliveryMode,
            cost: offerings.costText,
            sourceUrl: offerings.url,
            score: rank(programVector),
          })
          .from(offerings)
          .innerJoin(
            organizations,
            eq(organizations.id, offerings.organizationId),
          )
          .where(
            and(
              parent,
              eq(offerings.status, 'published'),
              isNull(offerings.supersedesId),
              textMatch(programVector),
              p.lane
                ? sql`exists (select 1 from offering_lanes ol join lanes l on l.id = ol.lane_id where ol.offering_id = ${offerings.id} and l.slug = ${p.lane} and l.is_active)`
                : undefined,
              p.deliveryMode === 'online'
                ? sql`${offerings.deliveryMode} in ('online', 'self_paced')`
                : p.deliveryMode
                  ? eq(offerings.deliveryMode, p.deliveryMode)
                  : undefined,
              p.region
                ? sql`(${offerings.deliveryMode} in ('online', 'self_paced')
          or exists (select 1 from offering_locations ol join locations loc on loc.id = ol.location_id where ol.offering_id = ${offerings.id} and (${locationRegion} or loc.region = 'Statewide' or loc.is_statewide or loc.is_virtual))
          or (not exists (select 1 from offering_locations ol where ol.offering_id = ${offerings.id}) and ${regionLocation}))`
                : undefined,
            ),
          )
          .orderBy(
            desc(rank(programVector)),
            asc(offerings.name),
            asc(offerings.id),
          )
          .limit(p.limit)
      : [],
    (p.kind === 'all' || p.kind === 'event') && p.deliveryMode !== 'self_paced'
      ? db
          .select({
            id: events.id,
            slug: events.slug,
            name: events.name,
            summary: events.description,
            organizationName: organizations.displayName,
            format: events.format,
            cost: events.costText,
            sourceUrl: events.url,
            startsAt: events.startsAt,
            score: rank(eventVector),
          })
          .from(events)
          .innerJoin(organizations, eq(organizations.id, events.organizationId))
          .where(
            and(
              parent,
              eq(events.status, 'published'),
              isNull(events.supersedesId),
              sql`${events.startsAt} >= now()`,
              textMatch(eventVector),
              p.lane ? orgLane : undefined,
              p.deliveryMode
                ? eq(
                    events.format,
                    p.deliveryMode === 'online' ? 'virtual' : p.deliveryMode,
                  )
                : undefined,
              p.region
                ? sql`(${events.format} = 'virtual' or (${events.city} is null and ${regionLocation})
          or exists (select 1 from locations loc where loc.organization_id = ${organizations.id} and lower(loc.city) = lower(${events.city}) and ${locationRegion}))`
                : undefined,
            ),
          )
          .orderBy(
            desc(rank(eventVector)),
            asc(events.startsAt),
            asc(events.id),
          )
          .limit(p.limit)
      : [],
    (p.kind === 'all' || p.kind === 'organization') && !p.deliveryMode
      ? db
          .select({
            id: organizations.id,
            slug: organizations.slug,
            name: organizations.displayName,
            summary: organizations.shortDescription,
            organizationName: organizations.displayName,
            sourceUrl: organizations.websiteUrl,
            score: rank(orgVector),
          })
          .from(organizations)
          .where(
            and(
              parent,
              textMatch(orgVector),
              p.lane ? orgLane : undefined,
              p.region ? regionLocation : undefined,
            ),
          )
          .orderBy(
            desc(rank(orgVector)),
            asc(organizations.displayName),
            asc(organizations.id),
          )
          .limit(p.limit)
      : [],
  ])
  const items = [
    ...programs.map((r) => ({
      ...r,
      kind: 'program' as const,
      startsAt: null,
      canonicalPath: `/programs/${r.slug}`,
    })),
    ...upcoming.map((r) => ({
      ...r,
      kind: 'event' as const,
      startsAt: r.startsAt!.toISOString(),
      canonicalPath: `/events/${r.slug}`,
    })),
    ...providers.map((r) => ({
      ...r,
      kind: 'organization' as const,
      format: null,
      cost: null,
      startsAt: null,
      canonicalPath: `/organizations/${r.slug}`,
    })),
  ]
    .sort(
      (a, b) =>
        Number(b.score) - Number(a.score) ||
        (a.kind === 'organization' ? 1 : 0) -
          (b.kind === 'organization' ? 1 : 0) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, p.limit)
    .map(({ score: _score, ...r }) => ({
      ...r,
      summary: r.summary?.slice(0, 500) ?? null,
      sourceUrl: safeUrl(r.sourceUrl),
      isDemo: p.dataset === 'demo',
      facts: [
        r.format ? formatLabels[r.format] : null,
        r.cost,
        r.startsAt
          ? `Starts ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Detroit' }).format(new Date(r.startsAt))}`
          : null,
      ].filter((v): v is string => Boolean(v)),
    }))
  const { dataset: _dataset, limit: _limit, ...filters } = p
  return { items, filters, dataset: p.dataset }
}
export type DiscoverySearchResult = Awaited<ReturnType<typeof searchDiscovery>>
export async function respondToDiscovery(
  db: Database,
  input: DiscoveryTurnInput,
  interpret?: IntentInterpreter,
) {
  return runDiscoveryTurn(input, {
    interpret,
    search: (filters) =>
      searchDiscovery(db, { ...filters, dataset: input.dataset, limit: 3 }),
  })
}

export async function getDiscoverySetup(db: Database) {
  const [rows, lanes] = await Promise.all([
    db
      .select({
        realCount: sql<number>`count(*) filter (where ${organizations.id}::text not like ${demoPrefix})::int`,
        demoCount: sql<number>`count(*) filter (where ${organizations.id}::text like ${demoPrefix})::int`,
      })
      .from(organizations)
      .where(
        and(
          eq(organizations.status, 'published'),
          isNull(organizations.supersedesId),
        ),
      ),
    listLanes(db),
  ])
  return {
    initialDataset:
      !rows[0].realCount && rows[0].demoCount
        ? ('demo' as const)
        : ('published' as const),
    hasReviewedOrganizations: rows[0].realCount > 0,
    hasDemoOrganizations: rows[0].demoCount > 0,
    lanes,
  }
}
