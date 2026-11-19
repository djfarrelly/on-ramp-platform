import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { v7 as uuid } from 'uuid'
import type { Database } from '../../db/client'
import {
  sources,
  sourceRuns,
  offerings,
  events,
  offeringLanes,
  lanes,
} from '../../db/schema'
import {
  sourceConfig,
  type Candidate,
  type Document,
  type IngestionPorts,
} from './contracts'
import {
  allowedUrl,
  discoverLinks,
  extractDom,
  extractTribe,
  validateCandidates,
} from './extract'

export function fingerprint(value: Candidate, context: unknown = null): string {
  return createHash('sha256')
    .update(JSON.stringify({ record: value, context }))
    .digest('hex')
}
export const canonicalSlug = (name: string, identity: string) =>
  `${
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100) || 'listing'
  }-${createHash('sha256').update(identity).digest('hex').slice(0, 12)}`
export async function listSources(db: Database) {
  const rows = await db.select().from(sources).orderBy(sources.name)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    target: row.target,
    url: row.url,
    config: row.config,
    enabled: row.isEnabled,
    termsReviewedAt: row.termsReviewedAt,
    robotsAllowed: row.robotsAllowed,
    lastRunAt: row.lastRunAt,
    lastStatus: row.lastStatus,
  }))
}
export async function configureSource(
  db: Database,
  sourceId: string,
  input: unknown,
) {
  const config = sourceConfig.parse(input)
  const [row] = await db
    .update(sources)
    .set({ config })
    .where(eq(sources.id, sourceId))
    .returning({ id: sources.id })
  if (!row) throw new Error('Source not found')
  return row
}
export async function recordTermsReview(
  db: Database,
  sourceId: string,
  note: string,
) {
  if (note.trim().length < 10 || note.length > 2000)
    throw new Error(
      'Provide a source-specific terms review note (10–2000 characters)',
    )
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, sourceId))
  if (!source) throw new Error('Source not found')
  // Keep the source-policy review note with its timestamp in the source record.
  const [row] = await db
    .update(sources)
    .set({ termsReviewedAt: new Date(), termsReviewNote: note.trim() })
    .where(eq(sources.id, sourceId))
    .returning({ id: sources.id, termsReviewedAt: sources.termsReviewedAt })
  return { ...row, note }
}
export async function getRun(db: Database, runId: string) {
  const [run] = await db
    .select()
    .from(sourceRuns)
    .where(eq(sourceRuns.id, runId))
  if (!run) throw new Error('Run not found')
  return run
}

