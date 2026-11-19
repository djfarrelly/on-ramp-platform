import handler from '@tanstack/react-start/server-entry'
export { IngestSourceWorkflow } from './workflows/ingest-source'

export default { fetch: handler.fetch }
