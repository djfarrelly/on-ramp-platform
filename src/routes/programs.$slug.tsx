import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createFileRoute, Link } from '@tanstack/react-router'
import { loadOpportunity } from '../server/directory.functions'
import { LaneBadges, deliveryLabels } from '../components/directory'

export const Route = createFileRoute('/programs/$slug')({
  loader: ({ params }) => loadOpportunity({ data: params }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? 'Program'} · On-Ramp` },
      { name: 'description', content: loaderData?.summary ?? '' },
    ],
    links: [
      { rel: 'canonical', href: loaderData?.canonicalPath ?? '/directory' },
    ],
  }),
  component: Program,
})
function Program() {
  const p = Route.useLoaderData()
  return (
    <section className="container detail-page">
      <Link to="/directory" search={{}} className="breadcrumb">
        ← Explore opportunities
      </Link>
      <LaneBadges lanes={p.lanes} />
      <p className="program-provider">
        <Link to="/organizations/$slug" params={{ slug: p.organizationSlug }}>
          {p.organizationName}
        </Link>
      </p>
      <h1>{p.name}</h1>
      <p className="hero-description">{p.summary}</p>
      <div className="detail-grid">
        <div>
          <h2>What you can expect</h2>
          <p className="prose">{p.description}</p>
          <h2 className="section-top">Who it’s for</h2>
          <p>
            {p.eligibilitySummary ??
              'Contact the organization for eligibility details.'}
          </p>
          <h2 className="section-top">Your next step</h2>
          <p>{p.accessNote ?? 'Explore the organization to learn more.'}</p>
          {!p.isDemo && p.url && (
            <p>
              <Button asChild>
                <a href={p.url}>
                  View program details <span aria-hidden="true">↗</span>
                </a>
              </Button>
            </p>
          )}
          <Button asChild>
            <Link
              to="/organizations/$slug"
              params={{ slug: p.organizationSlug }}
            >
              Meet the organization <span aria-hidden="true">↗</span>
            </Link>
          </Button>
        </div>
        <Card role="complementary" className="detail-aside">
          <p className="eyebrow">The essentials</p>
          <dl>
            <dt>Format</dt>
            <dd>
              {p.deliveryMode
                ? deliveryLabels[p.deliveryMode]
                : 'Not specified'}
            </dd>
            <dt>Cost</dt>
            <dd>{p.costText ?? 'Not specified'}</dd>
            <dt>Duration</dt>
            <dd>{p.durationText ?? 'Varies'}</dd>
            <dt>Schedule</dt>
            <dd>{p.scheduleText ?? 'Contact for dates'}</dd>
          </dl>
          {p.isDemo && (
            <Alert role="note">
              <AlertDescription>
                This is a fictional demonstration program. Applications are not
                available.
              </AlertDescription>
            </Alert>
          )}
        </Card>
      </div>
    </section>
  )
}
