import { z } from 'zod'
import type { Database } from '../db/client'
import { withDatabase } from '../db/client'
import { reviewInputs } from '../lib/review-contracts'
import { localReviewerId } from '../services/ingestion/bootstrap'
import {
  ReviewAccessError,
  ReviewConflictError,
} from '../services/ingestion/review'
import {
  listReviewQueue,
  decideReviewProposal,
  editReviewProposal,
  ReviewEditError,
} from '../services/review'
import { readJson, BodyTooLargeError } from './directory-rpc'

export function localReviewAllowed(request: Request, development: boolean) {
  const url = new URL(request.url)
  return (
    development &&
    ['http:', 'https:'].includes(url.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
}
async function withReviewDatabase<T>(run: (db: Database) => Promise<T>) {
  const { env } = await import('cloudflare:workers')
  const bindings = env as unknown as {
    HYPERDRIVE?: { connectionString: string }
  }
  if (!bindings.HYPERDRIVE) throw new Error('Database unavailable')
  return withDatabase(bindings.HYPERDRIVE.connectionString, run)
}
export async function handleReviewRpc(
  request: Request,
  method: string,
  development: boolean,
  useDb = withReviewDatabase,
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
  // User-approved unauthenticated local prototype. Never enabled in production,
  // even when production requests use a localhost-shaped host header.
  if (!localReviewAllowed(request, development))
    return fail('NOT_FOUND', 'Not found.', 404)
  if (!Object.hasOwn(reviewInputs, method))
    return fail('METHOD_NOT_FOUND', 'Unknown review method.', 404)
  if (
    request.headers.get('origin') !== new URL(request.url).origin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    return fail(
      'FORBIDDEN',
      'Use the local review page on the same origin.',
      403,
    )
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  )
    return fail('UNSUPPORTED_MEDIA_TYPE', 'Send application/json.', 415)
  try {
    const body = await readJson(
      request,
      method === 'review.editProposal' ? 65536 : 16384,
    )
    if (method === 'review.listProposals') {
      reviewInputs[method].parse(body)
      return reply({
        result: await useDb((db) => listReviewQueue(db, localReviewerId)),
      })
    }
    if (method === 'review.editProposal') {
      const args = reviewInputs[method].parse(body)
      return reply({
        result: await useDb((db) =>
          editReviewProposal(db, args, localReviewerId),
        ),
      })
    }
    const args = reviewInputs['review.decideProposal'].parse(body)
    return reply({
      result: await useDb((db) =>
        decideReviewProposal(db, args, localReviewerId),
      ),
    })
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      return fail('PAYLOAD_TOO_LARGE', 'Request body is too large.', 413)
    if (error instanceof ReviewEditError)
      return fail('INVALID_INPUT', error.message, 400)
    if (error instanceof z.ZodError && method === 'review.editProposal')
      return fail(
        'INVALID_INPUT',
        `${error.issues[0].path.join('.')}: ${error.issues[0].message}`,
        400,
      )
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return fail('INVALID_INPUT', 'Check the proposal and try again.', 400)
    if (error instanceof ReviewAccessError)
      return fail(
        'NOT_CONFIGURED',
        'The local reviewer is missing or inactive. Run pnpm ingest setup to initialize the local review identity.',
        503,
      )
    if (error instanceof ReviewConflictError)
      return fail('REVIEW_CONFLICT', error.message, 409)
    return fail(
      'UNAVAILABLE',
      'The review queue is temporarily unavailable. Refresh the queue and try again.',
      503,
    )
  }
}
