import { z } from 'zod'
import vocabulary from './tagging-vocabulary.json' with { type: 'json' }

export const taggingVocabulary = vocabulary
export const taxonomyVersion = vocabulary.version
export const taggingPromptVersion = 'tagging-v2'
export const taggingDefinitions = vocabulary.groups.flatMap((group) =>
  group.tags.map((tag) => ({ ...tag, group: group.slug })),
)
export const taggingSlug = z.enum(
  taggingDefinitions.map((t) => t.slug) as [string, ...string[]],
)
export const taggingRecordType = z.enum(['organization', 'offering', 'event'])
export const evidenceField = z.enum([
  'name',
  'description',
  'summary',
  'eligibility',
  'cost',
  'duration',
  'schedule',
  'prerequisites',
])
export const tagEvidence = z
  .object({
    slug: taggingSlug,
    field: evidenceField,
    quote: z.string().trim().min(4).max(800),
  })
  .strict()
export const taggingOutput = z
  .object({ assignments: z.array(tagEvidence).max(8) })
  .strict()
export const taggingRecord = z
  .object({
    type: taggingRecordType,
    id: z.uuid(),
    organizationId: z.uuid(),
    organizationName: z.string(),
    listingStatus: z.enum(['published', 'pending_review']),
    url: z.string().nullable(),
    updatedAt: z.iso.datetime(),
    fields: z
      .object({
        name: z.string().min(1).max(300),
        description: z.string().max(16000),
        summary: z.string().max(600),
        eligibility: z.string().max(3000),
        cost: z.string().max(500),
        duration: z.string().max(500),
        schedule: z.string().max(1000),
        prerequisites: z.string().max(3000),
      })
      .strict(),
    existingTagIds: z.array(z.uuid()),
  })
  .strict()
export const taggingRunInput = z
  .object({
    mode: z.enum(['deterministic', 'hybrid']).default('hybrid'),
    limit: z.number().int().min(1).max(60).default(55),
    seed: z.string().trim().min(1).max(80).default('tagging-pilot-v1'),
    recordIds: z.array(z.uuid()).min(1).max(60).optional(),
    reuseRunId: z.uuid().optional(),
  })
  .strict()
const proposalIdentity = {
  proposalId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime(),
}
export const taggingReviewInput = z
  .object({
    ...proposalIdentity,
    decision: z.enum(['approve', 'reject']),
    note: z.string().trim().max(1000).default(''),
  })
  .strict()
export const taggingEditInput = z
  .object({
    ...proposalIdentity,
    assignments: z.array(tagEvidence).max(8),
    note: z.string().trim().max(1000).default(''),
  })
  .strict()
export const taggingRecordReviewInput = z
  .object({
    type: taggingRecordType,
    id: z.uuid(),
  })
  .strict()
export const taggingInputs = {
  'tagging.listVocabulary': z.object({}).strict(),
  'tagging.listCandidates': z.object({}).strict(),
  'tagging.runBatch': taggingRunInput,
  'tagging.getRun': z.object({ runId: z.uuid() }).strict(),
  'tagging.listProposals': z.object({ runId: z.uuid().optional() }).strict(),
  'tagging.openRecordReview': taggingRecordReviewInput,
  'tagging.editProposal': taggingEditInput,
  'tagging.decideProposal': taggingReviewInput,
} as const
export type TaggingRecord = z.infer<typeof taggingRecord>
export type TagEvidence = z.infer<typeof tagEvidence>
export type TaggingRunInput = z.input<typeof taggingRunInput>
export type TaggingAssignment = TagEvidence & {
  basis: 'rule' | 'model' | 'reviewer'
}
export type TaggingPorts = {
  model: string | null
  classify?: (record: TaggingRecord) => Promise<{
    assignments: TagEvidence[]
    usage: {
      inputTokens: number
      outputTokens: number
      cachedFromRunId?: string
    }
  }>
  ready?: () => void
}
