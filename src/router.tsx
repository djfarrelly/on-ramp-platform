import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: () => (
      <section className="container empty" role="alert">
        <h1>The directory is temporarily unavailable.</h1>
        <p>Please try again in a moment.</p>
        <a className="button" href="/">
          Try again
        </a>
      </section>
    ),
  })
}
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
