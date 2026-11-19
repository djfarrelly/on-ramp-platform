import { Link } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type {
  OpportunityCardData,
  OrganizationCardData,
} from '../services/directory'

export const deliveryLabels: Record<string, string> = {
  in_person: 'In person',
  online: 'Online',
  hybrid: 'Hybrid',
  self_paced: 'Self-paced',
}

export function LaneBadges({
  lanes,
}: {
  lanes: { name: string; slug: string; isPrimary?: boolean }[]
}) {
  return (
    <div className="badges">
      {lanes.map((lane) => (
        <Badge key={lane.slug} variant="secondary">
          {lane.name}
        </Badge>
      ))}
    </div>
  )
}

export function OpportunityCard({ item }: { item: OpportunityCardData }) {
  return (
    <Card role="article" className="h-full min-w-0">
      <CardHeader>
        <LaneBadges lanes={item.lanes} />
        <p className="card-provider">{item.organizationName}</p>
        <h3>
          <Link to="/programs/$slug" params={{ slug: item.slug }}>
            {item.name}
          </Link>
        </h3>
      </CardHeader>
      <CardContent>
        <p className="card-description">{item.summary}</p>
      </CardContent>
      <CardFooter className="card-meta">
        {item.isDemo && <Badge variant="outline">Demo listing</Badge>}
        <span>
          {item.deliveryMode
            ? deliveryLabels[item.deliveryMode]
            : 'Format varies'}
        </span>
        <span>{item.costText ?? 'Contact for cost'}</span>
      </CardFooter>
    </Card>
  )
}

export function OrganizationCard({ item }: { item: OrganizationCardData }) {
  const place = item.locations.find((location) => location.city)
  return (
    <Card role="article" className="h-full min-w-0">
      <CardHeader>
        <LaneBadges lanes={item.lanes} />
        <h3>
          <Link to="/organizations/$slug" params={{ slug: item.slug }}>
            {item.name}
          </Link>
        </h3>
      </CardHeader>
      <CardContent>
        <p className="card-description">{item.summary}</p>
      </CardContent>
      <CardFooter className="card-meta">
        {item.isDemo && <Badge variant="outline">Demo listing</Badge>}
        <span>{place?.city ?? 'Across Michigan'}</span>
        <span>
          {item.tags.slice(0, 2).join(' · ') || 'Partner organization'}
        </span>
      </CardFooter>
    </Card>
  )
}

export function SearchBox({
  query = '',
  compact = false,
}: {
  query?: string
  compact?: boolean
}) {
  const id = compact ? 'directory-query' : 'home-query'
  return (
    <form action="/directory" method="get" className="search-box" role="search">
      <Label htmlFor={id} className="sr-only">
        Search programs, skills or organizations
      </Label>
      <Input
        id={id}
        name="q"
        type="search"
        maxLength={200}
        defaultValue={query}
        placeholder="Try a skill, a goal, or an organization"
      />
      <Button type="submit">Search</Button>
    </form>
  )
}
