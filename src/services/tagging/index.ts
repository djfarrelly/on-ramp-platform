import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { v7 as uuid } from 'uuid'
import type { Database } from '../../db/client'
import {
  organizations,
  offerings,
  events,
  tags,
  organizationTags,
  offeringTags,
  eventTags,
  taggingRuns,
  taggingProposals,
  taggingSuggestions,
} from '../../db/schema'
import { assertStaff, ReviewConflictError } from '../ingestion/review-access'
import {
  taggingRecord,
  taggingDefinitions,
  taggingVocabulary,
  taxonomyVersion,
  taggingPromptVersion,
  taggingRunInput,
  taggingReviewInput,
  taggingEditInput,
  taggingRecordReviewInput,
  type TaggingRecord,
  type TaggingRunInput,
  type TaggingPorts,
} from '../../lib/tagging-contracts'
import {
  normalizeEvidence,
  recordFingerprint,
  tagFingerprint,
  fingerprint,
  deterministicTags,
  combineTags,
  validateTagEvidence,
} from './classify'

const safeSourceUrl = (value: string | null) => {
  try {
    const u = new URL(value ?? '')
    return ['https:', 'http:'].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null
  } catch {
    return null
  }
}
const usable = (status: string) =>
  status === 'published' || status === 'pending_review'
const text = (value: string | null | undefined, max: number) =>
  normalizeEvidence(value ?? '').slice(0, max)
const status = (value: string) => value as 'published' | 'pending_review'
const visibleId = (id: string) => !id.startsWith('019a7e00-0000-7000-8000-')

export async function listTaggingCandidates(db: Database) {
  const [orgRows, offerRows, eventRows, ot, pt, et] = await Promise.all([
    db.select().from(organizations).where(isNull(organizations.supersedesId)),
    db
      .select()
      .from(offerings)
      .where(
        or(
          isNull(offerings.supersedesId),
          eq(offerings.status, 'pending_review'),
        ),
      ),
    db
      .select()
      .from(events)
      .where(
        or(isNull(events.supersedesId), eq(events.status, 'pending_review')),
      ),
    db.select().from(organizationTags),
    db.select().from(offeringTags),
    db.select().from(eventTags),
  ])
  const orgMap = new Map(
    orgRows
      .filter((r) => usable(r.status) && visibleId(r.id))
      .map((r) => [r.id, r]),
  )
  const result: TaggingRecord[] = []
  const empty = {
    description: '',
    summary: '',
    eligibility: '',
    cost: '',
    duration: '',
    schedule: '',
    prerequisites: '',
  }
  for (const row of orgMap.values())
    result.push(
      taggingRecord.parse({
        type: 'organization',
        id: row.id,
        organizationId: row.id,
        organizationName: row.displayName,
        listingStatus: status(row.status),
        url: safeSourceUrl(row.websiteUrl),
        updatedAt: row.updatedAt.toISOString(),
        fields: {
          ...empty,
          name: row.displayName,
          description: text(row.longDescription, 16000),
          summary: text(row.shortDescription, 600),
        },
        existingTagIds: ot
          .filter((r) => r.organizationId === row.id)
          .map((r) => r.tagId),
      }),
    )
  for (const row of offerRows) {
    const org = orgMap.get(row.organizationId)
    if (!org || !usable(row.status) || !visibleId(row.id)) continue
    result.push(
      taggingRecord.parse({
        type: 'offering',
        id: row.id,
        organizationId: org.id,
        organizationName: org.displayName,
        listingStatus: status(row.status),
        url: safeSourceUrl(row.url),
        updatedAt: row.updatedAt.toISOString(),
        fields: {
          name: row.name,
          description: text(row.description, 16000),
          summary: text(row.summary, 600),
          eligibility: text(row.eligibilitySummary, 3000),
          cost: text(row.costText, 500),
          duration: text(row.durationText, 500),
          schedule: text(row.scheduleText, 1000),
          prerequisites: text(row.prerequisites, 3000),
        },
        existingTagIds: pt
          .filter((r) => r.offeringId === row.id)
          .map((r) => r.tagId),
      }),
    )
  }
  for (const row of eventRows) {
    const org = orgMap.get(row.organizationId)
    if (!org || !usable(row.status) || !visibleId(row.id)) continue
    result.push(
      taggingRecord.parse({
        type: 'event',
        id: row.id,
        organizationId: org.id,
        organizationName: org.displayName,
        listingStatus: status(row.status),
        url: safeSourceUrl(row.url),
        updatedAt: row.updatedAt.toISOString(),
        fields: {
          ...empty,
          name: row.name,
          description: text(row.description, 16000),
          cost: text(row.costText, 500),
        },
        existingTagIds: et
          .filter((r) => r.eventId === row.id)
          .map((r) => r.tagId),
      }),
    )
  }
  return result
}

