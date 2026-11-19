import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'
import { withDatabase } from '../db/client'
import { runSource } from '../services/ingestion'
import { ingestionInputs } from '../services/ingestion/contracts'
import {
  workerPorts,
  type IngestionBindings,
} from '../server/ingestion/worker-runtime'

type Params = {
  sourceId: string
  runId: string
  mode?: 'deterministic' | 'llm'
  limit?: number
}
export class IngestSourceWorkflow extends WorkflowEntrypoint<
  IngestionBindings & { HYPERDRIVE: { connectionString: string } },
  Params
> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const input = ingestionInputs['ingestion.runSource'].parse({
      sourceId: event.payload.sourceId,
      mode: event.payload.mode,
      limit: event.payload.limit,
    })
    // Whole-pass retries are explicit: a lost process leaves an auditable running
    // lease, recovered by the operator after one hour. No hidden re-crawl loop.
    return step.do(
      'fetch-extract-propose-sample',
      {
        retries: { limit: 0, delay: '1 second', backoff: 'constant' },
        timeout: '10 minutes',
      },
      async () => {
        const result = await withDatabase(
          this.env.HYPERDRIVE.connectionString,
          (db) =>
            runSource(
              db,
              { ...input, runId: event.payload.runId },
              workerPorts(this.env),
            ),
        )
        return {
          runId: result.id,
          status: result.status,
          proposed: result.itemsProposed,
          unchanged: result.itemsUnchanged,
        }
      },
    )
  }
}
