import 'dotenv/config'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { withDatabase } from '../src/db/client'
import { localReviewerId } from '../src/services/ingestion/bootstrap'
import {
  listTaggingCandidates,
  runTaggingBatch,
  listTaggingProposals,
  editTaggingProposal,
  decideTaggingProposal,
} from '../src/services/tagging'
import { createTaggingModel } from '../src/server/tagging/model'

const [command, ...rest] = process.argv.slice(2)
const flag = (key: string) => {
  const i = rest.indexOf(`--${key}`)
  return i === -1 ? undefined : rest[i + 1]
}
const url = process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_URL in the ignored .env file')
const local = ['localhost', '127.0.0.1', '[::1]'].includes(
  new URL(url).hostname,
)
const direct = process.env.TAGGING_ALLOW_DIRECT_OPENAI === 'true'
if (direct && (!local || new URL(url).pathname !== '/onramp'))
  throw new Error(
    'Direct OpenAI is restricted to an explicitly authorized local prototype database',
  )
await withDatabase(url, async (db) => {
  if (command === 'candidates') {
    const rows = await listTaggingCandidates(db)
    console.log(
      JSON.stringify(
        rows.map((r) => ({
          type: r.type,
          id: r.id,
          name: r.fields.name,
          provider: r.organizationName,
        })),
        null,
        2,
      ),
    )
  } else if (command === 'run') {
    const model = createTaggingModel({
      provider: process.env.TAGGING_PROVIDER,
      openaiApiKey: process.env.OPENAI_API_KEY,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      gatewayId: process.env.AI_GATEWAY_ID,
      gatewayToken: process.env.CLOUDFLARE_AI_TOKEN,
      spendLimitConfigured: process.env.AI_GATEWAY_SPEND_LIMIT_CONFIGURED,
      model: process.env.TAGGING_MODEL,
      allowDirectOpenai: direct,
    })
    const result = await runTaggingBatch(
      db,
      {
        mode: (flag('mode') ?? 'hybrid') as 'hybrid' | 'deterministic',
        limit: Number(flag('limit') ?? 55),
        seed: flag('seed') ?? 'tagging-pilot-v1',
        reuseRunId: flag('reuse-run'),
      },
      model,
      localReviewerId,
    )
    console.log(JSON.stringify(result, null, 2))
    if (result.itemsFailed) process.exitCode = 1
  } else if (command === 'report') {
    const report = await listTaggingProposals(db, localReviewerId, flag('run'))
    const path = resolve(
      flag('output') ?? `.data/tagging/${report.activeRunId ?? 'empty'}.json`,
    )
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(report, null, 2), { mode: 0o600 })
    console.log(
      JSON.stringify({
        path,
        runId: report.activeRunId,
        records: report.items.length,
        states: report.items.reduce<Record<string, number>>(
          (a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }),
          {},
        ),
      }),
    )
  } else if (command === 'edit') {
    if (!flag('file'))
      throw new Error('Use --file for the exact edit input JSON')
    console.log(
      await editTaggingProposal(
        db,
        JSON.parse(await readFile(flag('file')!, 'utf8')),
        localReviewerId,
      ),
    )
  } else if (command === 'decide') {
    console.log(
      await decideTaggingProposal(
        db,
        {
          proposalId: flag('proposal'),
          expectedUpdatedAt: flag('expected'),
          decision: flag('decision'),
          note: flag('note') ?? '',
        },
        localReviewerId,
      ),
    )
  } else
    throw new Error(
      'Use candidates, run, report, edit or decide. See docs/tagging.md.',
    )
})