// Stable, provider-diverse sample. Weight offerings/events over umbrella profiles.
export function selectTaggingSample(
  records: TaggingRecord[],
  input: TaggingRunInput,
) {
  const args = taggingRunInput.parse(input)
  if (args.recordIds) {
    if (new Set(args.recordIds).size !== args.recordIds.length)
      throw new Error('Duplicate record IDs')
    const selected = args.recordIds.map((id) =>
      records.find((r) => r.id === id),
    )
    if (selected.some((r) => !r))
      throw new Error('A selected record is not eligible for tagging')
    if (selected.length > args.limit)
      throw new Error('Explicit record selection exceeds the limit')
    return selected as TaggingRecord[]
  }
  const remaining = [...records].sort((a, b) =>
    fingerprint([args.seed, a.id]).localeCompare(
      fingerprint([args.seed, b.id]),
    ),
  )
  const chosen: TaggingRecord[] = []
  const counts = new Map<string, number>()
  const cycle = ['offering', 'offering', 'event', 'offering', 'organization']
  while (chosen.length < args.limit && remaining.length) {
    const type = cycle[chosen.length % cycle.length]
    const pool = remaining.filter((r) => r.type === type)
    const options = pool.length ? pool : remaining
    const pick = [...options].sort(
      (a, b) =>
        (counts.get(a.organizationId) ?? 0) -
        (counts.get(b.organizationId) ?? 0),
    )[0]
    chosen.push(pick)
    remaining.splice(remaining.indexOf(pick), 1)
    counts.set(pick.organizationId, (counts.get(pick.organizationId) ?? 0) + 1)
  }
  return chosen
}

