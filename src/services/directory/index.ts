import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import type { Database } from '../../db/client'
import {
  lanes,
  organizations,
  organizationLanes,
  organizationTags,
  offerings,
  events,
  offeringLanes,
  offeringTags,
  locations,
  tags,
} from '../../db/schema'
import {
  rpcInputs,
  type OrganizationSearchInput,
  type SearchInput,
} from '../../lib/contracts'

export class DirectoryNotFoundError extends Error {}
// The repeatable demo seed reserves this UUID prefix; imported IDs are UUIDv7.
const isDemoRecord = (id: string) => id.startsWith('019a7e00-0000-7000-8000-')
const publicUrl = (value: string | null) => {
  try {
    const url = new URL(value ?? '')
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}
const visibleOrg = and(
  eq(organizations.status, 'published'),
  isNull(organizations.supersedesId),
)!
const visibleOffering = and(
  eq(offerings.status, 'published'),
  isNull(offerings.supersedesId),
  visibleOrg,
)!

function organizationCriteria(input: OrganizationSearchInput): SQL[] {
  const p = rpcInputs['directory.searchOrganizations'].parse(input)
  const conditions: SQL[] = [visibleOrg]
  if (p.lane)
    conditions.push(
      sql`exists (select 1 from organization_lanes ol join lanes l on l.id = ol.lane_id where ol.organization_id = ${organizations.id} and l.slug = ${p.lane} and l.is_active)`,
    )
  if (p.region)
    conditions.push(
      sql`exists (select 1 from locations loc where loc.organization_id = ${organizations.id} and (loc.region = ${p.region} or loc.is_statewide or loc.is_virtual))`,
    )
  if (p.query)
    conditions.push(sql`(
    ${organizations.searchVector} @@ websearch_to_tsquery('english', ${p.query})
    or word_similarity(${p.query}, ${organizations.displayName}) > 0.3
    or exists (select 1 from organization_aliases a where a.organization_id = ${organizations.id} and (to_tsvector('english', a.alias) @@ websearch_to_tsquery('english', ${p.query}) or word_similarity(${p.query}, a.alias) > 0.3))
    or exists (select 1 from offerings o where o.organization_id = ${organizations.id} and o.status = 'published' and o.supersedes_id is null and o.search_vector @@ websearch_to_tsquery('english', ${p.query}))
    or exists (select 1 from organization_tags ot join tags t on t.id = ot.tag_id where ot.organization_id = ${organizations.id} and t.is_active and to_tsvector('english', t.label) @@ websearch_to_tsquery('english', ${p.query}))
  )`)
  return conditions
}

async function organizationExtras(db: Database, ids: string[]) {
  if (!ids.length) return { laneRows: [], locationRows: [], tagRows: [] }
  const [laneRows, locationRows, tagRows] = await Promise.all([
    db
      .select({
        organizationId: organizationLanes.organizationId,
        slug: lanes.slug,
        name: lanes.name,
        isPrimary: organizationLanes.isPrimary,
      })
      .from(organizationLanes)
      .innerJoin(lanes, eq(lanes.id, organizationLanes.laneId))
      .where(
        and(
          inArray(organizationLanes.organizationId, ids),
          eq(lanes.isActive, true),
        ),
      )
      .orderBy(asc(lanes.sortOrder)),
    db
      .select({
        organizationId: locations.organizationId,
        city: locations.city,
        region: locations.region,
        isStatewide: locations.isStatewide,
        isVirtual: locations.isVirtual,
      })
      .from(locations)
      .where(inArray(locations.organizationId, ids))
      .orderBy(desc(locations.isPrimary), asc(locations.city)),
    db
      .select({
        organizationId: organizationTags.organizationId,
        label: tags.label,
      })
      .from(organizationTags)
      .innerJoin(tags, eq(tags.id, organizationTags.tagId))
      .where(
        and(
          inArray(organizationTags.organizationId, ids),
          eq(tags.isActive, true),
        ),
      )
      .orderBy(asc(tags.label)),
  ])
  return { laneRows, locationRows, tagRows }
}

export async function listLanes(db: Database) {
  return db
    .select({
      slug: lanes.slug,
      name: lanes.name,
      tagline: lanes.tagline,
      description: lanes.description,
    })
    .from(lanes)
    .where(eq(lanes.isActive, true))
    .orderBy(asc(lanes.sortOrder))
}

export async function searchOrganizations(
  db: Database,
  input: OrganizationSearchInput = {},
) {
  const p = rpcInputs['directory.searchOrganizations'].parse(input)
  const where = and(...organizationCriteria(p))
  const rank = p.query
    ? sql<number>`ts_rank_cd(${organizations.searchVector}, websearch_to_tsquery('english', ${p.query})) + word_similarity(${p.query}, ${organizations.displayName})`
    : sql<number>`0::real`
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.displayName,
        summary: organizations.shortDescription,
        websiteUrl: organizations.websiteUrl,
      })
      .from(organizations)
      .where(where)
      .orderBy(
        desc(rank),
        asc(organizations.displayName),
        asc(organizations.id),
      )
      .limit(p.limit)
      .offset(p.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizations)
      .where(where),
  ])
  const extra = await organizationExtras(
    db,
    rows.map((r) => r.id),
  )
  return {
    items: rows.map((r) => ({
      ...r,
      isDemo: isDemoRecord(r.id),
      canonicalPath: `/organizations/${r.slug}`,
      lanes: extra.laneRows
        .filter((l) => l.organizationId === r.id)
        .map(({ organizationId, ...l }) => l),
      locations: extra.locationRows
        .filter((l) => l.organizationId === r.id)
        .map(({ organizationId, ...l }) => l),
      tags: extra.tagRows
        .filter((t) => t.organizationId === r.id)
        .map((t) => t.label),
    })),
    total: totals[0].count,
    limit: p.limit,
    offset: p.offset,
  }
}

