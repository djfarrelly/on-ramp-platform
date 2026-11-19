import { createFileRoute } from '@tanstack/react-router'
import { Discovery } from '../components/discovery'
import { loadDiscovery } from '../server/discovery.functions'

export const Route = createFileRoute('/discover')({
  loader: () => loadDiscovery(),
  head: () => ({
    meta: [{ title: 'Find your next step · On-Ramp' }],
    links: [{ rel: 'canonical', href: '/discover' }],
  }),
  component: () => <Discovery setup={Route.useLoaderData()} />,
})
