import { z } from 'zod'
import {
  discoverySearchInput,
  discoveryTurnInput,
} from '../lib/discovery-contracts'
import {
  searchDiscovery,
  respondToDiscovery,
  type IntentInterpreter,
} from '../services/discovery'
import { createDiscoveryInterpreter } from './discovery/gateway'
import {
  BodyTooLargeError,
  readJson,
  withWorkerDatabase,
} from './directory-rpc'

export async function workerDiscoveryInterpreter() {
  const { env } = await import('cloudflare:workers')
  const settings = env as unknown as Record<string, string | undefined>
  return createDiscoveryInterpreter({
    accountId: settings.CLOUDFLARE_ACCOUNT_ID,
    gatewayId: settings.AI_GATEWAY_ID,
    token: settings.CLOUDFLARE_AI_TOKEN,
    spendLimitConfigured: settings.AI_GATEWAY_SPEND_LIMIT_CONFIGURED,
    model: settings.DISCOVERY_MODEL,
  })
}
export async function handleDiscoveryRpc(
  request: Request,
  method: string,
  run = withWorkerDatabase,
  loadInterpreter: () => Promise<
    IntentInterpreter | undefined
  > = workerDiscoveryInterpreter,
) {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  const error = (code: string, message: string, status: number) =>
    reply({ error: { code, message } }, status)
  if (!['discovery.search', 'discovery.respond'].includes(method))
    return error('METHOD_NOT_FOUND', 'Unknown method.', 404)
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  )
    return error(
      'UNSUPPORTED_MEDIA_TYPE',
      'Send an application/json body.',
      415,
    )
  // These are same-origin prototype methods. No CORS or public model API is enabled.
  const origin = request.headers.get('origin')
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    return error('FORBIDDEN', 'Use the same-origin application.', 403)
  try {
    const body = await readJson(request)
    if (method === 'discovery.search') {
      const input = discoverySearchInput.parse(body)
      return reply({ result: await run((db) => searchDiscovery(db, input)) })
    }
    const input = discoveryTurnInput.parse(body)
    const interpret =
      !input.selection && input.approach === 'automatic'
        ? await loadInterpreter()
        : undefined
    return reply({
      result: await run((db) => respondToDiscovery(db, input, interpret)),
    })
  } catch (e) {
    if (e instanceof BodyTooLargeError)
      return error('PAYLOAD_TOO_LARGE', 'Request body is too large.', 413)
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return error('INVALID_INPUT', 'Check your request and try again.', 400)
    return error(
      'UNAVAILABLE',
      'Search is temporarily unavailable. Please try again.',
      503,
    )
  }
}
