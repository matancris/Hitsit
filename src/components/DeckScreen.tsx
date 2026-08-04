import { useEffect, useMemo, useState } from 'react'
import { decadeHex } from '@/lib/decades'
import { loadBaseDeck, loadReview } from '@/lib/deck'
import { useDecisions } from '@/store/decisions'
import type { DeckEntry, ReviewEntry } from '@/types'

type Tab = 'review' | 'deck'

/**
 * The deck browser.
 *
 * Its real job is the review queue: the builder deliberately refuses to guess,
 * so 27 tracks sit outside the deck until a human rules on them. Each one shows
 * every candidate year side by side, because the disagreement between them is
 * the evidence — a 1940 recording that Spotify dates to 2012 is a reissue, while
 * a one-year gap is usually a single-versus-album date.
 */
export function DeckScreen({
  onBack,
  onPreview,
  previewing,
}: {
  onBack: () => void
  onPreview: (card: ReviewEntry) => void
  previewing: boolean
}) {
  const [deck, setDeck] = useState<DeckEntry[]>([])
  const [review, setReview] = useState<ReviewEntry[]>([])
  const [tab, setTab] = useState<Tab>('review')
  const [query, setQuery] = useState('')

  useEffect(() => {
    void loadBaseDeck().then(setDeck)
    void loadReview().then(setReview)
  }, [])

  const decisions = useDecisions((s) => s.byId)
  const pending = review.filter((r) => !decisions[r.id]).length

  useEffect(() => {
    // Nothing left to rule on — the deck list is the more useful landing tab.
    if (review.length > 0 && pending === 0) setTab('deck')
  }, [review.length, pending])

  const match = (t: string, a: string) => {
    const q = query.trim().toLowerCase()
    return !q || t.toLowerCase().includes(q) || a.toLowerCase().includes(q)
  }

  const visibleDeck = useMemo(
    () =>
      deck
        .filter((c) => match(c.title, c.artist))
        .sort((a, b) => a.year - b.year || a.title.localeCompare(b.title)),
    [deck, query],
  )

  const visibleReview = useMemo(
    () => review.filter((r) => match(r.title, r.artist)),
    [review, query],
  )

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button
          type="button"
          onClick={onBack}
          className="meta -ml-1 rounded px-1 hover:opacity-100"
          aria-label="Back"
        >
          ← back
        </button>
        <h1 className="flex-1 text-center text-sm font-semibold">Deck</h1>
        <span className="meta tabular-nums">{deck.length}</span>
      </header>

      <div className="flex gap-1 px-4 pb-3">
        <TabButton active={tab === 'review'} onClick={() => setTab('review')}>
          Needs review {pending > 0 && <Badge>{pending}</Badge>}
        </TabButton>
        <TabButton active={tab === 'deck'} onClick={() => setTab('deck')}>
          In the deck
        </TabButton>
      </div>

      <div className="px-4 pb-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or artist"
          className="w-full rounded-lg bg-raised px-3 py-2.5 text-sm outline-none
            placeholder:text-muted focus:ring-1 focus:ring-ivory/30"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {tab === 'review' ? (
          <ReviewList items={visibleReview} onPreview={onPreview} previewing={previewing} />
        ) : (
          <DeckList items={visibleDeck} />
        )}

        <ExportBar />
      </div>
    </main>
  )
}

/**
 * Decisions live in localStorage, which is per-device. This produces the JSON
 * for data/year-overrides.json so they can be committed and baked into the
 * build — after which the tracks resolve for everyone, on every device.
 */
