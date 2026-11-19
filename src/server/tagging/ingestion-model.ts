import { createTaggingModel } from './model'
import type { TaggingPorts } from '../../lib/tagging-contracts'

export function ingestionTaggingModel(
  settings: Record<string, string | undefined>,
): TaggingPorts {
  if (
    settings.INGEST_TAGGING_MODE &&
    !['deterministic', 'hybrid'].includes(settings.INGEST_TAGGING_MODE)
  )
    throw new Error('INGEST_TAGGING_MODE must be deterministic or hybrid')
  if (settings.INGEST_TAGGING_MODE === 'deterministic') return { model: null }
  const configured =
    settings.CLOUDFLARE_ACCOUNT_ID &&
    settings.AI_GATEWAY_ID &&
    settings.CLOUDFLARE_AI_TOKEN &&
    settings.AI_GATEWAY_SPEND_LIMIT_CONFIGURED === 'true'
  if (!configured && settings.INGEST_TAGGING_MODE !== 'hybrid')
    return { model: null }
  return createTaggingModel({
    provider: settings.TAGGING_PROVIDER,
    model: settings.TAGGING_MODEL,
    openaiApiKey: settings.OPENAI_API_KEY,
    accountId: settings.CLOUDFLARE_ACCOUNT_ID,
    gatewayId: settings.AI_GATEWAY_ID,
    gatewayToken: settings.CLOUDFLARE_AI_TOKEN,
    spendLimitConfigured: settings.AI_GATEWAY_SPEND_LIMIT_CONFIGURED,
  })
}