export async function proposeCandidate(
  db: Database,
  source: typeof sources.$inferSelect,
  runId: string,
  candidate: Candidate,
  now: Date,
): Promise<'proposed' | 'unchanged'> {
  const config = sourceConfig.parse(source.config)
  const hash = fingerprint(candidate, {
    lanes: source.target === 'offerings' ? config.lanes : [],
    timezone: source.target === 'events' ? config.timezone : null,
  })
  return db.transaction(async (tx) => {
    // Short transaction; serialize review and proposals for this source, never fetch here.
    await tx
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.id, source.id))
      .for('update')
    const table = source.target === 'events' ? events : offerings
    const identityColumn =
      source.target === 'events'
        ? events.sourceEventUid
        : offerings.sourceRecordId
    const [current] = await tx
      .select()
      .from(table)
      .where(
        and(
          eq(table.sourceId, source.id),
          or(
            eq(identityColumn, candidate.sourceRecordId),
            eq(table.url, candidate.url),
          ),
          isNull(table.supersedesId),
        ),
      )
      .for('update')
    const [pending] = current
      ? await tx
          .select()
          .from(table)
          .where(
            and(
              eq(table.supersedesId, current.id),
              eq(table.status, 'pending_review'),
            ),
          )
          .for('update')
      : []
    if (
      current?.contentHash === hash ||
      (current && ['archived', 'stale'].includes(current.status))
    ) {
      if (source.target === 'events' && current)
        await tx
          .update(events)
          .set({ lastSeenAt: now })
          .where(eq(events.id, current.id))
      // A reversion at the source invalidates a previous, unreviewed change.
      if (pending)
        await tx
          .update(table)
          .set({ status: 'archived' })
          .where(eq(table.id, pending.id))
      return 'unchanged'
    }
    if (pending?.contentHash === hash) return 'unchanged'
    // Rejected changes stay rejected until their extracted facts change.
    if (current?.status === 'published') {
      const rejected = await tx
        .select({ id: table.id })
        .from(table)
        .where(
          and(
            eq(table.supersedesId, current.id),
            eq(table.status, 'rejected'),
            eq(table.contentHash, hash),
          ),
        )
        .limit(1)
      if (rejected.length) {
        if (pending)
          await tx
            .update(table)
            .set({ status: 'archived' })
            .where(eq(table.id, pending.id))
        return 'unchanged'
      }
    }
    const id =
      current && current.status !== 'published'
        ? current.id
        : (pending?.id ?? uuid())
    const slug =
      current?.slug ??
      canonicalSlug(candidate.name, source.id + candidate.sourceRecordId)
    const base = {
      id,
      organizationId: source.organizationId!,
      slug,
      name: candidate.name,
      description: candidate.description,
      costText: candidate.costText,
      url: candidate.url,
      status: 'pending_review' as const,
      sourceId: source.id,
      sourceRunId: runId,
      contentHash: hash,
      supersedesId: current?.status === 'published' ? current.id : null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    if (source.target === 'events') {
      const row = {
        ...base,
        sourceEventUid: candidate.sourceRecordId,
        sourceUrl: candidate.url,
        startsAt: candidate.startsAt ? new Date(candidate.startsAt) : null,
        endsAt: candidate.endsAt ? new Date(candidate.endsAt) : null,
        timezone: config.timezone,
        format: candidate.format,
        venueText: candidate.venueText,
        city: candidate.city,
        registrationUrl: candidate.applyUrl,
        lastSeenAt: now,
      }
      if (id === current?.id || id === pending?.id)
        await tx.update(events).set(row).where(eq(events.id, id))
      else await tx.insert(events).values(row)
    } else {
      const row = {
        ...base,
        sourceRecordId: candidate.sourceRecordId,
        kind: 'program' as const,
        summary: candidate.summary,
        deliveryMode: candidate.deliveryMode,
        durationText: candidate.durationText,
        scheduleText: candidate.scheduleText,
        eligibilitySummary: candidate.eligibilitySummary,
        applyUrl: candidate.applyUrl,
      }
      if (id === current?.id || id === pending?.id)
        await tx.update(offerings).set(row).where(eq(offerings.id, id))
      else await tx.insert(offerings).values(row)
      const laneRows = await tx
        .select()
        .from(lanes)
        .where(inArray(lanes.slug, config.lanes))
      if (laneRows.length !== config.lanes.length)
        throw new Error('Configured lanes must exist before proposing programs')
      await tx.delete(offeringLanes).where(eq(offeringLanes.offeringId, id))
      await tx.insert(offeringLanes).values(
        laneRows.map((lane) => ({
          offeringId: id,
          laneId: lane.id,
          isPrimary: lane.slug === config.lanes[0],
          createdAt: now,
        })),
      )
    }
    return 'proposed'
  })
}

