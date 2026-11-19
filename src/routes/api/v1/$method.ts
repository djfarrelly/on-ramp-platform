import { createFileRoute } from '@tanstack/react-router'
import { handleDirectoryRpc } from '../../../server/directory-rpc'

export const Route = createFileRoute('/api/v1/$method')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (params.method.startsWith('review.')) {
          const { handleReviewRpc } = await import('../../../server/review-rpc')
          return handleReviewRpc(request, params.method, import.meta.env.DEV)
        }
        if (params.method.startsWith('discovery.')) {
          const { handleDiscoveryRpc } =
            await import('../../../server/discovery-rpc')
          return handleDiscoveryRpc(request, params.method)
        }
        if (params.method.startsWith('ingestion.')) {
          const { env } = await import('cloudflare:workers')
          const { handleIngestionRpc } =
            await import('../../../server/ingestion-rpc')
          return handleIngestionRpc(
            request,
            params.method,
            env as unknown as import('../../../server/ingestion/worker-runtime').IngestionBindings,
          )
        }
        return handleDirectoryRpc(request, params.method)
      },
    },
  },
})
