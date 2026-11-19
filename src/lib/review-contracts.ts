import { z } from 'zod'
import { isLocalDateTime } from './datetime'

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
const url = text(2000).refine((value) => {
  if (!value) return true
  try {
    const u = new URL(value)
    return (
      ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password
    )
  } catch {
    return false
  }
}, 'Use a full HTTP or HTTPS URL without credentials.')
const common = {
  name: z.string().trim().min(1).max(300),
  description: text(16000),
}
const identity = { id: z.uuid(), expectedUpdatedAt: z.iso.datetime() }
const changes = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object(shape)
    .partial()
    .strict()
    .refine((v) => Object.keys(v).length > 0, 'Choose a field to edit.')
export const reviewEditInput = z.discriminatedUnion('type', [
  z
    .object({
      ...identity,
      type: z.literal('organization'),
      changes: changes({ ...common, summary: text(600), websiteUrl: url }),
    })
    .strict(),
  z
    .object({
      ...identity,
      type: z.literal('offering'),
      changes: changes({
        ...common,
        summary: text(600),
        costText: text(300),
        durationText: text(300),
        scheduleText: text(500),
        eligibilitySummary: text(2000),
        applyUrl: url,
        deliveryMode: z
          .enum(['in_person', 'online', 'hybrid', 'self_paced'])
          .nullable(),
      }),
    })
    .strict(),
  z
    .object({
      ...identity,
      type: z.literal('event'),
      changes: changes({
        ...common,
        costText: text(300),
        venueText: text(500),
        city: text(100),
        registrationUrl: url,
        format: z.enum(['in_person', 'virtual', 'hybrid']).nullable(),
        startsAt: z.iso.datetime({ offset: true }).nullable(),
        endsAt: z.iso.datetime({ offset: true }).nullable(),
        startsAtLocal: z
          .string()
          .refine(isLocalDateTime, 'Choose a valid date and time.')
          .nullable(),
        endsAtLocal: z
          .string()
          .refine(isLocalDateTime, 'Choose a valid date and time.')
          .nullable(),
        timezone: z
          .string()
          .trim()
          .max(100)
          .refine((value) => {
            try {
              new Intl.DateTimeFormat('en-US', { timeZone: value })
              return true
            } catch {
              return false
            }
          }, 'Use an IANA timezone, such as America/Detroit.'),
      }).refine(
        (v) =>
          !(v.startsAt !== undefined && v.startsAtLocal !== undefined) &&
          !(v.endsAt !== undefined && v.endsAtLocal !== undefined),
        'Send either a local time or an offset timestamp for each date, not both.',
      ),
    })
    .strict(),
])

export const reviewDecisionInput = z
  .object({
    type: z.enum(['organization', 'offering', 'event']),
    id: z.uuid(),
    decision: z.enum(['approve', 'reject']),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict()
export const reviewInputs = {
  'review.listProposals': z.object({}).strict(),
  'review.decideProposal': reviewDecisionInput,
  'review.editProposal': reviewEditInput,
} as const
export type ReviewDecisionInput = z.infer<typeof reviewDecisionInput>
export type ReviewEditInput = z.infer<typeof reviewEditInput>