export async function searchOpportunities(
  db: Database,
  input: SearchInput = {},
) {
  const p = rpcInputs['directory.searchOpportunities'].parse(input)
  const conditions: SQL[] = [visibleOffering]
  if (p.lane)
    conditions.push(
      sql`exists (select 1 from offering_lanes ol join lanes l on l.id = ol.lane_id where ol.offering_id = ${offerings.id} and l.slug = ${p.lane} and l.is_active)`,
    )
  if (p.deliveryMode)
    conditions.push(eq(offerings.deliveryMode, p.deliveryMode))
  if (p.region)
    conditions.push(sql`(
    ${offerings.deliveryMode} in ('online', 'self_paced')
    or exists (select 1 from offering_locations ol join locations loc on loc.id = ol.location_id where ol.offering_id = ${offerings.id} and (loc.region = ${p.region} or loc.is_statewide or loc.is_virtual))
    or (not exists (select 1 from offering_locations ol where ol.offering_id = ${offerings.id}) and exists (select 1 from locations loc where loc.organization_id = ${organizations.id} and (loc.region = ${p.region} or loc.is_statewide or loc.is_virtual)))
  )`)
  if (p.query)
    conditions.push(sql`(
    ${offerings.searchVector} @@ websearch_to_tsquery('english', ${p.query})
    or word_similarity(${p.query}, ${offerings.name}) > 0.3
    or ${organizations.searchVector} @@ websearch_to_tsquery('english', ${p.query})
    or exists (select 1 from offering_tags ot join tags t on t.id = ot.tag_id where ot.offering_id = ${offerings.id} and t.is_active and to_tsvector('english', t.label) @@ websearch_to_tsquery('english', ${p.query}))
  )`)
  const where = and(...conditions)
  const rank = p.query
    ? sql<number>`ts_rank_cd(${offerings.searchVector}, websearch_to_tsquery('english', ${p.query})) + word_similarity(${p.query}, ${offerings.name})`
    : sql<number>`0::real`
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: offerings.id,
        slug: offerings.slug,
        name: offerings.name,
        summary: offerings.summary,
        kind: offerings.kind,
        deliveryMode: offerings.deliveryMode,
        costText: offerings.costText,
        eligibilitySummary: offerings.eligibilitySummary,
        organizationName: organizations.displayName,
        organizationSlug: organizations.slug,
      })
      .from(offerings)
      .innerJoin(organizations, eq(organizations.id, offerings.organizationId))
      .where(where)
      .orderBy(desc(rank), asc(offerings.name), asc(offerings.id))
      .limit(p.limit)
      .offset(p.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(offerings)
      .innerJoin(organizations, eq(organizations.id, offerings.organizationId))
      .where(where),
  ])
  const laneRows = rows.length
    ? await db
        .select({
          offeringId: offeringLanes.offeringId,
          slug: lanes.slug,
          name: lanes.name,
          isPrimary: offeringLanes.isPrimary,
        })
        .from(offeringLanes)
        .innerJoin(lanes, eq(lanes.id, offeringLanes.laneId))
        .where(
          and(
            inArray(
              offeringLanes.offeringId,
              rows.map((r) => r.id),
            ),
            eq(lanes.isActive, true),
          ),
        )
        .orderBy(asc(lanes.sortOrder))
    : []
  return {
    items: rows.map((r) => ({
      ...r,
      isDemo: isDemoRecord(r.id),
      canonicalPath: `/programs/${r.slug}`,
      lanes: laneRows
        .filter((l) => l.offeringId === r.id)
        .map(({ offeringId, ...l }) => l),
    })),
    total: totals[0].count,
    limit: p.limit,
    offset: p.offset,
  }
}

