import { z } from 'zod'
import { laneSlug } from './contracts'

export const discoveryRegions = [
  'Southeast',
  'West Michigan',
  'Mid-Michigan',
  'Northern Michigan',
  'Upper Peninsula',
] as const
export const discoveryRegionChoices = discoveryRegions.map((value) => ({
  value,
  label: value === 'Southeast' ? 'Southeast Michigan' : value,
}))
export const discoveryFilters = z
  .object({
    query: z.string().trim().max(120),
    lane: laneSlug.nullable(),
    region: z.enum(discoveryRegions).nullable(),
    deliveryMode: z
      .enum(['in_person', 'online', 'hybrid', 'self_paced'])
      .nullable(),
    kind: z.enum(['all', 'program', 'event', 'organization']),
  })
  .strict()
export const emptyDiscoveryFilters: z.infer<typeof discoveryFilters> = {
  query: '',
  lane: null,
  region: null,
  deliveryMode: null,
  kind: 'all',
}
export const discoveryDataset = z.enum(['published', 'demo'])
export const discoveryStep = z.enum(['goal', 'region', 'format', 'kind'])
export const discoverySelection = z.discriminatedUnion('type', [
  z.object({ type: z.literal('goal'), value: laneSlug.nullable() }).strict(),
  z
    .object({
      type: z.literal('region'),
      value: z.enum(discoveryRegions).nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal('format'),
      value: discoveryFilters.shape.deliveryMode,
    })
    .strict(),
  z
    .object({ type: z.literal('kind'), value: discoveryFilters.shape.kind })
    .strict(),
  z.object({ type: z.literal('clear-topic') }).strict(),
])
export type DiscoverySelection = z.infer<typeof discoverySelection>
export type DiscoveryStep = z.infer<typeof discoveryStep>
export type DiscoveryChoice = { label: string; selection: DiscoverySelection }
export const discoveryStartingChoices = [
  {
    label: "I'm starting a business",
    icon: 'business',
    selection: { type: 'goal', value: 'entrepreneurship' },
  },
  {
    label: 'Learning and training',
    icon: 'learning',
    selection: { type: 'goal', value: 'learning-development' },
  },
  {
    label: 'Finding a new role',
    icon: 'career',
    selection: { type: 'goal', value: 'corporate-careers' },
  },
  {
    label: 'Connect with startups',
    icon: 'startup',
    selection: { type: 'goal', value: 'startup-ecosystem' },
  },
] as const satisfies readonly (DiscoveryChoice & { icon: string })[]
export const discoverySearchInput = discoveryFilters.extend({
  dataset: discoveryDataset.default('published'),
  limit: z.number().int().min(1).max(6).default(6),
})
export const discoveryTurnInput = z
  .object({
    message: z.string().trim().min(1).max(600).optional(),
    selection: discoverySelection.optional(),
    filters: discoveryFilters.default(emptyDiscoveryFilters),
    completed: z
      .array(discoveryStep)
      .max(4)
      .refine((items) => new Set(items).size === items.length)
      .default([]),
    dataset: discoveryDataset.default('published'),
    approach: z.enum(['automatic', 'deterministic']).default('automatic'),
  })
  .strict()
  .refine(
    (value) => Boolean(value.message) !== Boolean(value.selection),
    'Send either a message or a structured selection.',
  )
export type DiscoveryFilters = z.infer<typeof discoveryFilters>
export type DiscoveryTurnInput = z.input<typeof discoveryTurnInput>
export type DiscoverySearchInput = z.input<typeof discoverySearchInput>
export const discoveryTool = {
  name: 'discovery_search',
  description:
    'Search published Michigan programs, upcoming events and organizations. Supply only preferences stated by the visitor. Use a few topic keywords, not a sentence. Use null for unspecified filters. This tool cannot determine eligibility, make referrals or change records.',
  inputSchema: z.toJSONSchema(discoveryFilters),
  method: 'discovery.search',
} as const
