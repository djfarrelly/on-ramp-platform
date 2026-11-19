import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { z } from 'zod'
import { createPublicFetcher } from '../src/server/ingestion/fetch'
import { createGatewayExtractor } from '../src/server/ingestion/llm'
import type {
  IngestionPorts,
  Document,
} from '../src/services/ingestion/contracts'

const snapshotDirectory = resolve(
  process.env.INGEST_SNAPSHOT_DIR ?? '.data/ingestion',
)
const safeKey = (runId: string, path: string) => {
  z.uuid().parse(runId)
  if (!/^(manifest|extracted|document-\d+)\.json$/.test(path))
    throw new Error('Invalid snapshot path')
  return join(snapshotDirectory, runId, path)
}
export async function filePorts(replayRunId?: string): Promise<IngestionPorts> {
  let documents: Document[] | null = null
  let asOf: Date | undefined
  if (replayRunId) {
    const manifest = JSON.parse(
      await readFile(safeKey(replayRunId, 'manifest.json'), 'utf8'),
    ) as { documents: string[]; asOf?: string }
    documents = []
    for (const key of manifest.documents) {
      if (!key.startsWith(`${replayRunId}/`))
        throw new Error('Snapshot manifest contains an invalid key')
      documents.push(
        JSON.parse(
          await readFile(
            safeKey(replayRunId, key.slice(replayRunId.length + 1)),
            'utf8',
          ),
        ) as Document,
      )
    }
  }
  if (documents) {
    const manifest = JSON.parse(
      await readFile(safeKey(replayRunId!, 'manifest.json'), 'utf8'),
    ) as { asOf?: string }
    const timestamp = manifest.asOf ?? documents[0]?.fetchedAt
    if (!timestamp)
      throw new Error('Replay snapshot has no reference timestamp')
    asOf = new Date(z.iso.datetime().parse(timestamp))
  }
  const publicFetch = createPublicFetcher()
  return {
    asOf,
    fetchDocument: documents
      ? async (url) => {
          const document = documents.find((doc) => doc.url === url)
          if (!document)
            throw new Error(
              'Replay snapshot does not contain the requested URL; replay never falls back to the network',
            )
          return document
        }
      : publicFetch,
    saveSnapshot: async (runId, path, value) => {
      const filename = safeKey(runId, path)
      await mkdir(join(snapshotDirectory, runId), { recursive: true })
      await writeFile(filename, JSON.stringify(value, null, 2), { mode: 0o600 })
      return `${runId}/${path}`
    },
    extractWithLlm: createGatewayExtractor({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      gatewayId: process.env.AI_GATEWAY_ID,
      token: process.env.CLOUDFLARE_AI_TOKEN,
      spendLimitConfigured: process.env.AI_GATEWAY_SPEND_LIMIT_CONFIGURED,
    }),
  }
}
