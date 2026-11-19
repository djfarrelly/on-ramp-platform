import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowUp } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { Link } from '@tanstack/react-router'
import {
  discoveryStartingChoices,
  discoveryRegionChoices,
  emptyDiscoveryFilters,
  type DiscoverySelection,
  type DiscoveryTurnInput,
  type DiscoveryFilters,
} from '../lib/discovery-contracts'
import type {
  DiscoveryResponse,
  getDiscoverySetup,
} from '../services/discovery'

type Setup = Awaited<ReturnType<typeof getDiscoverySetup>> & {
  aiConfigured: boolean
}
type Turn = { id: number; response: DiscoveryResponse }
const maxTurns = 8
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
const scrollBehavior = (): ScrollBehavior =>
  prefersReducedMotion() ? 'instant' : 'smooth'

// Start the request immediately, but give very fast responses a short loading
// beat so the indicator doesn't flash. Reset/unmount cancels this UI-only wait.
async function waitForReplyReveal(startedAt: number, signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const remaining = 360 - (performance.now() - startedAt)
  if (remaining <= 0 || prefersReducedMotion()) return
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', cancel)
      resolve()
    }
    const timer = window.setTimeout(finish, remaining)
    function cancel() {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', cancel, { once: true })
  })
}
function StartingChoices({
  disabled,
  choose,
}: {
  disabled: boolean
  choose: (selection: DiscoverySelection, label: string) => void
}) {
  return (
    <div className="move-goals" role="group" aria-label="Choose your next move">
      {discoveryStartingChoices.map((choice) => (
        <Button
          type="button"
          variant="outline"
          className="move-goal h-auto min-h-16 whitespace-normal px-3 py-3"
          key={choice.icon}
          disabled={disabled}
          onClick={() => choose(choice.selection, choice.label)}
        >
          <span>{choice.label}</span>
        </Button>
      ))}
    </div>
  )
}
export function Discovery({ setup }: { setup: Setup }) {
  const [ready, setReady] = useState(false)
  const [region, setRegion] = useState<DiscoveryFilters['region']>(null)
  const [regionOpen, setRegionOpen] = useState(true)
  const [draftRegion, setDraftRegion] =
    useState<DiscoveryFilters['region']>(null)
  // UI-only prototype value: never add ZIP to RPC, model context or persistence.
  const [zip, setZip] = useState('')
  const regionHeading = useRef<HTMLHeadingElement>(null)
  const [message, setMessage] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [dataset, setDataset] = useState<'published' | 'demo'>(
    setup.initialDataset,
  )
  const [busy, setBusy] = useState(false)
  const [pendingText, setPendingText] = useState('')
  const [error, setError] = useState(false)
  const [showDirections, setShowDirections] = useState(false)
  const active = useRef<AbortController | null>(null)
  const lastRequest = useRef<{
    input: DiscoveryTurnInput
    label: string
  } | null>(null)
  const counter = useRef(0)
  const input = useRef<HTMLTextAreaElement>(null)
  const newest = useRef<HTMLDivElement>(null)
  const pending = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const latest = turns.at(-1)?.response
  const hasConversation = turns.length > 0 || busy
  useEffect(() => {
    if (regionOpen) {
      regionHeading.current?.focus({ preventScroll: true })
      regionHeading.current?.scrollIntoView({
        block: 'start',
        behavior: scrollBehavior(),
      })
    } else input.current?.focus({ preventScroll: true })
  }, [regionOpen])
  useEffect(() => {
    setReady(true)
    return () => {
      active.current?.abort()
      active.current = null
    }
  }, [])
  useEffect(() => {
    if (turns.length) {
      newest.current?.scrollIntoView({
        block: 'end',
        behavior: scrollBehavior(),
      })
      newest.current?.focus({ preventScroll: true })
    }
  }, [turns.length, latest])
  useEffect(() => {
    if (busy)
      pending.current?.scrollIntoView({
        block: 'end',
        behavior: scrollBehavior(),
      })
  }, [busy])
  function reset(nextDataset = dataset) {
    active.current?.abort()
    active.current = null
    setBusy(false)
    setError(false)
    setMessage('')
    setTurns([])
    setShowDirections(false)
    setDataset(nextDataset)
    lastRequest.current = null
    scroller.current?.scrollTo({ top: 0 })
  }
  async function send(
    payload: DiscoveryTurnInput,
    label = payload.message ?? 'Refining my options',
  ) {
    if (active.current) return
    const controller = new AbortController()
    const startedAt = performance.now()
    active.current = controller
    lastRequest.current = { input: payload, label }
    setPendingText(label)
    setBusy(true)
    setError(false)
    const timeout = setTimeout(() => controller.abort(), 20000)
    try {
      const response = await fetch('/api/v1/discovery.respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Search unavailable')
      const data = (await response.json()) as { result: DiscoveryResponse }
      await waitForReplyReveal(startedAt, controller.signal)
      if (active.current !== controller) return
      setRegion(data.result.filters.region)
      setTurns((previous) =>
        [...previous, { id: ++counter.current, response: data.result }].slice(
          -maxTurns,
        ),
      )
      if (payload.message) setMessage('')
      setShowDirections(false)
    } catch {
      if (active.current === controller) setError(true)
    } finally {
      clearTimeout(timeout)
      if (active.current === controller) {
        setBusy(false)
        active.current = null
      }
    }
  }
  const state = {
    filters: latest?.filters ?? { ...emptyDiscoveryFilters, region },
    completed: latest?.completed ?? [],
    dataset,
  }
  function choose(selection: DiscoverySelection, label: string) {
    if (selection.type === 'region') {
      setDraftRegion(selection.value)
      setZip('')
      setRegionOpen(true)
      return
    }
    void send({ ...state, selection }, label)
  }
  function confirmRegion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draftRegion) return
    setRegion(draftRegion)
    setRegionOpen(false)
    if (!latest) {
      setError(false)
      lastRequest.current = null
    }
    if (latest && latest.filters.region !== draftRegion) {
      void send(
        { ...state, selection: { type: 'region', value: draftRegion } },
        discoveryRegionChoices.find((r) => r.value === draftRegion)!.label,
      )
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (message.trim() && !busy)
      void send({ ...state, message: message.trim() })
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }
  const disabled = !ready || busy || regionOpen
  const currentRegion = latest ? latest.filters.region : region
  const regionLabel = discoveryRegionChoices.find(
    (r) => r.value === currentRegion,
  )?.label
  return (
    <section
      className={`move-chat container ${hasConversation ? 'move-chat-active' : ''} ${regionOpen ? 'move-chat-gated' : ''}`}
      aria-label="Find your next move"
    >
      {regionOpen && (
        <Card
          role="region"
          className="move-region-panel"
          aria-labelledby="move-region-heading"
        >
          <p className="eyebrow">First, a little closer to home.</p>
          <h1 id="move-region-heading" tabIndex={-1} ref={regionHeading}>
            Where in Michigan are you looking?
          </h1>
          <p>Choose your region to find a place to start.</p>
          <form onSubmit={confirmRegion}>
            <RadioGroup
              className="grid gap-3 sm:grid-cols-2"
              aria-label="Choose your region"
              name="region"
              disabled={!ready}
              value={draftRegion ?? ''}
              onValueChange={(value) => {
                const choice = discoveryRegionChoices.find(
                  (region) => region.value === value,
                )
                if (!choice) return
                setDraftRegion(choice.value)
                if (choice.value !== 'Southeast') setZip('')
              }}
            >
              {discoveryRegionChoices.map((choice) => (
                <div className="flex items-center gap-3" key={choice.value}>
                  <RadioGroupItem
                    id={`region-${choice.value}`}
                    value={choice.value}
                  />
                  <Label
                    className="min-h-10 flex-1"
                    htmlFor={`region-${choice.value}`}
                  >
                    {choice.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {draftRegion === 'Southeast' && (
              <div className="move-region-zip">
                <Label htmlFor="move-region-zip">
                  ZIP code <span>(optional)</span>
                </Label>
                <Input
                  id="move-region-zip"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="[0-9]{5}"
                  maxLength={5}
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  aria-describedby="move-zip-hint"
                  placeholder="e.g. 48201"
                />
                <p id="move-zip-hint">
                  Results use your region for now. ZIP-based matching is coming
                  later.
                </p>
              </div>
            )}
            <div className="move-region-actions">
              <Button type="submit" disabled={!ready || !draftRegion}>
                Continue
              </Button>
            </div>
          </form>
          <noscript>
            <p>
              This conversation needs JavaScript.{' '}
              <a href="/directory">Browse the directory</a> instead.
            </p>
          </noscript>
        </Card>
      )}
      <div
        className={`move-workspace ${regionOpen ? 'move-workspace-locked' : ''}`}
        inert={regionOpen}
        aria-hidden={regionOpen || undefined}
      >
        <div className="move-toolbar">
          {regionLabel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              aria-label="Change region"
              onClick={() => {
                setDraftRegion(currentRegion)
                setRegionOpen(true)
              }}
            >
              {regionLabel}
              <span aria-hidden="true"> · Change</span>
            </Button>
          )}
          {!regionLabel && !regionOpen && (
            <Button
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() => {
                setDraftRegion(null)
                setRegionOpen(true)
              }}
            >
              Choose region
            </Button>
          )}
          <Link to="/directory" search={{}} className="move-directory">
            Browse the directory
          </Link>
          <div>
            {setup.hasDemoOrganizations && (
              <Label className="move-dataset">
                <span className="sr-only">Listings</span>
                <NativeSelect
                  aria-label="Listings"
                  disabled={disabled}
                  value={dataset}
                  onChange={(e) => reset(e.target.value as typeof dataset)}
                >
                  <NativeSelectOption value="published">
                    Reviewed listings
                  </NativeSelectOption>
                  <NativeSelectOption value="demo">
                    Demo listings (fictional)
                  </NativeSelectOption>
                </NativeSelect>
              </Label>
            )}
            {hasConversation && (
              <Button
                variant="ghost"
                type="button"
                disabled={!ready}
                onClick={() => {
                  reset()
                  setRegion(null)
                  setDraftRegion(null)
                  setZip('')
                  setRegionOpen(true)
                }}
              >
                Start over
              </Button>
            )}
          </div>
        </div>
        {dataset === 'demo' && (
          <Alert role="note" className="mb-3">
            <AlertDescription>
              Demo mode · These listings are fictional.
            </AlertDescription>
          </Alert>
        )}
        <div className="move-scroll" ref={scroller}>
          {!hasConversation ? (
            <div className="move-intro">
              <p className="eyebrow">A little direction. A new possibility.</p>
              <h1>What’s your next move?</h1>
              <p>Choose a direction, or tell us what you have in mind.</p>
              <StartingChoices disabled={disabled} choose={choose} />
            </div>
          ) : (
            <>
              <div className="move-thread-heading">
                <h1>What’s your next move?</h1>
                <Button
                  variant="outline"
                  type="button"
                  disabled={disabled}
                  onClick={() => setShowDirections((value) => !value)}
                  aria-expanded={showDirections}
                >
                  Change direction
                </Button>
              </div>
              {showDirections && (
                <StartingChoices disabled={disabled} choose={choose} />
              )}
              <div
                className="move-thread"
                role="region"
                aria-label="Conversation"
              >
                {turns.map((turn, index) => {
                  const result = turn.response
                  const current = index === turns.length - 1
                  return (
                    <div
                      className={`move-turn ${current ? 'move-turn-new' : ''}`}
                      role="group"
                      key={turn.id}
                      ref={current ? newest : undefined}
                      tabIndex={current ? -1 : undefined}
                      aria-label={`Response to ${result.userMessage}`}
                    >
                      <p className="move-user">
                        <span className="sr-only">You: </span>
                        {result.userMessage}
                      </p>
                      <div className="move-answer">
                        <p className="move-speaker">on-ramp</p>
                        <h2>
                          {result.match === 'broader'
                            ? 'A few broader ideas.'
                            : result.items.length
                              ? 'A few places to start.'
                              : 'Let’s try another direction.'}
                        </h2>
                        <p className="move-answer-copy">{result.message}</p>
                        <div
                          className="move-card-grid"
                          role="group"
                          aria-label="Search results"
                        >
                          {result.items.map((item) => (
                            <Card
                              role="article"
                              className="move-card gap-3"
                              key={`${item.kind}:${item.id}`}
                            >
                              <Badge
                                variant="secondary"
                                className="move-card-kind"
                              >
                                {item.kind === 'program'
                                  ? 'Program / service'
                                  : item.kind === 'event'
                                    ? 'Upcoming event'
                                    : 'Organization'}
                                {item.isDemo && ' · Demo'}
                              </Badge>
                              <h3>
                                <a
                                  href={item.canonicalPath}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {item.name}
                                  <span className="sr-only">
                                    {' '}
                                    (opens in a new tab)
                                  </span>
                                  <span aria-hidden="true">↗</span>
                                </a>
                              </h3>
                              {item.kind !== 'organization' && (
                                <p className="move-card-provider">
                                  {item.organizationName}
                                </p>
                              )}
                              {item.summary && (
                                <p className="move-card-summary">
                                  {item.summary}
                                </p>
                              )}
                              {item.facts.length > 0 && (
                                <p className="move-card-facts">
                                  {item.facts.join(' · ')}
                                </p>
                              )}
                              {item.sourceUrl && !item.isDemo && (
                                <a
                                  className="move-card-source"
                                  href={item.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Provider website
                                  <span className="sr-only">
                                    {' '}
                                    for {item.name} (opens in a new tab)
                                  </span>{' '}
                                  <span aria-hidden="true">↗</span>
                                </a>
                              )}
                            </Card>
                          ))}
                        </div>
                        {result.followUp ? (
                          <div className="move-followup">
                            <h3>{result.followUp.question}</h3>
                            {result.followUp.hint && (
                              <p>{result.followUp.hint}</p>
                            )}
                            <div
                              className="move-choices"
                              role="group"
                              aria-label={result.followUp.question}
                            >
                              {result.followUp.choices.map((choice) => (
                                <Button
                                  variant="outline"
                                  className="h-auto min-h-9 whitespace-normal text-left"
                                  type="button"
                                  disabled={disabled || !current}
                                  key={JSON.stringify(choice.selection)}
                                  onClick={() =>
                                    choose(choice.selection, choice.label)
                                  }
                                >
                                  {choice.label}
                                </Button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="move-ready">
                            Keep exploring these options, or tell me what you’d
                            like to change.
                          </p>
                        )}
                        {result.strategy === 'fallback' && (
                          <p className="move-fallback">
                            AI-assisted search is unavailable right now. The
                            guided choices still work.
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
          {busy && (
            <div ref={pending} className="move-pending" aria-hidden="true">
              <p className="move-user">{pendingText}</p>
              <div className="move-loading">
                <p className="move-thinking">Finding a few options…</p>
                <div className="move-loading-cards">
                  {[0, 1, 2].map((card) => (
                    <Card className="move-loading-card gap-3" key={card}>
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="move-composer-wrap">
          {error && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription>
                <p>
                  Search is temporarily unavailable. Your conversation is still
                  here.
                </p>
                <Button
                  variant="outline"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (lastRequest.current)
                      void send(
                        lastRequest.current.input,
                        lastRequest.current.label,
                      )
                  }}
                >
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {latest && (
            <p className="move-preferences" aria-label="Current preferences">
              {[
                setup.lanes.find((l) => l.slug === latest.filters.lane)?.name,
                discoveryRegionChoices.find(
                  (r) => r.value === latest.filters.region,
                )?.label,
                latest.filters.deliveryMode?.replaceAll('_', ' '),
                latest.filters.kind !== 'all' ? latest.filters.kind : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Exploring Michigan'}
            </p>
          )}
          <form className="move-composer" onSubmit={submit}>
            <Label className="sr-only" htmlFor="move-message">
              Tell us your next move
            </Label>
            <Textarea
              ref={input}
              id="move-message"
              rows={2}
              maxLength={600}
              required
              value={message}
              disabled={!ready || regionOpen}
              readOnly={busy}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={keyDown}
              placeholder={
                turns.length
                  ? 'Tell me more, or ask something else…'
                  : 'Or describe your next move…'
              }
              aria-describedby="move-privacy"
            />
            <Button
              type="submit"
              disabled={disabled || !message.trim()}
              aria-label="Send message"
              size="icon"
            >
              <ArrowUp aria-hidden="true" />
            </Button>
          </form>
          <p id="move-privacy" className="move-privacy">
            No account. No saved conversation. Please leave out names and
            contact details.
          </p>
          <p role="status" className="sr-only">
            {busy
              ? 'Searching the directory…'
              : latest
                ? `${latest.items.length} ${latest.items.length === 1 ? 'option' : 'options'} found. ${latest.followUp?.question ?? 'Your options are ready.'}`
                : 'Choose a direction or type a message to start.'}
          </p>
          <noscript>
            <p>
              This conversation needs JavaScript.{' '}
              <a href="/directory">Browse the directory</a> to search without
              it.
            </p>
          </noscript>
        </div>
      </div>
    </section>
  )
}
