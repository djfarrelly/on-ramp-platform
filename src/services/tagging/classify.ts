import { createHash } from 'node:crypto'
import {
  taggingOutput,
  taggingDefinitions,
  type TaggingRecord,
  type TaggingAssignment,
  type TagEvidence,
} from '../../lib/tagging-contracts'

export const normalizeEvidence = (text: string) =>
  text.replace(/\s+/g, ' ').trim()
export const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const recordFingerprint = (record: TaggingRecord) =>
  fingerprint({
    type: record.type,
    id: record.id,
    fields: record.fields,
    url: record.url,
    listingStatus: record.listingStatus,
  })
export const tagFingerprint = (ids: string[]) => fingerprint([...ids].sort())

// Each decision has a narrow positive condition and an inspectable evidence span.
// No keyword here infers free status, demographics, credential award or eligibility.
export const taggingRules: { slug: string; pattern: RegExp }[] = [
  {
    slug: 'goal-find-work',
    pattern:
      /\b(?:job search|resume (?:writing|strategies|development)|interview preparation|find a job)\b/i,
  },
  {
    slug: 'goal-change-careers',
    pattern: /\b(?:career change|career transition|change careers)\b/i,
  },
  {
    slug: 'goal-return-to-work',
    pattern:
      /\b(?:return(?:ing)? to (?:the )?workforce|career re-entry|returnship)\b/i,
  },
  {
    slug: 'goal-start-business',
    pattern:
      /\b(?:start(?:ing)? (?:a |your (?:own )?)business|launch (?:a |your )business|aspiring entrepreneurs)\b/i,
  },
  {
    slug: 'goal-grow-business',
    pattern:
      /\b(?:grow(?:ing)? (?:your |a |their )business|business growth|scaling profitably)\b/i,
  },
  {
    slug: 'goal-advance-leadership',
    pattern:
      /\b(?:leadership development|develop future leaders|leadership enrichment)\b/i,
  },
  {
    slug: 'support-training',
    pattern:
      /\b(?:this (?:training|course|workshop)|instructor-led|structured curriculum|eight.week course|8 week course)\b/i,
  },
  {
    slug: 'support-coaching',
    pattern:
      /\b(?:one-on-one (?:coaching|guidance|mentoring)|personalized (?:one-on-one guidance|business coaching)|customized (?:business )?consulting)\b/i,
  },
  {
    slug: 'support-workspace',
    pattern:
      /\b(?:prototyping services|3D printing services|coworking space|co-working and office space)\b/i,
  },
  {
    slug: 'support-community',
    pattern:
      /\b(?:build community|slack (?:group|community)|networking opportunities)\b/i,
  },
  {
    slug: 'topic-ai',
    pattern:
      /\b(?:AI (?:prompt|training|workshop|initiative)|artificial intelligence|generative AI|machine learning)\b/i,
  },
  {
    slug: 'topic-data',
    pattern:
      /\b(?:data (?:analytics|analysis|science|engineering)|business intelligence)\b/i,
  },
  {
    slug: 'topic-software-it',
    pattern:
      /\b(?:computer support|network\+ (?:training|certification)|cybersecurity|software development|supporting and troubleshooting Apple devices)\b/i,
  },
  {
    slug: 'topic-digital-workplace',
    pattern:
      /\b(?:basic computer skills|computer literacy|Microsoft Office suite|word processing workshop)\b/i,
  },
  {
    slug: 'topic-leadership-communication',
    pattern:
      /\b(?:leadership development|team development|workplace communication|leadership enrichment)\b/i,
  },
  {
    slug: 'topic-business-strategy',
    pattern:
      /\b(?:business planning|business model clarity|business plan|customer discovery)\b/i,
  },
  {
    slug: 'topic-product-commercialization',
    pattern:
      /\b(?:product development|technology commercialization|prototype new products)\b/i,
  },
  {
    slug: 'topic-finance',
    pattern:
      /\b(?:financial literacy|financial statements|budgeting (?:and|&) saving|financial projections|cash flow management)\b/i,
  },
  {
    slug: 'audience-employers',
    pattern:
      /\b(?:training for your (?:staff|employees|team)|custom(?:ized)? (?:employee|workforce) training|training needs of your organization|your new hires)\b/i,
  },
  {
    slug: 'business-stage-scaling',
    pattern:
      /\b(?:second.stage (?:businesses|companies)|growth- or scale-stage businesses)\b/i,
  },
]
export function deterministicTags(record: TaggingRecord): TaggingAssignment[] {
  const result: TaggingAssignment[] = []
  for (const rule of taggingRules) {
    for (const field of ['name', 'description', 'summary'] as const) {
      const text = normalizeEvidence(record.fields[field])
      // Titles must not confer a topic when the description explicitly negates it.
      const match = rule.pattern.exec(text)
      if (!match) continue
      const preceding = text.slice(Math.max(0, match.index - 60), match.index)
      if (
        /\b(?:not|no|without|doesn't|does not|unrelated to)\b[^.!?]*$/i.test(
          preceding,
        )
      )
        continue
      result.push({ slug: rule.slug, field, quote: match[0], basis: 'rule' })
      break
    }
  }
  return result.slice(0, 8)
}

export function validateTagEvidence(
  record: TaggingRecord,
  input: unknown,
): TagEvidence[] {
  const { assignments } = taggingOutput.parse(input)
  if (new Set(assignments.map((a) => a.slug)).size !== assignments.length)
    throw new Error('DUPLICATE_TAG')
  for (const a of assignments) {
    const text = normalizeEvidence(record.fields[a.field])
    const quote = normalizeEvidence(a.quote)
    if (!text.includes(quote)) throw new Error('UNGROUNDED_EVIDENCE')
    // Do not classify from the provider's name or another listing's context.
    if (!taggingDefinitions.some((t) => t.slug === a.slug))
      throw new Error('UNKNOWN_TAG')
  }
  return assignments.map((a) => ({ ...a, quote: normalizeEvidence(a.quote) }))
}

export function combineTags(
  record: TaggingRecord,
  model: TagEvidence[] | null,
) {
  const rules = deterministicTags(record)
  if (model === null)
    return {
      assignments: rules,
      issues: rules.length
        ? []
        : ['No narrow rule matched; review or use hybrid mode.'],
    }
  // Both methods are proposals. Agreement is useful evidence, not a confidence score.
  const validated = validateTagEvidence(record, { assignments: model })
  const ruleMap = new Map(rules.map((r) => [r.slug, r]))
  const assignments: TaggingAssignment[] = validated.map((a) =>
    ruleMap.has(a.slug) ? ruleMap.get(a.slug)! : { ...a, basis: 'model' },
  )
  const differences = rules.filter(
    (r) => !validated.some((a) => a.slug === r.slug),
  )
  return {
    assignments,
    issues: differences.map((r) => `Rule/model disagreement: ${r.slug}.`),
  }
}
