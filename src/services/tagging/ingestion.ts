import type { Database } from '../../db/client'
import type { TaggingPorts } from '../../lib/tagging-contracts'
import { assertStaff } from '../ingestion/review-access'
import { listTaggingCandidates, runTaggingBatch } from './index'
import { listRecordTagState } from './readiness'

/** Runs before listing review, never publishes or approves records. */
export async function tagPendingIngestion(
  db: Database,
  reviewerId: string,
  ports: TaggingPorts = { model: null },
  recordIds?: string[],
  retry = false,
) {
  await assertStaff(db, reviewerId)
  const records = (await listTaggingCandidates(db)).filter(
    (r) =>
      r.listingStatus === 'pending_review' &&
      (!recordIds || recordIds.includes(r.id)),
  )
  const state = await listRecordTagState(
    db,
    records.map((r) => ({ ...r, updatedAt: new Date(r.updatedAt) })),
  )
  const pending = records.filter((r) => {
    const s = state.get(r.id)!
    return (
      !s.ready &&
      (retry || !s.proposal || s.stale || s.status !== 'pending_review')
    )
  })
  const runs: string[] = []
  for (let i = 0; i < pending.length; i += 60) {
    const run = await runTaggingBatch(
      db,
      {
        mode: ports.model ? 'hybrid' : 'deterministic',
        recordIds: pending.slice(i, i + 60).map((r) => r.id),
        limit: 60,
      },
      ports,
      reviewerId,
    )
    runs.push(run.id)
  }
  const refreshed = await listTaggingCandidates(db)
  const latest = await listRecordTagState(
    db,
    refreshed
      .filter((r) => records.some((original) => original.id === r.id))
      .map((r) => ({ ...r, updatedAt: new Date(r.updatedAt) })),
  )
  return {
    runs,
    generated: pending.length,
    ready: [...latest.values()].filter((s) => s.ready).length,
    waiting: [...latest.values()].filter((s) => !s.ready).length,
  }
}
