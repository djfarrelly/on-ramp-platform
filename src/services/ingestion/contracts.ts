import { z } from 'zod'
import { reviewDecisionInput } from '../../lib/review-contracts'

const httpsUrl = z.url().refine((value) => {
  const u = new URL(value)
  return u.protocol === 'https:' && !u.username && !u.password && !u.port
}, 'Use a public HTTPS URL without credentials or a custom port')
export const extractionMode = z.enum(['deterministic', 'llm'])
export const fieldRule = z
  .object({
    selector: z.string().min(1).max(500),
    attribute: z.string().max(80).optional(),
    required: z.boolean().default(false),
  })
  .strict()
export const sourceConfig = z
  .object({
    version: z.literal(1),
    key: z.string().regex(/^[a-z0-9-]+$/),
    allowedHosts: z
      .array(z.string().regex(/^[a-z0-9.-]+$/))
      .min(1)
      .max(10),
    mode: extractionMode.default('deterministic'),
    limit: z.number().int().min(1).max(10).default(5),
    lanes: z
      .array(
        z.enum([
          'corporate-careers',
          'entrepreneurship',
          'startup-ecosystem',
          'learning-development',
        ]),
      )
      .min(1),
    timezone: z
      .string()
      .default('America/Detroit')
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value })
          return true
        } catch {
          return false
        }
      }, 'Invalid IANA time zone'),
    discovery: z.discriminatedUnion('type', [
      z.object({ type: z.literal('tribe-json') }).strict(),
      z
        .object({
          type: z.literal('links'),
          selector: z.string().min(1).max(500),
          includePath: z.string().min(1).max(500),
        })
        .strict(),
      z
        .object({
          type: z.literal('pages'),
          urls: z.array(httpsUrl).min(1).max(10),
        })
        .strict(),
    ]),
    dom: z
      .object({
        scope: z.string().min(1).max(500),
        fields: z.partialRecord(
          z.enum([
            'name',
            'description',
            'summary',
            'costText',
            'durationText',
            'scheduleText',
            'eligibilitySummary',
            'applyUrl',
            'startsAt',
            'endsAt',
            'venueText',
            'city',
            'format',
            'deliveryMode',
          ]),
          fieldRule,
        ),
      })
      .strict()
      .optional(),
    llm: z
      .object({
        model: z.string().min(1).max(150),
        promptVersion: z.literal('extract-v1'),
        scope: z.string().max(500).default('main'),
        instructions: z.string().max(2000).default(''),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.discovery.type !== 'tribe-json' && !value.dom)
      ctx.addIssue({
        code: 'custom',
        message:
          'HTML sources require DOM rules, including when comparing LLM extraction.',
      })
  })
export type SourceConfig = z.infer<typeof sourceConfig>

const nullableText = (max: number) =>
  z.string().trim().min(1).max(max).nullable()
export const candidateSchema = z
  .object({
    sourceRecordId: z.string().min(1).max(500),
    url: httpsUrl,
    name: z.string().trim().min(3).max(300),
    description: nullableText(16000),
    summary: nullableText(600),
    costText: nullableText(300),
    durationText: nullableText(300),
    scheduleText: nullableText(500),
    eligibilitySummary: nullableText(2000),
    applyUrl: httpsUrl.nullable(),
    startsAt: z.iso.datetime({ offset: true }).nullable(),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    venueText: nullableText(500),
    city: nullableText(100),
    format: z.enum(['in_person', 'virtual', 'hybrid']).nullable(),
    deliveryMode: z
      .enum(['in_person', 'online', 'hybrid', 'self_paced'])
      .nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.startsAt && v.endsAt && Date.parse(v.endsAt) < Date.parse(v.startsAt))
      ctx.addIssue({ code: 'custom', message: 'End precedes start' })
  })
export type Candidate = z.infer<typeof candidateSchema>
export const emptyFacts = {
  description: null,
  summary: null,
  costText: null,
  durationText: null,
  scheduleText: null,
  eligibilitySummary: null,
  applyUrl: null,
  startsAt: null,
  endsAt: null,
  venueText: null,
  city: null,
  format: null,
  deliveryMode: null,
} as const
export const extractionOutput = z
  .object({ records: z.array(candidateSchema).max(10) })
  .strict()
export const ingestionInputs = {
  'ingestion.listSources': z.object({}).strict(),
  'ingestion.runSource': z
    .object({
      sourceId: z.uuid(),
      mode: extractionMode.optional(),
      limit: z.number().int().min(1).max(10).optional(),
    })
    .strict(),
  'ingestion.getRun': z.object({ runId: z.uuid() }).strict(),
  'ingestion.listProposals': z
    .object({ sourceId: z.uuid().optional() })
    .strict(),
  'ingestion.reviewProposal': reviewDecisionInput,
  'ingestion.configureSource': z
    .object({ sourceId: z.uuid(), config: sourceConfig })
    .strict(),
  'ingestion.recordTermsReview': z
    .object({ sourceId: z.uuid(), note: z.string().min(10).max(2000) })
    .strict(),
  'ingestion.recoverRun': z.object({ runId: z.uuid() }).strict(),
} as const

export type Document = {
  url: string
  body: string
  contentType: string
  fetchedAt: string
}
export type IngestionPorts = {
  asOf?: Date
  fetchDocument: (url: string, allowedHosts: string[]) => Promise<Document>
  saveSnapshot: (runId: string, path: string, value: unknown) => Promise<string>
  extractWithLlm?: (
    docs: Document[],
    config: SourceConfig,
    target: 'events' | 'offerings',
  ) => Promise<{ records: Candidate[]; model: string; usage: unknown }>
  now?: () => Date
}
