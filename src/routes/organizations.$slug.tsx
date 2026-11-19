import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createFileRoute, Link } from '@tanstack/react-router'
import { loadOrganization } from '../server/directory.functions'
import { LaneBadges, deliveryLabels } from '../components/directory'

export const Route = createFileRoute('/organizations/$slug')({
  loader: ({ params }) => loadOrganization({ data: params }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? 'Organization'} · On-Ramp` },
      { name: 'description', content: loaderData?.summary ?? '' },
    ],
    links: [
      { rel: 'canonical', href: loaderData?.canonicalPath ?? '/directory' },
    ],
  }),
  component: Organization,
})
function Organization() {
  const org = Route.useLoaderData()
  return (
    <section className="container detail-page">
      <Link
        to="/directory"
        search={{ view: 'organizations' }}
        className="breadcrumb"
      >
        ← Explore organizations
      </Link>
      <LaneBadges lanes={org.lanes} />
      <h1>{org.name}</h1>
      <p className="hero-description">{org.summary}</p>
      <div className="detail-grid">
        <div>
          <h2>About this organization</h2>
          <p className="prose">{org.description}</p>
          <h2 className="section-top">Programs & services</h2>
          <div className="program-list">
            {org.programs.length ? (
              org.programs.map((p) => (
                <Card role="article" key={p.slug}>
                  <h3>
                    <Link to="/programs/$slug" params={{ slug: p.slug }}>
                      {p.name} <span aria-hidden="true">↗</span>
                    </Link>
                  </h3>
                  <p>{p.summary}</p>
                  <div className="card-meta">
                    <span>
                      {p.deliveryMode
                        ? deliveryLabels[p.deliveryMode]
                        : 'Format varies'}
                    </span>
                    <span>{p.costText}</span>
                  </div>
                </Card>
              ))
            ) : (
              <p>
                No programs are currently listed. Explore other organizations in
                the directory.
              </p>
            )}
          </div>
          {org.events.length > 0 && (
            <>
              <h2 className="section-top">Upcoming events</h2>
              <div className="program-list">
                {org.events.map((event) => (
                  <Card role="article" key={event.slug}>
                    <h3>
                      <Link to="/events/$slug" params={{ slug: event.slug }}>
                        {event.name} <span aria-hidden="true">↗</span>
                      </Link>
                    </h3>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
        <Card role="complementary" className="detail-aside">
          <p className="eyebrow">At a glance</p>
          <h2>Where they work</h2>
          {org.locations.map((l, i) => (
            <p key={i}>
              {l.city}
              {l.region ? ` · ${l.region}` : ''}
              {l.isStatewide ? ' · Statewide' : ''}
              {l.isVirtual ? ' · Online' : ''}
            </p>
          ))}
          <h2>What they support</h2>
          <div className="tags">
            {org.tags.map((t) => (
              <Badge variant="secondary" key={t}>
                {t}
              </Badge>
            ))}
          </div>
          {org.isDemo ? (
            <Alert role="note">
              <AlertDescription>
                This is a fictional organization for exploring the prototype. No
                real services or applications are available.
              </AlertDescription>
            </Alert>
          ) : (
            org.websiteUrl && (
              <Button asChild>
                <a href={org.websiteUrl}>
                  Visit the organization <span aria-hidden="true">↗</span>
                </a>
              </Button>
            )
          )}
        </Card>
      </div>
    </section>
  )
}
