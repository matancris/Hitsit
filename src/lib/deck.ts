import type { Card, DeckEntry, ReviewEntry } from '@/types'
import sample from '@/data/deck.sample.json'
import { useDecisions } from '@/store/decisions'

/**
 * Loads the deck built by scripts/build-deck.ts, falling back to the bundled
 * fixture so the game is playable before the builder has ever run.
 *
 * The fixture's URIs are placeholders — it exercises the UI and the rules, but
 * it cannot play audio. Only the built deck carries real Spotify URIs.
 */

// Globs rather than direct imports: neither file exists until the builder has
// run, and a glob over a missing file is empty instead of a build error.
const builtDeck = import.meta.glob<{ default: DeckEntry[] }>('../data/deck.json')
const builtReview = import.meta.glob<{ default: ReviewEntry[] }>('../data/review.json')

async function load<T>(glob: Record<string, () => Promise<{ default: T[] }>>, key: string) {
  const loader = glob[key]
  if (!loader) return []
  try {
    const mod = await loader()
    return Array.isArray(mod.default) ? mod.default : []
  } catch {
    return []
  }
}

/** Every flagged track, regardless of verdict — the review screen shows all of them. */
export function loadReview(): Promise<ReviewEntry[]> {
  return load<ReviewEntry>(builtReview, '../data/review.json')
}

/** The confident deck, before any human verdicts are applied. */
export function loadBaseDeck(): Promise<DeckEntry[]> {
  return load<DeckEntry>(builtDeck, '../data/deck.json')
}

/**
 * The deck the game actually plays: confident tracks, minus anything declined,
 * plus any flagged track approved with a year.
 */
export async function loadDeck(): Promise<Card[]> {
  const [base, review] = await Promise.all([loadBaseDeck(), loadReview()])
  if (base.length === 0) return sample as DeckEntry[]

  const decisions = useDecisions.getState().byId

  const kept = base.filter((c) => decisions[c.id]?.status !== 'declined')

  const approved = review.flatMap((r) => {
    const d = decisions[r.id]
    if (d?.status !== 'approved') return []
    return [
      {
        id: r.id,
        uri: r.uri,
        title: r.title,
        artist: r.artist,
        art: r.art,
        year: d.year,
      } satisfies Card,
    ]
  })

  return [...kept, ...approved]
}

/** True when we're running on the fixture, so the UI can say so plainly. */
export function isFixture(deck: Card[]): boolean {
  return deck.length > 0 && deck[0].id.startsWith('fixture-')
}