export async function registerTaggingVocabulary(db: Database) {
  for (const def of taggingDefinitions) {
    const now = new Date()
    await db
      .insert(tags)
      .values({
        id: def.id,
        slug: def.slug,
        label: def.label,
        description: def.definition,
        groupLabel: def.group,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
  }
  const rows = await db
    .select()
    .from(tags)
    .where(
      inArray(
        tags.slug,
        taggingDefinitions.map((t) => t.slug),
      ),
    )
  for (const def of taggingDefinitions) {
    const row = rows.find((r) => r.slug === def.slug)
    if (
      !row ||
      !row.isActive ||
      row.label !== def.label ||
      row.groupLabel !== def.group ||
      row.description !== def.definition
    )
      throw new Error(`Vocabulary conflict requires review: ${def.slug}`)
  }
  return new Map(rows.map((r) => [r.slug, r.id]))
}

export async function runTaggingBatch(
  db: Database,
  input: TaggingRunInput,
  ports: TaggingPorts,
  reviewerId: string,
) {
  const args = taggingRunInput.parse(input)
  await assertStaff(db, reviewerId)
  if (args.mode === 'hybrid') {
    if (!ports.classify || !ports.model)
      throw new Error('Configure the model adapter before hybrid tagging')
    ports.ready?.()
  }
  const candidates = await listTaggingCandidates(db)
  let reusable: TaggingQueue | null = null
  if (args.reuseRunId) {
    const previous = await getTaggingRun(db, args.reuseRunId)
    if (
      previous.status === 'running' ||
      previous.mode !== args.mode ||
      previous.model !== ports.model ||
      previous.taxonomyVersion !== taxonomyVersion ||
      ![taggingPromptVersion, 'tagging-v1'].includes(previous.promptVersion)
    )
      throw new ReviewConflictError(
        'Prior run is not compatible for evidence reuse',
      )
    reusable = await listTaggingProposals(db, reviewerId, previous.id)
    const identities = (previous.selection as { id: string }[]).map((r) => r.id)
    if (args.recordIds || identities.length > args.limit)
      throw new Error(
        'Reuse preserves the original selection; omit recordIds and use a sufficient limit',
      )
    args.recordIds = identities
  }
  const selected = selectTaggingSample(candidates, args)
  if (!selected.length) throw new Error('No eligible real records were found')
  const tagIds = await db.transaction((tx) => registerTaggingVocabulary(tx))
  const runId = uuid(),
    now = new Date()
  await db.insert(taggingRuns).values({
    id: runId,
    mode: args.mode,
    status: 'running',
    taxonomyVersion,
    promptVersion: taggingPromptVersion,
    model: args.mode === 'hybrid' ? ports.model : null,
    selection: selected.map((r) => ({ type: r.type, id: r.id })),
    configSnapshot: {
      seed: args.seed,
      limit: args.limit,
      taxonomy: taggingVocabulary,
      reuseRunId: args.reuseRunId ?? null,
    },
    createdBy: reviewerId,
    createdAt: now,
    updatedAt: now,
  })
  let completed = 0,
    failed = 0,
    inputTokens = 0,
    outputTokens = 0,
    cacheHits = 0
  for (const record of selected) {
    let result = combineTags(record, null),
      usage = null,
      errorCode: string | null = null
    if (args.mode === 'hybrid') {
      try {
        const cached = reusable?.items.find(
          (p) =>
            p.record.type === record.type &&
            p.record.id === record.id &&
            !p.errorCode &&
            p.status === 'pending_review' &&
            p.suggestions.every((s) => s.selected && s.basis !== 'reviewer') &&
            recordFingerprint(p.record) === recordFingerprint(record) &&
            tagFingerprint(p.record.existingTagIds) ===
              tagFingerprint(record.existingTagIds),
        )
        const output = cached
          ? {
              assignments: cached.suggestions.map((s) => ({
                slug: s.slug,
                field:
                  s.field as import('../../lib/tagging-contracts').TagEvidence['field'],
                quote: s.quote,
              })),
              usage: {
                inputTokens: 0,
                outputTokens: 0,
                cachedFromRunId: args.reuseRunId,
              },
            }
          : await ports.classify!(record)
        if (cached) cacheHits++
        usage = output.usage
        inputTokens += usage.inputTokens
        outputTokens += usage.outputTokens
        result = combineTags(record, output.assignments)
      } catch (error) {
        // Never persist a provider exception, request headers, key or raw response.
        errorCode =
          error instanceof Error &&
          ['UNGROUNDED_EVIDENCE', 'DUPLICATE_TAG'].includes(error.message)
            ? error.message
            : 'MODEL_OR_VALIDATION_FAILED'
        failed++
        result.issues.push(
          'Model generation or evidence validation failed. Only deterministic suggestions are shown.',
        )
      }
    }
    const proposalId = uuid(),
      timestamp = new Date()
    await db.transaction(async (tx) => {
      await tx.insert(taggingProposals).values({
        id: proposalId,
        runId,
        organizationId: record.type === 'organization' ? record.id : null,
        offeringId: record.type === 'offering' ? record.id : null,
        eventId: record.type === 'event' ? record.id : null,
        contentHash: recordFingerprint(record),
        tagSetHash: tagFingerprint(record.existingTagIds),
        recordUpdatedAt: new Date(record.updatedAt),
        snapshot: record,
        issues: result.issues,
        errorCode,
        usage,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      for (const a of result.assignments)
        await tx.insert(taggingSuggestions).values({
          proposalId,
          tagId: tagIds.get(a.slug)!,
          basis: a.basis,
          evidenceField: a.field,
          evidenceQuote: a.quote,
          isSelected: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      completed++
      await tx
        .update(taggingRuns)
        .set({
          itemsCompleted: completed,
          itemsFailed: failed,
          usage: { inputTokens, outputTokens, cacheHits },
          updatedAt: timestamp,
        })
        .where(eq(taggingRuns.id, runId))
    })
  }
  await db
    .update(taggingRuns)
    .set({
      status: failed
        ? failed === selected.length
          ? 'failed'
          : 'partial'
        : 'success',
      updatedAt: new Date(),
    })
    .where(eq(taggingRuns.id, runId))
  return getTaggingRun(db, runId)
}

export async function getTaggingRun(db: Database, runId: string) {
  const [run] = await db
    .select()
    .from(taggingRuns)
    .where(eq(taggingRuns.id, runId))
  if (!run) throw new ReviewConflictError('Tagging run not found')
  return {
    ...run,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  }
}

export async function listTaggingProposals(
  db: Database,
  reviewerId: string,
  runId?: string,
) {
  await assertStaff(db, reviewerId)
  const runs = await db
    .select()
    .from(taggingRuns)
    .orderBy(desc(taggingRuns.createdAt))
    .limit(50)
  const activeRunId = runId ?? runs[0]?.id
  const rows = activeRunId
    ? await db
        .select()
        .from(taggingProposals)
        .where(eq(taggingProposals.runId, activeRunId))
        .orderBy(asc(taggingProposals.createdAt))
    : []
  const suggestions = rows.length
    ? await db
        .select({
          proposalId: taggingSuggestions.proposalId,
          slug: tags.slug,
          label: tags.label,
          group: tags.groupLabel,
          basis: taggingSuggestions.basis,
          field: taggingSuggestions.evidenceField,
          quote: taggingSuggestions.evidenceQuote,
          selected: taggingSuggestions.isSelected,
        })
        .from(taggingSuggestions)
        .innerJoin(tags, eq(tags.id, taggingSuggestions.tagId))
        .where(
          inArray(
            taggingSuggestions.proposalId,
            rows.map((r) => r.id),
          ),
        )
    : []
  return {
    runs: runs.map((r) => ({
      id: r.id,
      mode: r.mode,
      status: r.status,
      model: r.model,
      count: r.itemsCompleted,
      failures: r.itemsFailed,
      createdAt: r.createdAt.toISOString(),
    })),
    activeRunId,
    vocabulary: taggingVocabulary,
    items: rows.map((r) => ({
      id: r.id,
      status: r.status,
      record: taggingRecord.parse(r.snapshot),
      issues: r.issues as string[],
      errorCode: r.errorCode,
      note: r.reviewNote ?? '',
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
      suggestions: suggestions
        .filter((s) => s.proposalId === r.id)
        .map(({ proposalId: _id, ...s }) => s),
    })),
  }
}
export type TaggingQueue = Awaited<ReturnType<typeof listTaggingProposals>>

/** Reuse a current pending proposal, or prepare one record with rules and no model calls. */
export async function openRecordTagReview(
  db: Database,
  input: unknown,
  reviewerId: string,
) {
  const args = taggingRecordReviewInput.parse(input)
  await assertStaff(db, reviewerId)
  const record = (await listTaggingCandidates(db)).find(
    (r) => r.type === args.type && r.id === args.id,
  )
  if (!record)
    throw new ReviewConflictError(
      'This record is no longer available for tagging. Refresh the listing queue.',
    )
  const column =
    args.type === 'organization'
      ? taggingProposals.organizationId
      : args.type === 'offering'
        ? taggingProposals.offeringId
        : taggingProposals.eventId
  const [latest] = await db
    .select()
    .from(taggingProposals)
    .where(eq(column, args.id))
    .orderBy(desc(taggingProposals.createdAt), desc(taggingProposals.id))
    .limit(1)
  let runId: string | undefined
  if (
    latest?.status === 'pending_review' &&
    latest.recordUpdatedAt.getTime() === Date.parse(record.updatedAt) &&
    latest.contentHash === recordFingerprint(record) &&
    latest.tagSetHash === tagFingerprint(record.existingTagIds)
  ) {
    const run = await getTaggingRun(db, latest.runId)
    if (run.taxonomyVersion === taxonomyVersion) runId = run.id
  }
  if (!runId)
    runId = (
      await runTaggingBatch(
        db,
        { mode: 'deterministic', recordIds: [record.id], limit: 1 },
        { model: null },
        reviewerId,
      )
    ).id
  const queue = await listTaggingProposals(db, reviewerId, runId)
  const proposal = queue.items.find(
    (p) => p.record.type === args.type && p.record.id === args.id,
  )
  if (!proposal || proposal.status !== 'pending_review')
    throw new ReviewConflictError(
      'This proposal was already reviewed. Close the editor and refresh.',
    )
  return { vocabulary: queue.vocabulary, proposal }
}
export type RecordTagReview = Awaited<ReturnType<typeof openRecordTagReview>>

/** Preserve supported selections after a staff content edit; retain the old snapshot for audit. */
export async function refreshTagsAfterContentEdit(
  db: Database,
  type: TaggingRecord['type'],
  id: string,
  reviewerId: string,
) {
  const column =
    type === 'organization'
      ? taggingProposals.organizationId
      : type === 'offering'
        ? taggingProposals.offeringId
        : taggingProposals.eventId
  const [prior] = await db
    .select()
    .from(taggingProposals)
    .where(eq(column, id))
    .orderBy(desc(taggingProposals.createdAt), desc(taggingProposals.id))
    .limit(1)
    .for('update')
  if (!prior || prior.status !== 'pending_review')
    return openRecordTagReview(db, { type, id }, reviewerId)
  const record = (await listTaggingCandidates(db)).find(
    (r) => r.id === id && r.type === type,
  )
  if (!record)
    throw new ReviewConflictError(
      'This record is no longer available for tagging.',
    )
  const [run] = await db
    .select()
    .from(taggingRuns)
    .where(eq(taggingRuns.id, prior.runId))
  const selected = await db
    .select({ tag: tags, suggestion: taggingSuggestions })
    .from(taggingSuggestions)
    .innerJoin(tags, eq(tags.id, taggingSuggestions.tagId))
    .where(
      and(
        eq(taggingSuggestions.proposalId, prior.id),
        eq(taggingSuggestions.isSelected, true),
      ),
    )
  const retained = selected.filter(({ tag, suggestion }) => {
    try {
      validateTagEvidence(record, {
        assignments: [
          {
            slug: tag.slug,
            field: suggestion.evidenceField,
            quote: suggestion.evidenceQuote,
          },
        ],
      })
      return tag.isActive
    } catch {
      return false
    }
  })
  const runId = uuid(),
    proposalId = uuid(),
    now = new Date()
  await db.insert(taggingRuns).values({
    id: runId,
    mode: run.mode,
    status: 'success',
    taxonomyVersion,
    promptVersion: taggingPromptVersion,
    model: run.model,
    selection: [{ type, id }],
    configSnapshot: {
      derivedFromProposal: prior.id,
      reason: 'listing-edit',
      modelCalls: 0,
    },
    itemsCompleted: 1,
    itemsFailed: 0,
    usage: { inputTokens: 0, outputTokens: 0, cacheHits: 1 },
    createdBy: reviewerId,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(taggingProposals).values({
    id: proposalId,
    runId,
    organizationId: type === 'organization' ? id : null,
    offeringId: type === 'offering' ? id : null,
    eventId: type === 'event' ? id : null,
    contentHash: recordFingerprint(record),
    tagSetHash: tagFingerprint(record.existingTagIds),
    recordUpdatedAt: new Date(record.updatedAt),
    snapshot: record,
    issues: [
      'Listing content was edited. Recheck the retained tag evidence.',
      ...(retained.length < selected.length
        ? ['Unsupported tags were removed after the content edit.']
        : []),
    ],
    reviewNote: prior.reviewNote,
    createdAt: now,
    updatedAt: now,
  })
  if (retained.length)
    await db.insert(taggingSuggestions).values(
      retained.map(({ tag, suggestion }) => ({
        proposalId,
        tagId: tag.id,
        basis: suggestion.basis,
        evidenceField: suggestion.evidenceField,
        evidenceQuote: suggestion.evidenceQuote,
        isSelected: true,
        createdAt: now,
        updatedAt: now,
      })),
    )
}

async function lockProposal(
  db: Database,
  proposalId: string,
  expectedUpdatedAt: string,
) {
  const [p] = await db
    .select()
    .from(taggingProposals)
    .where(eq(taggingProposals.id, proposalId))
    .for('update')
  if (!p || p.status !== 'pending_review')
    throw new ReviewConflictError('Proposal is missing or already reviewed')
  if (p.updatedAt.getTime() !== Date.parse(expectedUpdatedAt))
    throw new ReviewConflictError('Proposal changed; refresh before reviewing')
  const [run] = await db
    .select()
    .from(taggingRuns)
    .where(eq(taggingRuns.id, p.runId))
  if (!run || run.taxonomyVersion !== taxonomyVersion)
    throw new ReviewConflictError('Vocabulary changed; create a new proposal')
  return p
}

export async function editTaggingProposal(
  db: Database,
  input: unknown,
  reviewerId: string,
) {
  const args = taggingEditInput.parse(input)
  await assertStaff(db, reviewerId)
  return db.transaction(async (tx) => {
    const p = await lockProposal(tx, args.proposalId, args.expectedUpdatedAt)
    const record = taggingRecord.parse(p.snapshot)
    const assignments = validateTagEvidence(record, {
      assignments: args.assignments,
    })
    const definitions = await tx
      .select()
      .from(tags)
      .where(
        inArray(
          tags.slug,
          assignments.map((a) => a.slug),
        ),
      )
    if (
      assignments.some(
        (a) => !definitions.some((d) => d.slug === a.slug && d.isActive),
      )
    )
      throw new ReviewConflictError('A selected tag is unavailable')
    await tx
      .update(taggingSuggestions)
      .set({ isSelected: false, updatedAt: new Date() })
      .where(eq(taggingSuggestions.proposalId, p.id))
    for (const a of assignments) {
      const tag = definitions.find((d) => d.slug === a.slug)!
      const [existing] = await tx
        .select()
        .from(taggingSuggestions)
        .where(
          and(
            eq(taggingSuggestions.proposalId, p.id),
            eq(taggingSuggestions.tagId, tag.id),
          ),
        )
      if (existing) {
        // Original evidence is immutable; changing a tag's evidence requires a fresh run.
        await tx
          .update(taggingSuggestions)
          .set({ isSelected: true, updatedAt: new Date() })
          .where(
            and(
              eq(taggingSuggestions.proposalId, p.id),
              eq(taggingSuggestions.tagId, tag.id),
            ),
          )
      } else
        await tx.insert(taggingSuggestions).values({
          proposalId: p.id,
          tagId: tag.id,
          basis: 'reviewer',
          evidenceField: a.field,
          evidenceQuote: a.quote,
          isSelected: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
    }
    await tx
      .update(taggingProposals)
      .set({ reviewNote: args.note, updatedAt: new Date() })
      .where(eq(taggingProposals.id, p.id))
    return { proposalId: p.id }
  })
}

export async function decideTaggingProposal(
  db: Database,
  input: unknown,
  reviewerId: string,
) {
  const args = taggingReviewInput.parse(input)
  await assertStaff(db, reviewerId)
  // Serialize reviews on the same entity before locking the proposal; source
  // importers also lock the entity when updating it. Listing status never changes.
  const [identity] = await db
    .select()
    .from(taggingProposals)
    .where(eq(taggingProposals.id, args.proposalId))
  if (!identity) throw new ReviewConflictError('Proposal not found')
  return db.transaction(async (tx) => {
    if (identity.organizationId)
      await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, identity.organizationId))
        .for('update')
    if (identity.offeringId)
      await tx
        .select()
        .from(offerings)
        .where(eq(offerings.id, identity.offeringId))
        .for('update')
    if (identity.eventId)
      await tx
        .select()
        .from(events)
        .where(eq(events.id, identity.eventId))
        .for('update')
    const p = await lockProposal(tx, args.proposalId, args.expectedUpdatedAt)
    const snapshot = taggingRecord.parse(p.snapshot)
    if (args.decision === 'approve') {
      const record = (await listTaggingCandidates(tx)).find(
        (r) => r.type === snapshot.type && r.id === snapshot.id,
      )
      if (
        !record ||
        record.updatedAt !== p.recordUpdatedAt.toISOString() ||
        recordFingerprint(record) !== p.contentHash ||
        tagFingerprint(record.existingTagIds) !== p.tagSetHash
      )
        throw new ReviewConflictError(
          'Listing or existing tags changed; generate a fresh proposal',
        )
      const selected = await tx
        .select({ tag: tags, suggestion: taggingSuggestions })
        .from(taggingSuggestions)
        .innerJoin(tags, eq(tags.id, taggingSuggestions.tagId))
        .where(
          and(
            eq(taggingSuggestions.proposalId, p.id),
            eq(taggingSuggestions.isSelected, true),
          ),
        )
      if (
        selected.some((r) => {
          const definition = taggingDefinitions.find(
            (d) => d.slug === r.tag.slug,
          )
          return (
            !r.tag.isActive ||
            !definition ||
            r.tag.label !== definition.label ||
            r.tag.groupLabel !== definition.group ||
            r.tag.description !== definition.definition
          )
        })
      )
        throw new ReviewConflictError(
          'A selected tag definition changed; refresh the vocabulary before approval',
        )
      validateTagEvidence(record, {
        assignments: selected.map((r) => ({
          slug: r.tag.slug,
          field: r.suggestion.evidenceField,
          quote: r.suggestion.evidenceQuote,
        })),
      })
      // Additive: preserve every existing canonical assignment and manual choice.
      for (const { tag } of selected) {
        if (record.type === 'organization')
          await tx
            .insert(organizationTags)
            .values({ organizationId: record.id, tagId: tag.id })
            .onConflictDoNothing()
        else if (record.type === 'offering')
          await tx
            .insert(offeringTags)
            .values({ offeringId: record.id, tagId: tag.id })
            .onConflictDoNothing()
        else
          await tx
            .insert(eventTags)
            .values({ eventId: record.id, tagId: tag.id })
            .onConflictDoNothing()
      }
    }
    await tx
      .update(taggingProposals)
      .set({
        status: args.decision === 'approve' ? 'approved' : 'rejected',
        reviewNote: args.note || p.reviewNote,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(taggingProposals.id, p.id))
    return { proposalId: p.id, decision: args.decision }
  })
}