export async function getOrganization(db: Database, input: { slug: string }) {
  const { slug } = rpcInputs['directory.getOrganization'].parse(input)
  const [row] = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.displayName,
      summary: organizations.shortDescription,
      description: organizations.longDescription,
      websiteUrl: organizations.websiteUrl,
    })
    .from(organizations)
    .where(and(visibleOrg, eq(organizations.slug, slug)))
  if (!row) throw new DirectoryNotFoundError('Organization not found')
  const extra = await organizationExtras(db, [row.id])
  const programs = await db
    .select({
      slug: offerings.slug,
      name: offerings.name,
      summary: offerings.summary,
      deliveryMode: offerings.deliveryMode,
      costText: offerings.costText,
    })
    .from(offerings)
    .where(
      and(
        eq(offerings.organizationId, row.id),
        eq(offerings.status, 'published'),
        isNull(offerings.supersedesId),
      ),
    )
    .orderBy(asc(offerings.name))
  const upcomingEvents = await db
    .select({ slug: events.slug, name: events.name, startsAt: events.startsAt })
    .from(events)
    .where(
      and(
        eq(events.organizationId, row.id),
        eq(events.status, 'published'),
        isNull(events.supersedesId),
        sql`coalesce(${events.endsAt}, ${events.startsAt}) >= now()`,
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(24)
  return {
    ...row,
    isDemo: isDemoRecord(row.id),
    websiteUrl: publicUrl(row.websiteUrl),
    canonicalPath: `/organizations/${row.slug}`,
    lanes: extra.laneRows.map(({ organizationId, ...l }) => l),
    locations: extra.locationRows.map(({ organizationId, ...l }) => l),
    tags: extra.tagRows.map((t) => t.label),
    programs,
    events: upcomingEvents,
  }
}

export async function getOpportunity(db: Database, input: { slug: string }) {
  const { slug } = rpcInputs['directory.getOpportunity'].parse(input)
  const [row] = await db
    .select({
      id: offerings.id,
      slug: offerings.slug,
      name: offerings.name,
      summary: offerings.summary,
      description: offerings.description,
      deliveryMode: offerings.deliveryMode,
      costText: offerings.costText,
      durationText: offerings.durationText,
      scheduleText: offerings.scheduleText,
      eligibilitySummary: offerings.eligibilitySummary,
      accessNote: offerings.accessNote,
      url: offerings.url,
      applyUrl: offerings.applyUrl,
      organizationName: organizations.displayName,
      organizationSlug: organizations.slug,
    })
    .from(offerings)
    .innerJoin(organizations, eq(organizations.id, offerings.organizationId))
    .where(and(visibleOffering, eq(offerings.slug, slug)))
  if (!row) throw new DirectoryNotFoundError('Program not found')
  const laneRows = await db
    .select({
      slug: lanes.slug,
      name: lanes.name,
      isPrimary: offeringLanes.isPrimary,
    })
    .from(offeringLanes)
    .innerJoin(lanes, eq(lanes.id, offeringLanes.laneId))
    .where(and(eq(offeringLanes.offeringId, row.id), eq(lanes.isActive, true)))
    .orderBy(asc(lanes.sortOrder))
  return {
    ...row,
    url: publicUrl(row.url),
    applyUrl: publicUrl(row.applyUrl),
    isDemo: isDemoRecord(row.id),
    canonicalPath: `/programs/${row.slug}`,
    lanes: laneRows,
  }
}

export async function getEvent(db: Database, input: { slug: string }) {
  const { slug } = rpcInputs['directory.getEvent'].parse(input)
  const [row] = await db
    .select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      description: events.description,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      timezone: events.timezone,
      format: events.format,
      venueText: events.venueText,
      city: events.city,
      costText: events.costText,
      url: events.url,
      registrationUrl: events.registrationUrl,
      organizationName: organizations.displayName,
      organizationSlug: organizations.slug,
    })
    .from(events)
    .innerJoin(organizations, eq(organizations.id, events.organizationId))
    .where(
      and(
        eq(events.slug, slug),
        eq(events.status, 'published'),
        isNull(events.supersedesId),
        visibleOrg,
      ),
    )
  if (!row) throw new DirectoryNotFoundError('Event not found')
  return {
    ...row,
    url: publicUrl(row.url),
    registrationUrl: publicUrl(row.registrationUrl),
    canonicalPath: `/events/${row.slug}`,
  }
}

export type OrganizationCardData = Awaited<
  ReturnType<typeof searchOrganizations>
>['items'][number]
export type OpportunityCardData = Awaited<
  ReturnType<typeof searchOpportunities>
>['items'][number]
