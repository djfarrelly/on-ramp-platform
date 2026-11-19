import { createFileRoute, notFound } from '@tanstack/react-router'
import { Review } from '../components/review'

export const Route = createFileRoute('/review')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  head: () => ({
    meta: [
      { title: 'Review proposals · On-Ramp' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: Review,
})
