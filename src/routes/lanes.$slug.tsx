import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { laneSlug } from '../lib/contracts'
import { loadLane } from '../server/directory.functions'
import { OpportunityCard, OrganizationCard } from '../components/directory'

export const Route = createFileRoute('/lanes/$slug')({
  loader: ({ params }) => {
    const parsed = laneSlug.safeParse(params.slug)
    if (!parsed.success) throw notFound()
    return loadLane({ data: parsed.data })
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.lane.name ?? 'Lane'} · On-Ramp` }],
    links: [
      { rel: 'canonical', href: `/lanes/${loaderData?.lane.slug ?? ''}` },
    ],
  }),
  component: Lane,
})
function Lane() {
  const { lane, programs, organizations } = Route.useLoaderData()
  return (
    <section className="container section-pad">
      <Link to="/" hash="lanes" className="breadcrumb">
        ← All four lanes
      </Link>
      <Card className="lane-intro">
        <p className="eyebrow">Find your way forward</p>
        <h1>{lane.name}</h1>
        <p className="hero-description">{lane.description}</p>
        <Button asChild>
          <Link to="/directory" search={{ lane: laneSlug.parse(lane.slug) }}>
            Explore this lane <span aria-hidden="true">↗</span>
          </Link>
        </Button>
      </Card>
      <div className="section-heading">
        <h2>Programs & services</h2>
        <span>{programs.total} places to start</span>
      </div>
      <div className="card-grid">
        {programs.items.map((p) => (
          <OpportunityCard key={p.id} item={p} />
        ))}
      </div>
      <div className="section-heading section-top">
        <h2>People in your corner.</h2>
      </div>
      <div className="card-grid">
        {organizations.items.map((o) => (
          <OrganizationCard key={o.id} item={o} />
        ))}
      </div>
    </section>
  )
}
