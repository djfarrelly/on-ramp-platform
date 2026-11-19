import { z } from 'zod'
import { rpcInputs, type RpcMethod } from '../lib/contracts'
import { withDatabase, type Database } from '../db/client'
import {
  listLanes,
  searchOrganizations,
  searchOpportunities,
  getOrganization,
  getOpportunity,
  getEvent,
  DirectoryNotFoundError,
} from '../services/directory'

export const directoryMethods = {
  'lanes.list': (db: Database, _input: Record<string, never>) => listLanes(db),
  'directory.searchOrganizations': searchOrganizations,
  'directory.searchOpportunities': searchOpportunities,
  'directory.getOrganization': getOrganization,
  'directory.getOpportunity': getOpportunity,
  'directory.getEvent': getEvent,
}
export type RpcOutput<M extends RpcMethod> = Awaited<
  ReturnType<(typeof directoryMethods)[M]>
>

export async function callDirectoryMethod<M extends RpcMethod>(
  db: Database,
  method: M,
  input: unknown,
): Promise<RpcOutput<M>> {
  const args = rpcInputs[method].parse(input)
  const handler = directoryMethods[method] as (
    db: Database,
    input: typeof args,
  ) => Promise<RpcOutput<M>>
  return handler(db, args)
}

export async function withWorkerDatabase<T>(run: (db: Database) => Promise<T>) {
  const { env } = await import('cloudflare:workers')
  const bindings = env as unknown as {
    HYPERDRIVE?: { connectionString: string }
  }
  if (!bindings.HYPERDRIVE) throw new Error('Database binding missing')
  try {
    return await withDatabase(bindings.HYPERDRIVE.connectionString, run)
  } catch (error) {
    if (error instanceof DirectoryNotFoundError || !(error instanceof Error))
      throw error
    // Never serialize database queries or connection details into page responses.
    throw new Error(
      'The directory is temporarily unavailable. Please try again.',
    )
  }
}

export class BodyTooLargeError extends Error {}
export async function readJson(request: Request, maxBytes = 16384) {
  const reader = request.body?.getReader()
  if (!reader) return {}
  let size = 0
  const parts: Uint8Array[] = []
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new BodyTooLargeError()
      }
      parts.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return JSON.parse(new TextDecoder().decode(bytes) || '{}') as unknown
}

export async function handleDirectoryRpc(
  request: Request,
  method: string,
  run = withWorkerDatabase,
): Promise<Response> {
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
  if (!Object.hasOwn(rpcInputs, method))
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
  // This registry contains public, read-only directory methods only.
  try {
    const input = await readJson(request)
    const parsed = rpcInputs[method as RpcMethod].parse(input)
    const result = await run((db) =>
      callDirectoryMethod(db, method as RpcMethod, parsed),
    )
    return reply({ result })
  } catch (e) {
    if (e instanceof BodyTooLargeError)
      return error('PAYLOAD_TOO_LARGE', 'Request body is too large.', 413)
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return error(
        'INVALID_INPUT',
        'Check the method inputs and try again.',
        400,
      )
    if (e instanceof DirectoryNotFoundError)
      return error('NOT_FOUND', e.message, 404)
    return error(
      'UNAVAILABLE',
      'The directory is temporarily unavailable. Please try again.',
      503,
    )
  }
}
