import robotsParser from 'robots-parser'
import { allowedUrl } from '../../services/ingestion/extract'
import type { Document } from '../../services/ingestion/contracts'

export const USER_AGENT =
  'OnRamp-Prototype/0.1 (manual public-program and event source review)'
async function readBounded(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) throw new Error('Empty source response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error('Source response exceeded its size limit')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(bytes)
}
export function createPublicFetcher(network: typeof fetch = fetch) {
  const robots = new Map<string, ReturnType<typeof robotsParser>>()
  const lastRequest = new Map<string, number>()
  const request = async (url: string) => {
    const host = new URL(url).hostname
    const delay = Math.max(0, 500 - (Date.now() - (lastRequest.get(host) ?? 0)))
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    lastRequest.set(host, Date.now())
    return network(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json,text/html,text/plain;q=0.9',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    })
  }
  return async (input: string, hosts: string[]): Promise<Document> => {
    let url = allowedUrl(input, input, hosts)
    for (let hop = 0; hop < 4; hop++) {
      const origin = new URL(url).origin
      if (!robots.has(origin)) {
        const robotsUrl = `${origin}/robots.txt`
        const response = await request(robotsUrl)
        if (response.status !== 404 && !response.ok)
          throw new Error('Could not verify robots.txt; source fetch stopped')
        const text =
          response.status === 404 ? '' : await readBounded(response, 256000)
        robots.set(origin, robotsParser(robotsUrl, text))
      }
      const policy = robots.get(origin)!
      if (policy.isAllowed(url, USER_AGENT) === false)
        throw new Error('robots.txt disallows this source URL')
      const crawlDelay = policy.getCrawlDelay(USER_AGENT)
      if (crawlDelay && crawlDelay > 30)
        throw new Error(
          'robots.txt requests a crawl delay longer than this manual pass supports',
        )
      if (crawlDelay) {
        const delay =
          crawlDelay * 1000 -
          (Date.now() - (lastRequest.get(new URL(url).hostname) ?? 0))
        if (delay > 0)
          await new Promise((resolve) => setTimeout(resolve, delay))
      }
      const response = await request(url)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location) throw new Error('Source redirect has no destination')
        url = allowedUrl(location, url, hosts)
        continue
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(`Source returned HTTP ${response.status}`)
      }
      const contentType = response.headers.get('content-type') ?? ''
      if (!/json|html|text\/plain/.test(contentType)) {
        await response.body?.cancel()
        throw new Error('Unsupported source content type')
      }
      return {
        url,
        body: await readBounded(response, 3000000),
        contentType,
        fetchedAt: new Date().toISOString(),
      }
    }
    throw new Error('Source redirected too many times')
  }
}