function ExportBar() {
  const byId = useDecisions((s) => s.byId)
  const exportOverrides = useDecisions((s) => s.exportOverrides)
  const clearAll = useDecisions((s) => s.clearAll)
  const [copied, setCopied] = useState(false)

  const count = Object.keys(byId).length
  if (count === 0) return null

  const approved = Object.values(byId).filter((d) => d.status === 'approved').length

  const copy = async () => {
    const json = JSON.stringify(exportOverrides(), null, 2)
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard is blocked outside secure contexts and in some in-app
      // browsers; falling back to a prompt still lets the JSON be copied.
      window.prompt('Copy this into data/year-overrides.json', json)
    }
  }

  return (
    <div className="mt-4 rounded-(--radius-card) bg-raised p-3">
      <p className="meta normal-case">
        {count} decision{count === 1 ? '' : 's'} saved on this device, {approved} approved. Copy them
        into <code>data/year-overrides.json</code> and rebuild to make them permanent.
      </p>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={copy}
          disabled={approved === 0}
          className="rounded-full bg-ivory px-4 py-1.5 text-xs font-semibold text-ink disabled:opacity-30"
        >
          {copied ? 'Copied' : 'Copy overrides JSON'}
        </button>
        <button
          type="button"
          onClick={() => window.confirm('Reset every decision?') && clearAll()}
          className="meta rounded-full px-3 py-1.5 ring-1 ring-edge hover:bg-ivory/10"
        >
          reset
        </button>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
        active ? 'bg-raised text-ivory' : 'text-muted hover:text-ivory'
      }`}
    >
      {children}
    </button>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1.5 rounded-full bg-wrong px-1.5 py-0.5 text-[0.625rem] text-ink tabular-nums">
      {children}
    </span>
  )
}

function DeckList({ items }: { items: DeckEntry[] }) {
  // Hooks must run unconditionally, so they come before any early return.
  const decisions = useDecisions((s) => s.byId)
  const decline = useDecisions((s) => s.decline)
  const clear = useDecisions((s) => s.clear)

  if (items.length === 0) {
    return <Empty>No songs match that search.</Empty>
  }

  return (
    <ol className="flex list-none flex-col gap-1.5">
      {items.map((c) => {
        const removed = decisions[c.id]?.status === 'declined'
        return (
          <li
            key={c.id}
            className={`flex items-center gap-3 rounded-(--radius-card) bg-raised py-2.5 pr-2 pl-4
              ${removed ? 'opacity-40' : ''}`}
          >
            <span
              className="year min-w-[4ch] text-lg"
              style={{ color: decadeHex(c.year) }}
            >
              {c.year}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm leading-tight">{c.title}</div>
              <div className="meta truncate normal-case">{c.artist}</div>
            </div>
            <button
              type="button"
              onClick={() => (removed ? clear(c.id) : decline(c.id))}
              className="meta shrink-0 rounded px-2 py-1 hover:bg-ivory/10"
            >
              {removed ? 'restore' : 'remove'}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function ReviewList({
  items,
  onPreview,
  previewing,
}: {
  items: ReviewEntry[]
  onPreview: (card: ReviewEntry) => void
  previewing: boolean
}) {
  if (items.length === 0) {
    return <Empty>Nothing flagged. Every track resolved cleanly.</Empty>
  }
  return (
    <ol className="flex list-none flex-col gap-2.5">
      {items.map((r) => (
        <ReviewCard key={r.id} entry={r} onPreview={onPreview} previewing={previewing} />
      ))}
    </ol>
  )
}

function ReviewCard({
  entry,
  onPreview,
  previewing,
}: {
  entry: ReviewEntry
  onPreview: (card: ReviewEntry) => void
  previewing: boolean
}) {
  const decision = useDecisions((s) => s.byId[entry.id])
  const approve = useDecisions((s) => s.approve)
  const decline = useDecisions((s) => s.decline)
  const clear = useDecisions((s) => s.clear)

  const initial =
    decision?.status === 'approved' ? decision.year : (entry.suggested ?? entry.candidates.spotify)
  const [year, setYear] = useState<string>(initial ? String(initial) : '')

  const parsed = Number(year)
  const valid = /^\d{4}$/.test(year) && parsed >= 1900 && parsed <= new Date().getFullYear()

  const candidates = [
    ['Spotify', entry.candidates.spotify],
    ['ISRC', entry.candidates.isrc],
    ['MusicBrainz', entry.candidates.search],
  ] as const

  return (
    <li className="overflow-hidden rounded-(--radius-card) bg-raised">
      <div className="flex items-center gap-3 p-3">
        {entry.art ? (
          <img src={entry.art} alt="" className="h-11 w-11 rounded object-cover" loading="lazy" />
        ) : (
          <div className="h-11 w-11 rounded bg-edge" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm leading-tight font-medium">{entry.title}</div>
          <div className="meta truncate normal-case">{entry.artist}</div>
        </div>
        <button
          type="button"
          onClick={() => onPreview(entry)}
          disabled={previewing}
          className="meta shrink-0 rounded px-2 py-1 hover:bg-ivory/10 disabled:opacity-30"
        >
          play
        </button>
      </div>

      {/* The disagreement between sources is the evidence — show it plainly. */}
      <div className="flex flex-wrap gap-1.5 px-3 pb-3">
        {candidates.map(([label, value]) => (
          <span
            key={label}
            className={`meta rounded px-2 py-1 ${value ? 'bg-ink' : 'bg-ink/50 opacity-40'}`}
          >
            {label} {value ?? '—'}
          </span>
        ))}
      </div>

      {decision ? (
        <div className="flex items-center gap-3 border-t border-edge px-3 py-2.5">
          <span
            className="meta flex-1"
            style={{
              color:
                decision.status === 'approved' ? 'var(--color-correct)' : 'var(--color-wrong)',
            }}
          >
            {decision.status === 'approved'
              ? `approved as ${decision.year}`
              : 'declined — kept out of the deck'}
          </span>
          <button
            type="button"
            onClick={() => clear(entry.id)}
            className="meta rounded px-2 py-1 hover:bg-ivory/10"
          >
            undo
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-edge px-3 py-2.5">
          <label className="meta" htmlFor={`year-${entry.id}`}>
            year
          </label>
          <input
            id={`year-${entry.id}`}
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            placeholder="????"
            className={`year w-[5ch] rounded bg-ink px-2 py-1 text-center text-base outline-none
              focus:ring-1 focus:ring-ivory/30 ${valid ? '' : 'text-wrong'}`}
          />
          <div className="flex flex-1 justify-end gap-2">
            <button
              type="button"
              onClick={() => decline(entry.id)}
              className="meta rounded-full px-3 py-1.5 ring-1 ring-edge hover:bg-ivory/10"
            >
              decline
            </button>
            <button
              type="button"
              onClick={() => valid && approve(entry.id, parsed)}
              disabled={!valid}
              className="rounded-full bg-correct px-4 py-1.5 text-xs font-semibold text-ink
                disabled:opacity-30"
            >
              approve
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="meta py-10 text-center normal-case">{children}</p>
}
