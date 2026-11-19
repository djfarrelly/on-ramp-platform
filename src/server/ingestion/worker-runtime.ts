import { createPublicFetcher } from './fetch'
import { createGatewayExtractor, type GatewaySettings } from './llm'
import type { IngestionPorts } from '../../services/ingestion/contracts'
import { ingestionTaggingModel } from '../tagging/ingestion-model'

export type IngestionBindings = {
  INGEST_SNAPSHOTS?: { put: (key: string, value: string) => Promise<unknown> }
  INGEST_SOURCE?: {
    create: (options: {
      id: string
      params: {
        sourceId: string
        runId: string
        mode?: 'deterministic' | 'llm'
        limit?: number
      }
    }) => Promise<{ id: string }>
  }
  INGEST_ADMIN_TOKEN?: string
  INGEST_REVIEWER_ID?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_AI_TOKEN?: string
  AI_GATEWAY_ID?: string
  AI_GATEWAY_SPEND_LIMIT_CONFIGURED?: string
  OPENAI_API_KEY?: string
  TAGGING_PROVIDER?: string
  TAGGING_MODEL?: string
  INGEST_TAGGING_MODE?: string
}
export function workerPorts(env: IngestionBindings): IngestionPorts {
  if (!env.INGEST_SNAPSHOTS)
    throw new Error('Configure the ingestion R2 snapshot binding')
  return {
    tagging: ingestionTaggingModel({
      ...env,
      INGEST_SNAPSHOTS: undefined,
      INGEST_SOURCE: undefined,
    }),
    taggingReviewerId: env.INGEST_REVIEWER_ID,
    fetchDocument: createPublicFetcher(),
    saveSnapshot: async (runId, path, value) => {
      const key = `${runId}/${path}`
      await env.INGEST_SNAPSHOTS!.put(key, JSON.stringify(value))
      return key
    },
    extractWithLlm: createGatewayExtractor({
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      gatewayId: env.AI_GATEWAY_ID,
      token: env.CLOUDFLARE_AI_TOKEN,
      spendLimitConfigured: env.AI_GATEWAY_SPEND_LIMIT_CONFIGURED,
    }),
  }
}
