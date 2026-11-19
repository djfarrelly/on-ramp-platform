import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Empty, EmptyHeader } from '@/components/ui/empty'
import { Separator } from '@/components/ui/separator'
import { Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReviewDecisionInput } from '../lib/review-contracts'
import type {
  ReviewQueue,
  ReviewQueueItem,
  decideReviewProposal,
  ReviewField,
} from '../services/review'

class ReviewRpcError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}
const typeLabels = {
  organization: 'Organization',
  offering: 'Program / service',
  event: 'Event',
} as const
async function reviewRpc<T>(
  method: string,
  input: unknown,
  signal: AbortSignal,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/v1/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    })
  } catch {
    throw new Error(
      'Couldn’t reach the review service. Refresh the queue and try again.',
    )
  }
  const body = (await response.json()) as {
    result: T
    error?: { message: string }
  }
  if (!response.ok)
    throw new ReviewRpcError(
      body.error?.message ?? 'The review service is unavailable.',
      response.status,
    )
  return body.result
}

export function Review() {
  const [queue, setQueue] = useState<ReviewQueue>({ items: [] })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [type, setType] = useState('all')
  const [organizationId, setOrganizationId] = useState('all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [editing, setEditing] = useState<
    (NonNullable<ReviewField['edit']> & { label: string }) | null
  >(null)
  const [notice, setNotice] = useState<{
    text: string
    path: string | null
  } | null>(null)
  const alive = useRef(true)
  const currentRequest = useRef<AbortController | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const visible = queue.items.filter(
    (item) =>
      (type === 'all' || item.type === type) &&
      (organizationId === 'all' || item.organizationId === organizationId),
  )
  const selected =
    visible.find((item) => item.id === selectedId) ?? visible[0] ?? null
  const organizations = [
    ...new Map(
      queue.items.map((item) => [item.organizationId, item.organizationName]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]))

  async function refresh() {
    currentRequest.current?.abort()
    const controller = new AbortController()
    currentRequest.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)
    setLoading(true)
    setError(null)
    try {
      const result = await reviewRpc<ReviewQueue>(
        'review.listProposals',
        {},
        controller.signal,
      )
      if (alive.current && currentRequest.current === controller) {
        setQueue(result)
        setNeedsRefresh(false)
        setOrganizationId((previous) =>
          previous === 'all' ||
          result.items.some((item) => item.organizationId === previous)
            ? previous
            : 'all',
        )
      }
    } catch (e) {
      if (alive.current && currentRequest.current === controller) {
        setError(e instanceof Error ? e.message : 'Couldn’t load the queue.')
        setNeedsRefresh(true)
      }
    } finally {
      clearTimeout(timeout)
      if (alive.current && currentRequest.current === controller) {
        setLoading(false)
        currentRequest.current = null
      }
    }
  }
  useEffect(() => {
    alive.current = true
    void refresh()
    return () => {
      alive.current = false
      currentRequest.current?.abort()
    }
  }, [])
  useEffect(() => {
    if (selected?.id) heading.current?.focus({ preventScroll: true })
  }, [selected?.id])

  async function decide(
    item: ReviewQueueItem,
    decision: ReviewDecisionInput['decision'],
  ) {
    if (busy || loading || needsRefresh || editing) return
    const controller = new AbortController()
    currentRequest.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await reviewRpc<
        Awaited<ReturnType<typeof decideReviewProposal>>
      >(
        'review.decideProposal',
        {
          type: item.type,
          id: item.id,
          decision,
          expectedUpdatedAt: item.updatedAt,
        },
        controller.signal,
      )
      if (!alive.current) return
      setNotice({
        text: `${decision === 'approve' ? 'Published' : 'Rejected'}: ${item.name}.`,
        path: result.publishedPath,
      })
      setSelectedId(null)
      // A completed decision is never retried automatically if refreshing fails.
      await refresh()
    } catch (e) {
      if (alive.current) {
        setError(
          e instanceof Error ? e.message : 'Couldn’t confirm the decision.',
        )
        setNeedsRefresh(true)
      }
    } finally {
      clearTimeout(timeout)
      if (alive.current) setBusy(false)
    }
  }
  async function saveEdit(item: ReviewQueueItem) {
    if (!editing || busy || loading || needsRefresh) return
    const controller = new AbortController()
    currentRequest.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await reviewRpc(
        'review.editProposal',
        {
          type: item.type,
          id: item.id,
          expectedUpdatedAt: item.updatedAt,
          changes: { [editing.key]: editing.value || null },
        },
        controller.signal,
      )
      if (!alive.current) return
      setSelectedId(item.id)
      setEditing(null)
      setNotice({
        text: 'Changes saved. This listing is still awaiting approval.',
        path: null,
      })
      await refresh()
      heading.current?.focus({ preventScroll: true })
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : 'Couldn’t save this field.')
        setNeedsRefresh(!(e instanceof ReviewRpcError && e.status === 400))
      }
    } finally {
      clearTimeout(timeout)
      if (alive.current) {
        setBusy(false)
        currentRequest.current = null
      }
    }
  }
  function editButton(label: string, edit: NonNullable<ReviewField['edit']>) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Edit ${label.toLowerCase()}`}
        disabled={disabled || needsRefresh}
        onClick={() => {
          setEditing({ ...edit, label })
          setError(null)
          setNotice(null)
        }}
      >
        <Pencil aria-hidden="true" />
      </Button>
    )
  }
  function editor() {
    if (!editing || !selected) return null
    const control = {
      id: 'review-edit-value',
      value: editing.value,
      disabled: busy || loading || needsRefresh,
      autoFocus: true,
      onChange: (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) => setEditing({ ...editing, value: e.target.value }),
      'aria-describedby': editing.hint ? 'review-edit-hint' : undefined,
    }
    return (
      <form
        className="review-inline-editor"
        onSubmit={(e) => {
          e.preventDefault()
          void saveEdit(selected)
        }}
      >
        <Label htmlFor="review-edit-value">{editing.label}</Label>
        {editing.kind === 'textarea' ? (
          <Textarea {...control} rows={6} />
        ) : editing.kind === 'select' ? (
          <NativeSelect {...control}>
            <NativeSelectOption value="">Not provided</NativeSelectOption>
            {editing.options?.map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : (
          <Input
            {...control}
            type={editing.inputType ?? 'text'}
            step={editing.inputType === 'datetime-local' ? 'any' : undefined}
            required={editing.key === 'name' || editing.key === 'timezone'}
          />
        )}
        {editing.hint && (
          <p id="review-edit-hint" className="review-edit-hint">
            {editing.hint}
          </p>
        )}
        <div className="review-edit-actions">
          <Button type="submit" disabled={busy || loading || needsRefresh}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || loading}
            onClick={() => {
              setEditing(null)
              if (!needsRefresh) setError(null)
              heading.current?.focus({ preventScroll: true })
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    )
  }
  function selectParent(item: ReviewQueueItem) {
    setType('all')
    setOrganizationId(item.organizationId)
    setSelectedId(item.parentProposalId)
  }
  const disabled = loading || busy || Boolean(editing)

  return (
    <section className="container review-page">
      <div className="review-page-heading">
        <div>
          <p className="eyebrow">Local review · No sign-in</p>
          <h1>Review proposals.</h1>
          <p>
            Compare each proposal with its source. Approval publishes it to the
            directory.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => void refresh()}
        >
          Refresh queue
        </Button>
      </div>
      <div className="review-announcements">
        <p role="status">
          {busy
            ? editing
              ? 'Saving changes…'
              : 'Saving decision…'
            : loading
              ? 'Loading proposals…'
              : `${queue.items.length} pending ${queue.items.length === 1 ? 'proposal' : 'proposals'}.`}
        </p>
        {notice && (
          <Alert role="status">
            <AlertDescription>
              {notice.text}{' '}
              {notice.path && (
                <a href={notice.path} target="_blank" rel="noopener noreferrer">
                  View published listing{' '}
                  <span className="sr-only">(opens in a new tab)</span>
                  <span aria-hidden="true">↗</span>
                </a>
              )}
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              <p>{error}</p>
              {needsRefresh && (
                <p>
                  {editing
                    ? 'Cancel editing, then refresh the queue before continuing.'
                    : 'Refresh the queue before making another decision.'}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
      <fieldset className="review-filters" disabled={disabled}>
        <legend className="sr-only">Filter proposals</legend>
        <Label htmlFor="review-type">Type</Label>
        <NativeSelect
          id="review-type"
          value={type}
          onChange={(e) => {
            setType(e.target.value)
            setSelectedId(null)
          }}
        >
          <NativeSelectOption value="all">All types</NativeSelectOption>
          <NativeSelectOption value="organization">
            Organizations
          </NativeSelectOption>
          <NativeSelectOption value="offering">
            Programs & services
          </NativeSelectOption>
          <NativeSelectOption value="event">Events</NativeSelectOption>
        </NativeSelect>
        <Label htmlFor="review-organization">Organization</Label>
        <NativeSelect
          id="review-organization"
          value={organizationId}
          onChange={(e) => {
            setOrganizationId(e.target.value)
            setSelectedId(null)
          }}
        >
          <NativeSelectOption value="all">All organizations</NativeSelectOption>
          {organizations.map(([id, name]) => (
            <NativeSelectOption value={id} key={id}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </fieldset>
      {!loading && queue.items.length === 0 && !error ? (
        <Empty>
          <EmptyHeader>
            <h2>All caught up.</h2>
            <p>
              No proposals are awaiting review. Future imports will appear here.
            </p>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="review-layout">
          <nav
            className="review-queue"
            aria-label="Pending proposals"
            tabIndex={disabled ? 0 : undefined}
          >
            {visible.map((item) => (
              <Button
                type="button"
                key={item.id}
                variant={item.id === selected?.id ? 'secondary' : 'outline'}
                disabled={disabled}
                className="h-auto min-h-16 w-full flex-col items-start gap-1 whitespace-normal py-3 text-left"
                aria-pressed={item.id === selected?.id}
                onClick={() => setSelectedId(item.id)}
              >
                <span className="review-kind">
                  {typeLabels[item.type]}
                  {item.isUpdate ? ' · Update' : ''}
                </span>
                <span className="review-item-name">{item.name}</span>
                {item.type !== 'organization' && (
                  <span className="text-xs font-normal">
                    {item.organizationName}
                  </span>
                )}
              </Button>
            ))}
            {!loading && !visible.length && (
              <p>No proposals match these filters.</p>
            )}
          </nav>
          {selected && (
            <Card
              role="article"
              className="review-detail gap-4"
              aria-labelledby="review-proposal-title"
              aria-busy={busy}
            >
              <Badge variant="secondary" className="review-kind">
                {typeLabels[selected.type]}
                {selected.isUpdate ? ' · Proposed update' : ' · New listing'}
              </Badge>
              <div className="review-title-row">
                <h2 id="review-proposal-title" tabIndex={-1} ref={heading}>
                  {selected.name}
                </h2>
                {editButton('Name', {
                  key: 'name',
                  value: selected.name,
                  kind: 'input',
                })}
              </div>
              {editing?.key === 'name' && editor()}
              {selected.type !== 'organization' && (
                <p className="review-provider">{selected.organizationName}</p>
              )}
              <div className="review-source-links">
                {selected.sourceUrl && (
                  <a
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open source website{' '}
                    <span className="sr-only">(opens in a new tab)</span>
                    <span aria-hidden="true">↗</span>
                  </a>
                )}
                {selected.currentPath && (
                  <a
                    href={selected.currentPath}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Current published listing{' '}
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </div>
              {selected.sourceName && (
                <p className="review-source-name">
                  Imported from {selected.sourceName}
                </p>
              )}
              <dl className="review-fields">
                {selected.fields.map((field) => (
                  <div key={field.label}>
                    <dt>
                      {field.label}
                      {field.edit && editButton(field.label, field.edit)}
                    </dt>
                    <dd>
                      {editing && editing.key === field.edit?.key ? (
                        editor()
                      ) : field.value ? (
                        field.href ? (
                          <a
                            href={field.href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {field.value}
                            <span className="sr-only">
                              {' '}
                              (opens in a new tab)
                            </span>
                          </a>
                        ) : (
                          field.value
                        )
                      ) : (
                        <span className="review-missing">Not provided</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              {selected.blockedReason && (
                <Alert role="note" id="review-blocked">
                  <AlertDescription>
                    <p>{selected.blockedReason}</p>
                    {selected.parentProposalId &&
                      selected.type !== 'organization' && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled}
                          onClick={() => selectParent(selected)}
                        >
                          Review organization
                        </Button>
                      )}
                  </AlertDescription>
                </Alert>
              )}
              <Separator />
              <div className="review-actions">
                <Button
                  type="button"
                  disabled={
                    disabled || needsRefresh || Boolean(selected.blockedReason)
                  }
                  aria-describedby={
                    selected.blockedReason ? 'review-blocked' : undefined
                  }
                  onClick={() => void decide(selected, 'approve')}
                >
                  Approve & publish
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled || needsRefresh}
                  onClick={() => void decide(selected, 'reject')}
                >
                  Reject proposal
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
      <noscript>
        <p>The review interface requires JavaScript.</p>
      </noscript>
    </section>
  )
}
