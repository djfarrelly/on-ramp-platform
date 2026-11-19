import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createFileRoute, Link } from '@tanstack/react-router'
import { loadEvent } from '../server/events.functions'

export const Route = createFileRoute('/events/$slug')({
  loader: ({ params }) => loadEvent({ data: params }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? 'Event'} · On-Ramp` }],
    links: [
      { rel: 'canonical', href: loaderData?.canonicalPath ?? '/directory' },
    ],
  }),
  component: Event,
})
function Event() {
  const event = Route.useLoaderData()
  return (
    <section className="container detail-page">
      <Link
        to="/organizations/$slug"
        params={{ slug: event.organizationSlug }}
        className="breadcrumb"
      >
        ← {event.organizationName}
      </Link>
      <p className="eyebrow">An opportunity to connect</p>
      <h1>{event.name}</h1>
      <div className="detail-grid">
        <div>
          <h2>About this event</h2>
          <p className="prose">{event.description}</p>
          {event.url && (
            <Button asChild>
              <a href={event.url}>
                View event details <span aria-hidden="true">↗</span>
              </a>
            </Button>
          )}
        </div>
        <Card role="complementary" className="detail-aside">
          <h2>The essentials</h2>
          <dl>
            <dt>When</dt>
            <dd>
              {event.startsAt && (
                <time dateTime={event.startsAt.toISOString()}>
                  {event.startsAt.toLocaleString('en-US', {
                    timeZone: event.timezone,
                    dateStyle: 'full',
                    timeStyle: 'short',
                  })}
                </time>
              )}
              <br />
              {event.timezone}
            </dd>
            <dt>Where</dt>
            <dd>
              {event.venueText ?? event.city ?? 'See provider for location'}
            </dd>
            <dt>Cost</dt>
            <dd>{event.costText ?? 'See provider for cost'}</dd>
          </dl>
          <Alert role="note">
            <AlertDescription>
              Confirm current details and registration availability with the
              event provider.
            </AlertDescription>
          </Alert>
        </Card>
      </div>
    </section>
  )
}
