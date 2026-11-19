import {
  discoveryFilters,
  discoveryStartingChoices,
  discoveryRegionChoices,
  discoveryTurnInput,
  type DiscoveryChoice,
  type DiscoveryFilters,
  type DiscoverySelection,
  type DiscoveryStep,
  type DiscoveryTurnInput,
} from '../../lib/discovery-contracts'
import { interpretRequest } from './intent'
import type { DiscoverySearchResult } from './index'

export type IntentInterpreter = (
  message: string,
  previous: DiscoveryFilters,
) => Promise<DiscoveryFilters>
export type DiscoveryFollowUp = {
  step: DiscoveryStep | 'recover'
  question: string
  hint: string | null
  choices: DiscoveryChoice[]
}
export const discoveryTurnBudget = { modelCalls: 1, searchCalls: 2 } as const
const formatLabels = {
  online: 'Online',
  in_person: 'In person',
  hybrid: 'Hybrid',
  self_paced: 'Self-paced',
} as const
const kindLabels = {
  all: 'A mix of everything',
  program: 'Programs & services',
  event: 'Events',
  organization: 'Organizations',
} as const

function applySelection(
  filters: DiscoveryFilters,
  selection: DiscoverySelection,
) {
  const next = { ...filters }
  let label: string
  switch (selection.type) {
    case 'goal':
      next.lane = selection.value
      next.query = ''
      next.kind = 'all'
      label =
        discoveryStartingChoices.find(
          (choice) => choice.selection.value === selection.value,
        )?.label ?? 'Explore all directions'
      break
    case 'region':
      next.region = selection.value
      label =
        discoveryRegionChoices.find((r) => r.value === selection.value)
          ?.label ?? 'Michigan'
      break
    case 'format':
      next.deliveryMode = selection.value
      label = selection.value ? formatLabels[selection.value] : 'Any format'
      break
    case 'kind':
      next.kind = selection.value
      label = kindLabels[selection.value]
      break
    case 'clear-topic':
      next.query = ''
      label = 'Explore broader ideas'
      break
  }
  return { filters: next, label }
}
function inferredSteps(
  message: string,
  previous: DiscoveryFilters,
  next: DiscoveryFilters,
): DiscoveryStep[] {
  const steps: DiscoveryStep[] = []
  if (
    next.lane ||
    next.lane !== previous.lane ||
    /\ball (lanes|directions)\b/i.test(message)
  )
    steps.push('goal')
  if (
    next.region ||
    next.region !== previous.region ||
    /\b(anywhere|statewide|all regions|across michigan|any region)\b/i.test(
      message,
    )
  )
    steps.push('region')
  if (
    next.deliveryMode ||
    next.deliveryMode !== previous.deliveryMode ||
    /\b(any format|all formats|either format|no preference)\b/i.test(message)
  )
    steps.push('format')
  if (
    next.kind !== 'all' ||
    next.kind !== previous.kind ||
    /\b(everything|all types|a mix)\b/i.test(message)
  )
    steps.push('kind')
  return steps
}
function nextQuestion(
  filters: DiscoveryFilters,
  completed: DiscoveryStep[],
  hasResults: boolean,
): DiscoveryFollowUp | null {
  if (!hasResults) {
    const choices: DiscoveryChoice[] = []
    if (filters.query)
      choices.push({
        label: 'Explore broader ideas',
        selection: { type: 'clear-topic' },
      })
    if (filters.region)
      choices.push(
        ...discoveryRegionChoices
          .filter((r) => r.value !== filters.region)
          .map((r) => ({
            label: r.label,
            selection: { type: 'region' as const, value: r.value },
          })),
      )
    if (filters.deliveryMode)
      choices.push({
        label: 'Include all formats',
        selection: { type: 'format', value: null },
      })
    if (filters.kind !== 'all')
      choices.push({
        label: 'See all listing types',
        selection: { type: 'kind', value: 'all' },
      })
    if (!choices.length)
      choices.push(
        ...discoveryStartingChoices.filter(
          (c) => c.selection.value !== filters.lane,
        ),
        {
          label: 'Explore all directions',
          selection: { type: 'goal', value: null },
        },
      )
    return {
      step: 'recover',
      question: 'Want to try a wider search?',
      hint: 'Only reviewed listings appear here. You can change a preference or tell me more below.',
      choices,
    }
  }
  if (!completed.includes('goal'))
    return {
      step: 'goal',
      question: 'Which direction interests you?',
      hint: null,
      choices: [...discoveryStartingChoices],
    }
  if (!completed.includes('region'))
    return {
      step: 'region',
      question: 'Where do you live?',
      hint: 'A region is enough. Online options are included too.',
      choices: [
        ...discoveryRegionChoices.map((region) => ({
          label: region.label,
          selection: { type: 'region' as const, value: region.value },
        })),
      ],
    }
  if (!completed.includes('format'))
    return {
      step: 'format',
      question: 'How would you like to take part?',
      hint: 'Pick a format, or keep your options open.',
      choices: [
        { label: 'Any format', selection: { type: 'format', value: null } },
        ...Object.entries(formatLabels).map(([value, label]) => ({
          label,
          selection: {
            type: 'format' as const,
            value: value as keyof typeof formatLabels,
          },
        })),
      ],
    }
  if (!completed.includes('kind'))
    return {
      step: 'kind',
      question: 'What would you like to explore?',
      hint: null,
      choices: Object.entries(kindLabels).map(([value, label]) => ({
        label,
        selection: {
          type: 'kind' as const,
          value: value as DiscoveryFilters['kind'],
        },
      })),
    }
  return null
}

