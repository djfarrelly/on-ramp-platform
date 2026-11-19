import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader } from '@/components/ui/empty'
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import stylesheet from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'On-Ramp · Find your next step in Michigan' },
      {
        name: 'description',
        content:
          'Explore Michigan career, business, startup and learning opportunities.',
      },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
    links: [{ rel: 'stylesheet', href: stylesheet }],
  }),
  shellComponent: Document,
  component: Layout,
  notFoundComponent: () => (
    <section className="container py-12">
      <Empty>
        <EmptyHeader>
          <p className="eyebrow">A different direction</p>
          <h1>We couldn’t find that page.</h1>
          <p>
            The listing may be unavailable. Explore the directory to find
            another next step.
          </p>
        </EmptyHeader>
        <Button asChild>
          <Link to="/directory" search={{}}>
            Explore the directory <span aria-hidden="true">↗</span>
          </Link>
        </Button>
      </Empty>
    </section>
  ),
  errorComponent: () => (
    <section className="container py-12" role="alert">
      <Empty>
        <EmptyHeader>
          <p className="eyebrow">A brief pause</p>
          <h1>The directory is temporarily unavailable.</h1>
          <p>Please try again in a moment.</p>
        </EmptyHeader>
        <Button asChild>
          <a href="/">Try again</a>
        </Button>
      </Empty>
    </section>
  ),
})

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
function Layout() {
  const conversation = useRouterState({
    select: (state) => state.location.pathname === '/discover',
  })
  return (
    <div className={conversation ? 'conversation-layout' : undefined}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header container">
        <Link to="/" className="wordmark" aria-label="On-Ramp home">
          on-ramp
        </Link>
        <nav aria-label="Main navigation">
          {import.meta.env.DEV && (
            <Button asChild variant="ghost">
              <Link to="/review" activeProps={{ 'aria-current': 'page' }}>
                Review listings (Admin)
              </Link>
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link to="/discover" activeProps={{ 'aria-current': 'page' }}>
              Find my next step
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link
              to="/directory"
              search={{}}
              activeProps={{ 'aria-current': 'page' }}
            >
              Explore opportunities
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <a href="/#lanes">
              Find your lane <span aria-hidden="true">↗</span>
            </a>
          </Button>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      {!conversation && (
        <footer className="site-footer">
          <div className="container footer-grid">
            <div>
              <Link to="/" className="wordmark">
                on-ramp
              </Link>
              <p>
                A place to find your next step.
                <br />
                Built around Michigan’s possibilities.
              </p>
            </div>
            <div>
              <p className="eyebrow">Four lanes. More possibilities.</p>
              <p>
                Corporate careers · Entrepreneurship
                <br />
                Startup ecosystem · Learning & development
              </p>
              <p className="footer-note">
                An On-Ramp concept for Middle Third and MEDC.
              </p>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
