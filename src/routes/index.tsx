import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { createFileRoute, Link } from '@tanstack/react-router'
import { loadHome } from '../server/directory.functions'
import { OpportunityCard, SearchBox } from '../components/directory'

export const Route = createFileRoute('/')({
  loader: () => loadHome(),
  head: () => ({ links: [{ rel: 'canonical', href: '/' }] }),
  component: Home,
})

function Home() {
  const { lanes, programs, organizations } = Route.useLoaderData()
  return (
    <>
      <section className="container hero">
        <div className="hero-copy">
          <p className="eyebrow">Michigan, moving forward</p>
          <h1>Your next step starts here.</h1>
          <p className="hero-description">
            A new career. A business idea. A skill that opens a door. Find the
            people and programs that help you move forward.
          </p>
          <SearchBox />
          <div className="suggestions">
            <span>Start somewhere:</span>
            <Link to="/directory" search={{ q: 'career' }}>
              Change careers
            </Link>
            <Link to="/directory" search={{ lane: 'entrepreneurship' }}>
              Build a business
            </Link>
            <Link to="/directory" search={{ lane: 'learning-development' }}>
              Learn something new
            </Link>
          </div>
        </div>
        <Card role="complementary" className="home-discovery">
          <p className="eyebrow">A little direction</p>
          <h2>Start with a conversation.</h2>
          <p>
            Tell us what you have in mind. We’ll help you explore a few options,
            one step at a time.
          </p>
          <Button asChild>
            <Link to="/discover">
              Find my next step <span aria-hidden="true">↗</span>
            </Link>
          </Button>
          <p className="home-discovery-note">
            No account. No saved conversation.
          </p>
        </Card>
      </section>
      <section className="lane-section" id="lanes">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">There’s more than one way forward</p>
              <h2>Find your lane.</h2>
            </div>
            <p>
              You don’t need to have it all figured out.
              <br />
              Choose a starting point and see what’s possible.
            </p>
          </div>
          <div className="lane-grid">
            {lanes.map((lane) => (
              <Link
                key={lane.slug}
                to="/lanes/$slug"
                params={{ slug: lane.slug }}
              >
                <Card className="lane-card">
                  <CardHeader>
                    <h3>{lane.name}</h3>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{lane.tagline}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="container section-pad">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Possibility, closer than you think</p>
            <h2>A few places to start.</h2>
          </div>
          <Link className="text-link" to="/directory" search={{}}>
            Explore all opportunities <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="card-grid">
          {programs.items.map((p) => (
            <OpportunityCard key={p.id} item={p} />
          ))}
        </div>
        {programs.total === 0 && (
          <p>
            The first listings are being reviewed. Check back soon for programs
            and opportunities.
          </p>
        )}
        <div className="directory-note">
          <span className="note-number">
            {organizations.total.toString().padStart(2, '0')}
          </span>
          <p>
            organizations. <strong>One place to explore.</strong>
            <br />
            Browse by lane, region, or what you want to do next.
          </p>
          <Link
            to="/directory"
            search={{ view: 'organizations' }}
            className="text-link"
          >
            Meet the organizations <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </>
  )
}
