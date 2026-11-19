import { z } from 'zod'

export const laneSlug = z.enum([
  'corporate-careers',
  'entrepreneurship',
  'startup-ecosystem',
  'learning-development',
])
export const searchInput = z
  .object({
    query: z.string().trim().max(200).default(''),
    lane: laneSlug.optional(),
    region: z.string().trim().max(80).optional(),
    deliveryMode: z
      .enum(['in_person', 'online', 'hybrid', 'self_paced'])
      .optional(),
    limit: z.number().int().min(1).max(50).default(24),
    offset: z.number().int().min(0).max(10000).default(0),
  })
  .strict()
export const slugInput = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(160),
  })
  .strict()
export const rpcInputs = {
  'lanes.list': z.object({}).strict(),
  'directory.searchOrganizations': searchInput.omit({ deliveryMode: true }),
  'directory.searchOpportunities': searchInput,
  'directory.getOrganization': slugInput,
  'directory.getOpportunity': slugInput,
  'directory.getEvent': slugInput,
} as const
export type RpcMethod = keyof typeof rpcInputs
export type SearchInput = z.input<typeof searchInput>
export type OrganizationSearchInput = z.input<
  (typeof rpcInputs)['directory.searchOrganizations']
>

// Provider-neutral tool declaration. A provider adapter can consume this later.
export const searchOpportunitiesTool = {
  name: 'directory_search_opportunities',
  description:
    'Find published Michigan programs, courses and services. Use only supplied preferences. Returns canonical links and factual eligibility information; it does not determine eligibility.',
  inputSchema: z.toJSONSchema(searchInput),
  method: 'directory.searchOpportunities',
} as const

export const directoryPageInput = z.object({
  q: z.string().trim().max(200).catch(''),
  lane: laneSlug.optional().catch(undefined),
  region: z.string().max(80).optional().catch(undefined),
  format: z
    .enum(['in_person', 'online', 'hybrid', 'self_paced'])
    .optional()
    .catch(undefined),
  view: z.enum(['programs', 'organizations']).catch('programs'),
  page: z.coerce.number().int().min(1).max(400).catch(1),
})
