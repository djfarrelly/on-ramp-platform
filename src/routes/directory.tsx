import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Card } from '@/components/ui/card'
import { Empty, EmptyHeader } from '@/components/ui/empty'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination'
import {
  createFileRoute,
  Link,
  type SearchSchemaInput,
} from '@tanstack/react-router'
import { directoryPageInput } from '../lib/contracts'
import { loadDirectory } from '../server/directory.functions'
import { OpportunityCard, OrganizationCard } from '../components/directory'

export const Route = createFileRoute('/directory')({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) =>
    directoryPageInput.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => loadDirectory({ data: deps }),
  head: () => ({
    meta: [{ title: 'Explore opportunities · On-Ramp' }],
    links: [{ rel: 'canonical', href: '/directory' }],
  }),
  component: Directory,
})

function Directory() {
  const filters = Route.useSearch()
  const { lanes, programs, organizations } = Route.useLoaderData()
  const organizationsView = filters.view === 'organizations'
  const result = organizationsView ? organizations : programs
  return (
    <section className="container directory-page">
      <p className="eyebrow">A little direction goes a long way</p>
      <div className="directory-heading">
        <h1>Explore what’s next.</h1>
        <p>
          Find programs and people
          <br />
          to help you move forward.
        </p>
      </div>
      <Card className="filter-panel">
        <form
          className="grid gap-5"
          action="/directory"
          method="get"
          role="search"
        >
          <div className="filter-query">
            <Label htmlFor="q">What are you looking for?</Label>
            <div className="filter-input-row">
              <Input
                type="search"
                id="q"
                name="q"
                defaultValue={filters.q}
                maxLength={200}
                placeholder="Search skills, programs, or organizations"
              />
              <Button type="submit">
                Search <span aria-hidden="true">↗</span>
              </Button>
            </div>
          </div>
          <div className="filter-grid">
            <div>
              <Label htmlFor="lane">Lane</Label>
              <NativeSelect
                id="lane"
                name="lane"
                defaultValue={filters.lane ?? ''}
              >
                <NativeSelectOption value="">All four lanes</NativeSelectOption>
                {lanes.map((l) => (
                  <NativeSelectOption value={l.slug} key={l.slug}>
                    {l.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="region">Region</Label>
              <NativeSelect
                id="region"
                name="region"
                defaultValue={filters.region ?? ''}
              >
                <NativeSelectOption value="">
                  Anywhere in Michigan
                </NativeSelectOption>
                {[
                  'Detroit Metro',
                  'Southeast',
                  'West Michigan',
                  'Mid-Michigan',
                  'Northern Michigan',
                  'Upper Peninsula',
                ].map((r) => (
                  <NativeSelectOption key={r}>{r}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="view">Show me</Label>
              <NativeSelect name="view" id="view" defaultValue={filters.view}>
                <NativeSelectOption value="programs">
                  Programs & services
                </NativeSelectOption>
                <NativeSelectOption value="organizations">
                  Organizations
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="format">Program format</Label>
              <NativeSelect
                name="format"
                id="format"
                defaultValue={filters.format ?? ''}
                disabled={organizationsView}
              >
                <NativeSelectOption value="">Any format</NativeSelectOption>
                <NativeSelectOption value="in_person">
                  In person
                </NativeSelectOption>
                <NativeSelectOption value="online">Online</NativeSelectOption>
                <NativeSelectOption value="hybrid">Hybrid</NativeSelectOption>
                <NativeSelectOption value="self_paced">
                  Self-paced
                </NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
        </form>
      </Card>
      <div className="results-heading">
        <h2>
          {result.total}{' '}
          {organizationsView ? 'organizations' : 'programs & services'}
          <span>{filters.q ? ` for “${filters.q}”` : ' to explore'}</span>
        </h2>
        <Link
          to="/directory"
          search={{ view: filters.view }}
          className="text-link"
        >
          Clear filters
        </Link>
      </div>
      {result.total === 0 ? (
        <Empty>
          <EmptyHeader>
            <h2>A different search could open a door.</h2>
            <p>
              Try fewer filters or a broader term. You can also explore all four
              lanes.
            </p>
          </EmptyHeader>
          <Button asChild>
            <Link to="/directory" search={{}}>
              See all opportunities <span aria-hidden="true">↗</span>
            </Link>
          </Button>
        </Empty>
      ) : (
        <div className="card-grid directory-grid">
          {organizationsView
            ? organizations.items.map((item) => (
                <OrganizationCard key={item.id} item={item} />
              ))
            : programs.items.map((item) => (
                <OpportunityCard key={item.id} item={item} />
              ))}
        </div>
      )}
      <Pagination className="mt-6" aria-label="Search result pages">
        <PaginationContent>
          {filters.page > 1 && (
            <PaginationItem>
              <Button asChild variant="outline">
                <Link
                  to="/directory"
                  search={{ ...filters, page: filters.page - 1 }}
                >
                  ← Previous
                </Link>
              </Button>
            </PaginationItem>
          )}
          {result.total > 0 && (
            <PaginationItem className="px-3 text-sm text-muted-foreground">
              Page {filters.page} of {Math.ceil(result.total / 12)}
            </PaginationItem>
          )}
          {filters.page * 12 < result.total && (
            <PaginationItem>
              <Button asChild variant="outline">
                <Link
                  to="/directory"
                  search={{ ...filters, page: filters.page + 1 }}
                >
                  Next →
                </Link>
              </Button>
            </PaginationItem>
          )}
        </PaginationContent>
      </Pagination>
    </section>
  )
}