export async function runSource(
  db: Database,
  input: {
    sourceId: string
    mode?: 'deterministic' | 'llm'
    limit?: number
    runId?: string
  },
  ports: IngestionPorts,
) {
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, input.sourceId))
  if (!source?.organizationId)
    throw new Error('Source with an organization is required')
  if (!source.isEnabled) throw new Error('Source is disabled')
  if (!source.termsReviewedAt)
    throw new Error(
      'Review source terms before running ingestion (ingest terms)',
    )
  if (source.target !== 'events' && source.target !== 'offerings')
    throw new Error('This pass supports events and offerings')
  const config = sourceConfig.parse(source.config)
  const mode = input.mode ?? config.mode
  const limit = Math.min(input.limit ?? config.limit, config.limit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 10)
    throw new Error('Limit must be between 1 and the configured sample limit')
  if (mode === 'llm' && (!config.llm || !ports.extractWithLlm))
    throw new Error(
      'Configure a source model and AI Gateway credentials before using LLM mode',
    )
  const now = ports.now ?? (() => new Date())
  const asOf = ports.asOf ?? now()
  const runId = input.runId ?? uuid()
  if (input.runId) {
    const prior = await db
      .select()
      .from(sourceRuns)
      .where(eq(sourceRuns.id, runId))
    if (prior.length) {
      if (prior[0].sourceId !== source.id)
        throw new Error('Run belongs to another source')
      if (prior[0].status !== 'running') return prior[0]
      throw new Error(
        'Run is already active; recover interrupted runs explicitly',
      )
    }
  }
  try {
    await db.insert(sourceRuns).values({
      id: runId,
      sourceId: source.id,
      trigger: 'manual',
      startedAt: now(),
      status: 'running',
      extractionMode: mode,
      configSnapshot: { ...config, mode, limit, asOf: asOf.toISOString() },
    })
  } catch {
    throw new Error(
      'Source already has an active run, or a run could not be created',
    )
  }
  const docs: Document[] = []
  const snapshotKeys: string[] = []
  const errors: string[] = []
  let modelUsage: unknown = null
  let proposed = 0
  let unchanged = 0
  let found = 0
  const snapshot = async () => {
    const key = await ports.saveSnapshot(runId, 'manifest.json', {
      sourceId: source.id,
      runId,
      mode,
      asOf: asOf.toISOString(),
      config,
      documents: snapshotKeys,
    })
    await db
      .update(sourceRuns)
      .set({ rawSnapshotKey: key })
      .where(eq(sourceRuns.id, runId))
  }
  const fetchPage = async (url: string) => {
    const document = await ports.fetchDocument(
      allowedUrl(url, source.url, config.allowedHosts),
      config.allowedHosts,
    )
    snapshotKeys.push(
      await ports.saveSnapshot(runId, `document-${docs.length}.json`, document),
    )
    docs.push(document)
    await snapshot()
    await db
      .update(sources)
      .set({ robotsAllowed: true, robotsCheckedAt: now() })
      .where(eq(sources.id, source.id))
    return document
  }
  try {
    await snapshot()
    let records: Candidate[] = []
    if (config.discovery.type === 'tribe-json') {
      const url = new URL(source.url)
      url.searchParams.set('per_page', String(Math.min(50, limit * 3)))
      const document = await fetchPage(url.href)
      if (mode === 'deterministic') records = extractTribe(document, config)
    } else {
      const root =
        config.discovery.type === 'pages' ? null : await fetchPage(source.url)
      const urls = (
        config.discovery.type === 'pages'
          ? config.discovery.urls
          : discoverLinks(root!, config)
      ).slice(0, limit)
      for (const url of urls) {
        try {
          const document = await fetchPage(url)
          if (mode === 'deterministic')
            records.push(extractDom(document, config))
        } catch (error) {
          errors.push(
            error instanceof Error ? error.message : 'Detail extraction failed',
          )
        }
      }
      if (errors.length)
        throw new Error(
          `${errors.length} detail page(s) failed; no proposals committed. ${errors[0]}`,
        )
    }
    if (mode === 'llm') {
      const extractionDocs =
        config.discovery.type === 'links'
          ? docs.filter((doc) => doc.url !== source.url)
          : docs
      const result = await ports.extractWithLlm!(
        extractionDocs,
        config,
        source.target,
      )
      records = result.records
      modelUsage = {
        model: result.model,
        usage: result.usage,
        promptVersion: config.llm!.promptVersion,
      }
      // Retain the validated extraction, not provider headers or credentials.
    }
    records = validateCandidates(
      records,
      config.discovery.type === 'links' ? docs.slice(1) : docs,
      config,
      source.target,
      asOf,
    ).slice(0, limit)
    found = records.length
    if (
      !found &&
      !(mode === 'deterministic' && config.discovery.type === 'tribe-json')
    )
      throw new Error(
        'No current records extracted; review the source, selectors and dates',
      )
    await ports.saveSnapshot(runId, 'extracted.json', {
      records,
      mode,
      modelUsage,
    })
    // Validate the entire batch before writing any proposal. Each proposal is atomic.
    for (const record of records) {
      if (
        (await proposeCandidate(db, source, runId, record, now())) ===
        'proposed'
      )
        proposed++
      else unchanged++
    }
    await db
      .update(sourceRuns)
      .set({
        status: 'success',
        finishedAt: now(),
        itemsFound: found,
        itemsProposed: proposed,
        itemsUnchanged: unchanged,
        diagnostics: {
          modelUsage,
          sampleLimited: true,
          disappearanceDetection: 'disabled-for-sample',
          errors,
        },
      })
      .where(eq(sourceRuns.id, runId))
    await db
      .update(sources)
      .set({ lastRunAt: now(), lastStatus: 'success', consecutiveFailures: 0 })
      .where(eq(sources.id, source.id))
  } catch (error) {
    const message =
      error instanceof Error && !('query' in error)
        ? error.message.slice(0, 1000)
        : 'Ingestion failed; check source configuration and database connectivity'
    await db
      .update(sourceRuns)
      .set({
        status: proposed ? 'partial' : 'failed',
        finishedAt: now(),
        itemsFound: found,
        itemsProposed: proposed,
        itemsUnchanged: unchanged,
        errorMessage: message,
        diagnostics: { modelUsage, errors, sampleLimited: true },
      })
      .where(eq(sourceRuns.id, runId))
    await db
      .update(sources)
      .set({
        lastRunAt: now(),
        lastStatus: proposed ? 'partial' : 'failed',
        consecutiveFailures: sql`${sources.consecutiveFailures} + 1`,
        ...(message.includes('robots.txt')
          ? { robotsAllowed: false, robotsCheckedAt: now() }
          : {}),
      })
      .where(eq(sources.id, source.id))
  }
  return getRun(db, runId)
}

export async function recoverRun(db: Database, runId: string) {
  const [row] = await db
    .update(sourceRuns)
    .set({
      status: 'failed',
      finishedAt: new Date(),
      errorMessage: 'Operator recovered an interrupted run',
    })
    .where(
      and(
        eq(sourceRuns.id, runId),
        eq(sourceRuns.status, 'running'),
        sql`${sourceRuns.startedAt} < now() - interval '1 hour'`,
      ),
    )
    .returning()
  if (!row)
    throw new Error('Only running jobs older than one hour can be recovered')
  return row
}
