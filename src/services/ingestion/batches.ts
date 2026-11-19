import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'
import {
  lanes,
  locations,
  organizationLanes,
  organizations,
  sources,
} from '../../db/schema'
import manifest from './batches/random-20-2026-11-17.json'
import southeastManifest from './batches/southeast-20-2026-11-17.json'
import remainingManifest from './batches/southeast-remaining-2026-11-17.json'
import { sourceConfig } from './contracts'
import { tagPendingIngestion } from '../tagging/ingestion'
import { localReviewerId } from './bootstrap'

export const randomBatchKey = 'random-20-2026-11-17'
export const southeastBatchKey = 'southeast-20-2026-11-17'
export const remainingBatchKey = 'southeast-remaining-2026-11-17'
export const randomBatchProfiles = manifest.profiles
export const randomBatchSources = manifest.profiles.flatMap((profile) =>
  profile.sources.map((source) => ({
    ...source,
    organizationId: profile.id,
    config: sourceConfig.parse(source.config),
  })),
)
export const southeastBatchProfiles = southeastManifest.profiles
export const southeastBatchSources = southeastManifest.profiles.flatMap(
  (profile) =>
    profile.sources.map((source) => ({
      ...source,
      organizationId: profile.id,
      config: sourceConfig.parse(source.config),
    })),
)
export const remainingBatchProfiles = remainingManifest.profiles
export const remainingBatchSources = remainingManifest.profiles.flatMap(
  (profile) =>
    profile.sources.map((source) => ({
      ...source,
      organizationId: profile.id,
      config: sourceConfig.parse(source.config),
    })),
)

function getBatch(key: string) {
  if (key === randomBatchKey)
    return { profiles: randomBatchProfiles, sources: randomBatchSources }
  if (key === southeastBatchKey)
    return { profiles: southeastBatchProfiles, sources: southeastBatchSources }
  if (key === remainingBatchKey)
    return { profiles: remainingBatchProfiles, sources: remainingBatchSources }
  throw new Error(`Unknown ingestion batch: ${key}`)
}

export function ingestionBatchSourceKeys(key: string): string[] {
  return getBatch(key).sources.map((source) => source.config.key)
}

// Explicit workbook identities and versioned source defaults, independent of
// the append-only ordering used by the original nine bootstrap profiles.
export async function bootstrapIngestionBatch(db: Database, key: string) {
  const batch = getBatch(key)
  let createdOrganizations = 0
  let createdSources = 0
  await db.transaction(async (tx) => {
    const laneRows = await tx.select().from(lanes)
    const now = new Date()
    for (const profile of batch.profiles) {
      const inserted = await tx
        .insert(organizations)
        .values({
          id: profile.id,
          slug: profile.slug,
          displayName: profile.name,
          websiteUrl: profile.site,
          shortDescription: profile.summary,
          longDescription: profile.summary,
          status: 'pending_review',
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: organizations.id })
      const [registered] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, profile.id))
      if (!registered)
        throw new Error(
          `Organization slug conflicts with an existing identity: ${profile.slug}`,
        )
      if (inserted.length) {
        createdOrganizations++
        await tx.insert(locations).values({
          id: profile.locationId,
          organizationId: profile.id,
          city: profile.city,
          region: profile.region,
          isPrimary: true,
          isStatewide: profile.region === 'Statewide',
          createdAt: now,
          updatedAt: now,
        })
        for (const [i, slug] of profile.lanes.entries()) {
          const lane = laneRows.find((row) => row.slug === slug)
          if (!lane)
            throw new Error(
              'Seed the four core lanes before registering a batch',
            )
          await tx.insert(organizationLanes).values({
            organizationId: profile.id,
            laneId: lane.id,
            isPrimary: i === 0,
          })
        }
      }
      for (const source of batch.sources.filter(
        (row) => row.organizationId === profile.id,
      )) {
        const insertedSources = await tx
          .insert(sources)
          .values({
            id: source.id,
            organizationId: profile.id,
            name: source.name,
            kind:
              source.config.discovery.type === 'tribe-json'
                ? 'json_api'
                : 'scrape',
            target: source.target as 'offerings' | 'events',
            url: source.url,
            config: source.config,
            isEnabled: source.enabled,
            termsReviewNote: source.policyNote,
            autoApplyPolicy: 'never',
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: sources.id })
        createdSources += insertedSources.length
      }
    }
  })
  const tagging = await tagPendingIngestion(
    db,
    localReviewerId,
    undefined,
    batch.profiles.map((p) => p.id),
  )
  return {
    tagging,
    batch: key,
    createdOrganizations,
    createdSources,
    sources: batch.sources.map((source) => ({
      id: source.id,
      key: source.config.key,
      enabled: source.enabled,
    })),
  }
}
