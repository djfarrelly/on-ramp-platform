import { useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { tagGroupNames } from '@/lib/tag-presentation'
import type { TagEvidence } from '@/lib/tagging-contracts'
import type { ReviewQueueItem } from '@/services/review'
import type { TaggingQueue, RecordTagReview } from '@/services/tagging'

type DisplayTag = { slug: string; label: string; group: string }
type Proposal = TaggingQueue['items'][number]

/** Shared grouped chips for read-only tags and removable draft selections. */
function TagGroups({
  tags,
  onRemove,
  disabled,
}: {
  tags: DisplayTag[]
  onRemove?: (slug: string) => void
  disabled?: boolean
}) {
  return (
    <dl className="space-y-3">
      {[...new Set(tags.map((t) => t.group))].map((group) => (
        <div
          key={group}
          className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]"
        >
          <dt className="pt-1 text-sm font-bold">{group}</dt>
          <dd className="flex min-w-0 flex-wrap gap-2">
            {tags
              .filter((t) => t.group === group)
              .map((tag) =>
                onRemove ? (
                  <Button
                    key={tag.slug}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-auto min-h-8 max-w-full rounded-full py-1.5 whitespace-normal text-left"
                    aria-label={`Remove ${tag.label}`}
                    disabled={disabled}
                    onClick={() => onRemove(tag.slug)}
                  >
                    <span>{tag.label}</span>
                    <X className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : (
                  <Badge
                    key={tag.slug}
                    variant="secondary"
                    className="h-auto min-h-7 max-w-full px-3 py-1 whitespace-normal"
                  >
                    {tag.label}
                  </Badge>
                ),
              )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

async function rpc<T>(
  method: string,
  input: unknown,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/v1/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  })
  const body = (await response.json()) as {
    result: T
    error?: { message: string }
  }
  if (!response.ok)
    throw new Error(
      body.error?.message ??
        'Could not save tags. Close the editor and refresh before trying again.',
    )
  return body.result
}

/** Edits existing pending proposals through the same evidence-checked tagging RPCs. */
export function ReviewTags({
  item,
  disabled,
  onEditingChange,
  onRefresh,
}: {
  item: ReviewQueueItem
  disabled: boolean
  onEditingChange: (editing: boolean) => void
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [queue, setQueue] = useState<RecordTagReview | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [assignments, setAssignments] = useState<TagEvidence[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [adding, setAdding] = useState<string | null>(null)
  const [field, setField] = useState<TagEvidence['field']>('description')
  const [quote, setQuote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [notice, setNotice] = useState('')
  const request = useRef<AbortController | null>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  useEffect(
    () => () => {
      request.current?.abort()
      request.current = null
    },
    [],
  )
  useEffect(() => {
    if (!open && !disabled && restoreFocus.current) {
      editButton.current?.focus()
      restoreFocus.current = false
    }
  }, [open, disabled])

  const definitions =
    queue?.vocabulary.groups.flatMap((g) =>
      g.tags.map((tag) => ({
        ...tag,
        group: tagGroupNames[g.slug] ?? g.slug,
        category: g.slug,
      })),
    ) ?? []
  const results = definitions.filter(
    (tag) =>
      !assignments.some((a) => a.slug === tag.slug) &&
      (category === 'all' || tag.category === category) &&
      `${tag.label} ${tag.group} ${tag.definition} ${tag.searchPhrases.join(' ')}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  )
  const selectedTags = assignments
    .flatMap((a) => {
      const tag = definitions.find((t) => t.slug === a.slug)
      return tag ? [tag] : []
    })
    .sort(
      (a, b) =>
        a.group.localeCompare(b.group) || a.label.localeCompare(b.label),
    )
  const addedTag = definitions.find((t) => t.slug === adding)
  const dirty =
    proposal &&
    JSON.stringify(assignments) !==
      JSON.stringify(
        proposal.suggestions
          .filter((s) => s.selected)
          .map(({ slug, field, quote }) => ({ slug, field, quote })),
      )

  function close() {
    restoreFocus.current = true
    setOpen(false)
    setError(null)
    setAdding(null)
    onEditingChange(false)
    onRefresh()
  }
  async function start() {
    if (busy || disabled) return
    setOpen(true)
    setBusy(true)
    setProposal(null)
    setError(null)
    setNotice('')
    setNeedsRefresh(false)
    setQuery('')
    setCategory('all')
    onEditingChange(true)
    const controller = new AbortController()
    request.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const result = await rpc<RecordTagReview>(
        'tagging.openRecordReview',
        { type: item.type, id: item.id },
        controller.signal,
      )
      if (controller.signal.aborted) return
      const p = result.proposal
      setQueue(result)
      setProposal(p)
      setAssignments(
        p.suggestions
          .filter((s) => s.selected)
          .map(({ slug, field, quote }) => ({
            slug,
            field: field as TagEvidence['field'],
            quote,
          })),
      )
    } catch (e) {
      if (request.current === controller) {
        setError(
          e instanceof Error
            ? e.message
            : 'Could not load tags. Close the editor and refresh.',
        )
        setNeedsRefresh(true)
      }
    } finally {
      clearTimeout(timeout)
      if (request.current === controller) setBusy(false)
    }
  }
  async function save() {
    if (!proposal || busy || needsRefresh) return
    setBusy(true)
    setError(null)
    const controller = new AbortController()
    request.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      await rpc(
        'tagging.editProposal',
        {
          proposalId: proposal.id,
          expectedUpdatedAt: proposal.updatedAt,
          assignments,
          note: proposal.note,
        },
        controller.signal,
      )
      if (controller.signal.aborted) return
      close()
      setNotice(
        'Tags saved. Approve & publish will approve this listing and its tags together.',
      )
    } catch (e) {
      if (request.current === controller) {
        setError(
          e instanceof Error
            ? e.message
            : 'Could not confirm the save. Close the editor and refresh.',
        )
        setNeedsRefresh(true)
      }
    } finally {
      clearTimeout(timeout)
      if (request.current === controller) setBusy(false)
    }
  }
  function choose(slug: string) {
    // Re-selecting a removed suggestion retains its original evidence.
    const previous = proposal?.suggestions.find((s) => s.slug === slug)
    if (previous) {
      setAssignments([
        ...assignments,
        {
          slug,
          field: previous.field as TagEvidence['field'],
          quote: previous.quote,
        },
      ])
      return
    }
    setAdding(slug)
    setField(proposal?.record.fields.description ? 'description' : 'name')
    setQuote('')
  }
  return (
    <section
      aria-labelledby="review-tags-heading"
      className="space-y-4 rounded-lg border bg-muted/20 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="review-tags-heading" className="m-0! text-base! font-bold">
          Tags
        </h3>
        {!open && (
          <Button
            ref={editButton}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => void start()}
          >
            <Pencil aria-hidden="true" /> Edit tags
          </Button>
        )}
      </div>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {item.tags.approved.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold">Approved tags</h4>
          <TagGroups tags={item.tags.approved} />
          {open && (
            <p className="text-sm">
              Approved tags stay in place. This editor changes pending
              suggestions.
            </p>
          )}
        </div>
      ) : null}
      {!open ? (
        <>
          {item.tags.suggested.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold">
                Tags included in this review
              </h4>
              <TagGroups tags={item.tags.suggested} />
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold">
                  Tag source evidence
                </summary>
                <ul className="mt-2 space-y-2">
                  {item.tags.suggested.map((tag) => (
                    <li key={tag.slug}>
                      <strong>{tag.label}</strong>
                      <p>
                        {tag.field}: “{tag.quote}”
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
          {item.tags.status === null && (
            <p className="text-sm">
              This record hasn’t been tagged yet. Edit tags starts a rules-only
              draft.
            </p>
          )}
          {item.tags.status === 'pending_review' &&
            !item.tags.suggested.length && (
              <p className="text-sm">
                The latest tag proposal has no selected tags. Add tags or review
                the source evidence.
              </p>
            )}
          {item.tags.status === 'rejected' && (
            <p className="text-sm">
              The latest tag proposal was rejected. Edit tags starts a fresh
              draft.
            </p>
          )}
          {item.tags.stale && (
            <p className="text-sm">
              This listing changed after tagging. Edit tags starts a fresh
              rules-only draft using the current source.
            </p>
          )}
          {item.tags.issues.length > 0 && (
            <Alert role="note">
              <AlertDescription>
                <p className="font-semibold">Check these tags</p>
                <ul className="list-disc pl-4">
                  {item.tags.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <p className="text-sm">
            Review these tags with the listing. Approve & publish approves both
            together.
          </p>
        </>
      ) : (
        <div className="space-y-4">
          {error && (
            <Alert role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!proposal && busy && <p role="status">Loading tag editor…</p>}
          {proposal && (
            <>
              <div className="space-y-3">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <h4 className="font-semibold">Selected suggestions</h4>
                  <span>{assignments.length} of 8 tags</span>
                </div>
                {selectedTags.length ? (
                  <TagGroups
                    tags={selectedTags}
                    disabled={busy || needsRefresh}
                    onRemove={(slug) =>
                      setAssignments(assignments.filter((a) => a.slug !== slug))
                    }
                  />
                ) : (
                  <p className="text-sm">
                    No tags selected. Search below to add one.
                  </p>
                )}
              </div>
              <fieldset
                disabled={busy || needsRefresh}
                className="min-w-0 space-y-3 rounded-lg border bg-background p-3"
              >
                <legend className="px-1 text-sm font-semibold">
                  Add a tag
                </legend>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <div className="space-y-1.5">
                    <Label htmlFor="review-tag-search">
                      Search available tags
                    </Label>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute top-2 left-2.5 size-4"
                        aria-hidden="true"
                      />
                      <Input
                        id="review-tag-search"
                        type="search"
                        autoFocus
                        placeholder="Search by name or meaning…"
                        className="pl-8"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-controls="review-tag-results"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="review-tag-category">Category</Label>
                    <NativeSelect
                      id="review-tag-category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <NativeSelectOption value="all">
                        All categories
                      </NativeSelectOption>
                      {queue?.vocabulary.groups.map((g) => (
                        <NativeSelectOption key={g.slug} value={g.slug}>
                          {tagGroupNames[g.slug]}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                </div>
                <p role="status" className="text-xs">
                  {results.length
                    ? `${results.length} available ${results.length === 1 ? 'tag' : 'tags'}${results.length > 8 ? ' · showing the first 8; search to narrow' : ''}`
                    : 'No matching tags. Try another search or category.'}
                </p>
                <ul
                  id="review-tag-results"
                  className="max-h-64 space-y-1 overflow-y-auto"
                  aria-label="Available tags"
                >
                  {results.slice(0, 8).map((tag) => (
                    <li key={tag.slug}>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full justify-start gap-2 py-2 text-left whitespace-normal"
                        disabled={assignments.length >= 8 || !!adding}
                        aria-label={`Add ${tag.label}`}
                        onClick={() => choose(tag.slug)}
                      >
                        <Plus className="size-4" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block font-semibold">
                            {tag.label}
                          </span>
                          <span className="block text-xs font-normal">
                            {tag.group} · {tag.definition}
                          </span>
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
                {assignments.length >= 8 && (
                  <p className="text-sm">
                    Eight tags selected. Remove a tag before adding another.
                  </p>
                )}
                {addedTag && (
                  <div className="space-y-3 border-t pt-3">
                    <p className="text-sm font-semibold">
                      Source evidence for {addedTag.label}
                    </p>
                    <div className="space-y-1.5">
                      <Label htmlFor="review-tag-field">Source field</Label>
                      <NativeSelect
                        id="review-tag-field"
                        value={field}
                        onChange={(e) => {
                          setField(e.target.value as TagEvidence['field'])
                          setQuote('')
                        }}
                      >
                        {Object.entries(proposal.record.fields)
                          .filter(([, value]) => !!value)
                          .map(([key]) => (
                            <NativeSelectOption key={key} value={key}>
                              {key.charAt(0).toUpperCase() + key.slice(1)}
                            </NativeSelectOption>
                          ))}
                      </NativeSelect>
                    </div>
                    <blockquote
                      className="max-h-40 overflow-y-auto border-l-2 pl-3 text-sm whitespace-pre-wrap"
                      aria-label="Source field text"
                    >
                      {proposal.record.fields[field]}
                    </blockquote>
                    <div className="space-y-1.5">
                      <Label htmlFor="review-tag-quote">Supporting quote</Label>
                      <Textarea
                        id="review-tag-quote"
                        rows={2}
                        maxLength={800}
                        value={quote}
                        onChange={(e) => setQuote(e.target.value)}
                        aria-describedby="review-tag-quote-hint"
                      />
                      <p id="review-tag-quote-hint" className="text-xs">
                        Copy 4–800 characters from this source field that
                        support the tag.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          quote.trim().length < 4 ||
                          !proposal.record.fields[field].includes(quote.trim())
                        }
                        onClick={() => {
                          setAssignments([
                            ...assignments,
                            { slug: addedTag.slug, field, quote: quote.trim() },
                          ])
                          setAdding(null)
                          setQuery('')
                          setQuote('')
                        }}
                      >
                        Add to suggestions
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAdding(null)}
                      >
                        Cancel adding tag
                      </Button>
                    </div>
                  </div>
                )}
              </fieldset>
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold">
                  Selected tag evidence
                </summary>
                <ul className="mt-2 space-y-2">
                  {assignments.map((a) => (
                    <li key={a.slug}>
                      <strong>
                        {definitions.find((t) => t.slug === a.slug)?.label}
                      </strong>
                      <p className="text-xs">
                        {a.field}: “{a.quote}”
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
          <p className="text-xs">
            {assignments.length === 0
              ? 'Saving without tags returns this record to ingestion until tagging is completed.'
              : 'Save your tag edits, then use Approve & publish to finish reviewing this record.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!proposal || !dirty || busy || needsRefresh || !!adding}
              onClick={() => void save()}
            >
              {busy && proposal ? 'Saving…' : 'Save tag edits'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={close}
            >
              Cancel tag editing
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
