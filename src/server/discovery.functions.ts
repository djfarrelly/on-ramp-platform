import { createServerFn } from '@tanstack/react-start'

export const loadDiscovery = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { withWorkerDatabase } = await import('./directory-rpc')
    const { getDiscoverySetup } = await import('../services/discovery')
    const { workerDiscoveryInterpreter } = await import('./discovery-rpc')
    const [setup, interpreter] = await Promise.all([
      withWorkerDatabase(getDiscoverySetup),
      workerDiscoveryInterpreter(),
    ])
    return { ...setup, aiConfigured: Boolean(interpreter) }
  },
)
