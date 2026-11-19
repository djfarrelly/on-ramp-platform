import 'dotenv/config'
import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import { withDatabase } from '../src/db/client'
import { bootstrapIngestion } from '../src/services/ingestion/bootstrap'
import {
  bootstrapIngestionBatch,
  ingestionBatchSourceKeys,
} from '../src/services/ingestion/batches'
import {
  listSources,
  configureSource,
  recordTermsReview,
  getRun,
  runSource,
  recoverRun,
} from '../src/services/ingestion'
import { listProposals, reviewProposal } from '../src/services/ingestion/review'
import {
  sourceConfig,
  extractionMode,
} from '../src/services/ingestion/contracts'
import { filePorts } from './ingestion-runtime'
import { tagPendingIngestion } from '../src/services/tagging/ingestion'
import { localReviewerId } from '../src/services/ingestion/bootstrap'
import { ingestionTaggingModel } from '../src/server/tagging/ingestion-model'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    all: { type: 'boolean' },
    batch: { type: 'string' },
    source: { type: 'string' },
    mode: { type: 'string' },
    model: { type: 'string' },
    limit: { type: 'string' },
    file: { type: 'string' },
    run: { type: 'string' },
    type: { type: 'string' },
    id: { type: 'string' },
    decision: { type: 'string' },
    expected: { type: 'string' },
    'tag-proposal': { type: 'string' },
    'tag-expected': { type: 'string' },
    reviewer: { type: 'string' },
    note: { type: 'string' },
    help: { type: 'boolean' },
    retry: { type: 'boolean' },
  },
})
const help = `On-Ramp source ingestion
  pnpm ingest setup [--batch random-20-2026-11-17|southeast-20-2026-11-17]
  pnpm ingest sources
  pnpm ingest tag-pending [--retry]
  pnpm ingest terms --source KEY --note "What source terms you reviewed"
  pnpm ingest config --source KEY [--file config.json | --model provider/model]
  pnpm ingest run --all|--source KEY|--batch KEY [--mode deterministic|llm] [--limit N]
  pnpm ingest replay --run UUID [--mode deterministic|llm]
  pnpm ingest run-info --run UUID
  pnpm ingest proposals [--source KEY]
  pnpm ingest review --type organization|offering|event --id UUID --decision approve|reject --expected ISO_TIMESTAMP --reviewer STAFF_UUID [--tag-proposal UUID --tag-expected ISO_TIMESTAMP]
  pnpm ingest recover --run UUID

Runs create pending_review proposals. Review never happens automatically.
See docs/ingestion.md for setup, source configuration and AI Gateway settings.`

if (values.help || !positionals[0]) console.log(help)
else {
  try {
    if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env')
    await withDatabase(process.env.DATABASE_URL, async (db) => {
      const command = positionals[0]
      const sourceList = await listSources(db)
      const selected = values.source
        ? sourceList.find(
            (s) =>
              s.id === values.source ||
              sourceConfig.parse(s.config).key === values.source,
          )
        : undefined
      if (values.source && !selected) throw new Error('Source not found')
      const needSource = () => {
        if (!selected) throw new Error('Specify --source KEY')
        return selected
      }
      let result: unknown
      if (command === 'setup')
        result = values.batch
          ? await bootstrapIngestionBatch(db, values.batch)
          : await bootstrapIngestion(db)
      else if (command === 'sources') result = sourceList
      else if (command === 'tag-pending')
        result = await tagPendingIngestion(
          db,
          values.reviewer ?? localReviewerId,
          ingestionTaggingModel(process.env),
          undefined,
          values.retry,
        )
      else if (command === 'terms')
        result = await recordTermsReview(db, needSource().id, values.note ?? '')
      else if (command === 'config') {
        if (values.file && values.model)
          throw new Error('Use --file or --model, not both')
        result = values.file
          ? await configureSource(
              db,
              needSource().id,
              JSON.parse(await readFile(values.file, 'utf8')),
            )
          : values.model
            ? await configureSource(db, needSource().id, {
                ...sourceConfig.parse(needSource().config),
                llm: {
                  model: values.model,
                  promptVersion: 'extract-v1',
                  scope: 'body',
                },
              })
            : needSource().config
      } else if (command === 'run' || command === 'replay') {
        const previous =
          command === 'replay' ? await getRun(db, values.run ?? '') : null
        if (
          [
            Boolean(values.all),
            Boolean(values.source),
            Boolean(values.batch),
          ].filter(Boolean).length > 1
        )
          throw new Error('Choose exactly one of --all, --source or --batch')
        const batchKeys = values.batch
          ? ingestionBatchSourceKeys(values.batch)
          : null
        const targets = previous
          ? sourceList.filter((s) => s.id === previous.sourceId)
          : batchKeys
            ? sourceList.filter(
                (s) =>
                  s.enabled &&
                  batchKeys.includes(sourceConfig.parse(s.config).key),
              )
            : values.all
              ? sourceList.filter((s) => s.enabled)
              : [needSource()]
        if (!targets.length)
          throw new Error('No enabled sources; run ingest setup first')
        const ports = await filePorts(
          command === 'replay' ? values.run : undefined,
        )
        const results = []
        for (const target of targets) {
          try {
            const run = await runSource(
              db,
              {
                sourceId: target.id,
                mode: values.mode
                  ? extractionMode.parse(values.mode)
                  : undefined,
                limit: values.limit ? Number(values.limit) : undefined,
              },
              ports,
            )
            results.push({
              source: sourceConfig.parse(target.config).key,
              runId: run.id,
              status: run.status,
              found: run.itemsFound,
              proposed: run.itemsProposed,
              unchanged: run.itemsUnchanged,
              snapshot: run.rawSnapshotKey,
              error: run.errorMessage,
            })
            if (run.status !== 'success') process.exitCode = 1
          } catch (error) {
            results.push({
              source: sourceConfig.parse(target.config).key,
              status: 'failed',
              error: error instanceof Error ? error.message : 'Source failed',
            })
            process.exitCode = 1
          }
        }
        result = results
      } else if (command === 'run-info')
        result = await getRun(db, values.run ?? '')
      else if (command === 'proposals')
        result = await listProposals(db, selected?.id)
      else if (command === 'review')
        result = await reviewProposal(
          db,
          {
            type: values.type,
            id: values.id,
            decision: values.decision,
            expectedUpdatedAt: values.expected,
            expectedTagProposal: values['tag-proposal']
              ? {
                  id: values['tag-proposal'],
                  updatedAt: values['tag-expected'],
                }
              : undefined,
          },
          values.reviewer ?? process.env.INGEST_REVIEWER_ID ?? '',
        )
      else if (command === 'recover')
        result = await recoverRun(db, values.run ?? '')
      else throw new Error(help)
      console.log(JSON.stringify(result, null, 2))
    })
  } catch (error) {
    console.error(
      error instanceof Error && !('query' in error)
        ? error.message
        : 'Command failed; check configuration and database connectivity',
    )
    process.exitCode = 1
  }
}
