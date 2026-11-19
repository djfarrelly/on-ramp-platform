import { timingSafeEqual } from 'node:crypto'
import { v7 as uuid } from 'uuid'
import { z } from 'zod'
import { ingestionInputs, sourceConfig } from '../services/ingestion/contracts'
import {
  assertStaff,
  listProposals,
  reviewProposal,
} from '../services/ingestion/review'
import {
  listSources,
  configureSource,
  getRun,
  recordTermsReview,
  recoverRun,
} from '../services/ingestion'
import { withDatabase, type Database } from '../db/client'
import type { IngestionBindings } from './ingestion/worker-runtime'
import { readJson, BodyTooLargeError } from './directory-rpc'

async function withIngestionDatabase<T>(
  run: (db: Database) => Promise<T>,
): Promise<T> {
  const { env } = await import('cloudflare:workers')
  const bindings = env as unknown as {
    HYPERDRIVE?: { connectionString: string }
  }
  if (!bindings.HYPERDRIVE)
    throw new Error('Ingestion database binding is not configured')
  return withDatabase(bindings.HYPERDRIVE.connectionString, run)
}

export async function handleIngestionRpc(
  request: Request,
  method: string,
  bindings: IngestionBindings,
  useDb: <T>(
    run: (db: Database) => Promise<T>,
  ) => Promise<T> = withIngestionDatabase,
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
  // Bootstrap staff access only. Disabled until explicitly configured; never part
  // of the public tool registry. Put Cloudflare Access in front before deployment.
  const token = bindings.INGEST_ADMIN_TOKEN
  if (!token || token.length < 32 || !bindings.INGEST_REVIEWER_ID)
    return fail('DISABLED', 'Ingestion administration is not configured.', 503)
  const provided =
    request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  const actualBytes = Buffer.from(provided)
  const expectedBytes = Buffer.from(token)
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  )
    return fail('UNAUTHORIZED', 'Staff authorization required.', 401)
  if (!Object.hasOwn(ingestionInputs, method))
    return fail('METHOD_NOT_FOUND', 'Unknown ingestion method.', 404)
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    return fail('UNSUPPORTED_MEDIA_TYPE', 'Send application/json.', 415)
  try {
    const input = await readJson(request)
    const result = await useDb(async (db) => {
      await assertStaff(db, bindings.INGEST_REVIEWER_ID!)
      switch (method) {
        case 'ingestion.listSources':
          ingestionInputs[method].parse(input)
          return listSources(db)
        case 'ingestion.configureSource': {
          const args = ingestionInputs[method].parse(input)
          return configureSource(db, args.sourceId, args.config)
        }
        case 'ingestion.recordTermsReview': {
          const args = ingestionInputs[method].parse(input)
          return recordTermsReview(db, args.sourceId, args.note)
        }
        case 'ingestion.recoverRun': {
          const args = ingestionInputs[method].parse(input)
          return recoverRun(db, args.runId)
        }
        case 'ingestion.getRun':
          return getRun(db, ingestionInputs[method].parse(input).runId)
        case 'ingestion.listProposals':
          return listProposals(
            db,
            ingestionInputs[method].parse(input).sourceId,
          )
        case 'ingestion.reviewProposal':
          return reviewProposal(
            db,
            ingestionInputs[method].parse(input),
            bindings.INGEST_REVIEWER_ID!,
          )
        case 'ingestion.runSource': {
          const args = ingestionInputs[method].parse(input)
          const source = (await listSources(db)).find(
            (row) => row.id === args.sourceId,
          )
          if (!source?.enabled || !source.termsReviewedAt)
            throw new Error(
              'Source must be enabled and have a recorded terms review',
            )
          const config = sourceConfig.parse(source.config)
          if ((args.mode ?? config.mode) === 'llm' && !config.llm)
            throw new Error(
              'Configure a source model before dispatching LLM extraction',
            )
          if (!bindings.INGEST_SOURCE || !bindings.INGEST_SNAPSHOTS)
            throw new Error(
              'Configure Workflow and R2 bindings before dispatching ingestion',
            )
          const runId = uuid()
          const instance = await bindings.INGEST_SOURCE.create({
            id: runId,
            params: { ...args, runId },
          })
          return { runId, workflowId: instance.id }
        }
      }
    })
    return reply({ result })
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      return fail('PAYLOAD_TOO_LARGE', 'Request body is too large.', 413)
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return fail('INVALID_INPUT', 'Check the ingestion method inputs.', 400)
    return fail(
      'INGESTION_FAILED',
      error instanceof Error && !('query' in error)
        ? error.message.slice(0, 500)
        : 'Ingestion operation failed.',
      409,
    )
  }
}