// A stateless, bounded turn loop. All decisions are inspectable and independent
// of HTTP/model providers; choices never enter a language interpreter.
export async function runDiscoveryTurn(
  input: DiscoveryTurnInput,
  ports: {
    search: (filters: DiscoveryFilters) => Promise<DiscoverySearchResult>
    interpret?: IntentInterpreter
  },
) {
  const p = discoveryTurnInput.parse(input)
  let filters: DiscoveryFilters
  let userMessage: string
  const completed = new Set<DiscoveryStep>(p.completed)
  const steps: (
    'selection' | 'interpret' | 'search' | 'broaden-topic' | 'ask' | 'ready'
  )[] = []
  let strategy: 'ai' | 'deterministic' | 'fallback' = 'deterministic'
  let modelCalls = 0
  if (p.selection) {
    const applied = applySelection(p.filters, p.selection)
    filters = applied.filters
    userMessage = applied.label
    steps.push('selection')
    if (p.selection.type !== 'clear-topic') completed.add(p.selection.type)
    if (p.selection.type === 'goal') completed.delete('kind')
  } else {
    userMessage = p.message!
    filters = interpretRequest(userMessage, p.filters)
    steps.push('interpret')
    if (p.approach === 'automatic' && ports.interpret) {
      modelCalls++
      try {
        filters = discoveryFilters.parse(
          await ports.interpret(userMessage, p.filters),
        )
        strategy = 'ai'
      } catch {
        strategy = 'fallback'
      }
    }
    for (const step of inferredSteps(userMessage, p.filters, filters))
      completed.add(step)
    if (filters.lane !== p.filters.lane && filters.kind === 'all')
      completed.delete('kind')
  }
  // Existing explicitly supplied filters also count as answered preferences.
  if (filters.lane) completed.add('goal')
  if (filters.region) completed.add('region')
  if (filters.deliveryMode) completed.add('format')
  if (filters.kind !== 'all') completed.add('kind')

  let searchCalls = 0
  async function search(args: DiscoveryFilters) {
    if (searchCalls >= discoveryTurnBudget.searchCalls)
      throw new Error('Discovery search budget exhausted')
    searchCalls++
    steps.push('search')
    return ports.search(args)
  }
  let result = await search(filters)
  let match: 'exact' | 'broader' | 'none' = result.items.length
    ? 'exact'
    : 'none'
  if (!result.items.length && filters.query) {
    // One deterministic replan: widen the topic only. Never silently relax a
    // lane, region, delivery format, record type or publication boundary.
    steps.push('broaden-topic')
    const broader = await search({ ...filters, query: '' })
    if (broader.items.length) {
      result = broader
      match = 'broader'
    }
  }
  const answered = [...completed]
  const followUp = nextQuestion(filters, answered, result.items.length > 0)
  steps.push(followUp ? 'ask' : 'ready')
  return {
    ...result,
    filters,
    effectiveFilters: result.filters,
    completed: answered,
    userMessage,
    strategy,
    match,
    followUp,
    message:
      match === 'broader'
        ? `I couldn’t find an exact match for “${filters.query}”. Here are a few broader ideas with your other preferences kept.`
        : match === 'exact'
          ? 'Here are a few ideas to get you moving. Check each listing for details and availability.'
          : 'I couldn’t find a reviewed match for those preferences yet. Let’s try another direction.',
    execution: { modelCalls, searchCalls, steps },
  }
}
export type DiscoveryResponse = Awaited<ReturnType<typeof runDiscoveryTurn>>
