import { z } from 'zod'
import type { Database } from '../db/client'
import { withDatabase } from '../db/client'
import { taggingInputs, taggingVocabulary } from '../lib/tagging-contracts'
import {
  listTaggingCandidates,
  runTaggingBatch,
  getTaggingRun,
  listTaggingProposals,
  editTaggingProposal,
  decideTaggingProposal,
  openRecordTagReview,
} from '../services/tagging'
import { localReviewerId } from '../services/ingestion/bootstrap'
import {
  assertStaff,
  ReviewAccessError,
  ReviewConflictError,
} from '../services/ingestion/review'
import { localReviewAllowed } from './review-rpc'
import { readJson, BodyTooLargeError } from './directory-rpc'
import { createTaggingModel } from './tagging/model'

async function useTaggingDb<T>(run: (db: Database) => Promise<T>) {
  const { env } = await import('cloudflare:workers')
  const bindings = env as unknown as {
    HYPERDRIVE?: { connectionString: string }
  }
  if (!bindings.HYPERDRIVE) throw new Error('Database unavailable')
  return withDatabase(bindings.HYPERDRIVE.connectionString, run)
}
export async function handleTaggingRpc(
  request: Request,
  method: string,
  development: boolean,
  useDb = useTaggingDb,
) {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  const fail = (code: string, message: string, status: number) =>
    reply({ error: { code, message } }, status)
  if (!localReviewAllowed(request, development))
    return fail('NOT_FOUND', 'Not found.', 404)
  if (!Object.hasOwn(taggingInputs, method))
    return fail('METHOD_NOT_FOUND', 'Unknown tagging method.', 404)
  if (
    request.headers.get('origin') !== new URL(request.url).origin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    return fail(
      'FORBIDDEN',
      'Use the local tagging review page on the same origin.',
      403,
    )
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  )
    return fail('UNSUPPORTED_MEDIA_TYPE', 'Send application/json.', 415)
  try {
    const input = await readJson(request, 32768)
    const result = await useDb(async (db) => {
      await assertStaff(db, localReviewerId)
      switch (method) {
        case 'tagging.listVocabulary':
          taggingInputs[method].parse(input)
          return taggingVocabulary
        case 'tagging.listCandidates':
          taggingInputs[method].parse(input)
          return (await listTaggingCandidates(db)).map((r) => ({
            type: r.type,
            id: r.id,
            name: r.fields.name,
            provider: r.organizationName,
          }))
        case 'tagging.getRun':
          return getTaggingRun(db, taggingInputs[method].parse(input).runId)
        case 'tagging.listProposals':
          return listTaggingProposals(
            db,
            localReviewerId,
            taggingInputs[method].parse(input).runId,
          )
        case 'tagging.openRecordReview':
          return openRecordTagReview(
            db,
            taggingInputs[method].parse(input),
            localReviewerId,
          )
        case 'tagging.editProposal':
          return editTaggingProposal(
            db,
            taggingInputs[method].parse(input),
            localReviewerId,
          )
        case 'tagging.decideProposal':
          return decideTaggingProposal(
            db,
            taggingInputs[method].parse(input),
            localReviewerId,
          )
        case 'tagging.runBatch': {
          const args = taggingInputs[method].parse(input)
          const { env } = await import('cloudflare:workers')
          const settings = env as unknown as Record<string, string | undefined>
          return runTaggingBatch(
            db,
            args,
            createTaggingModel({
              provider: settings.TAGGING_PROVIDER,
              openaiApiKey: settings.OPENAI_API_KEY,
              accountId: settings.CLOUDFLARE_ACCOUNT_ID,
              gatewayId: settings.AI_GATEWAY_ID,
              gatewayToken: settings.CLOUDFLARE_AI_TOKEN,
              spendLimitConfigured: settings.AI_GATEWAY_SPEND_LIMIT_CONFIGURED,
              model: settings.TAGGING_MODEL,
            }),
            localReviewerId,
          )
        }
      }
    })
    return reply({ result })
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      return fail('PAYLOAD_TOO_LARGE', 'Request body is too large.', 413)
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return fail(
        'INVALID_INPUT',
        'Check the tag selection and evidence quotes.',
        400,
      )
    if (error instanceof ReviewConflictError)
      return fail('REVIEW_CONFLICT', error.message, 409)
    if (error instanceof ReviewAccessError)
      return fail(
        'NOT_CONFIGURED',
        'The local staff reviewer must be initialized with pnpm ingest setup.',
        503,
      )
    return fail(
      'UNAVAILABLE',
      'Tagging operation could not be completed. Check configuration or refresh the queue.',
      503,
    )
  }
}
