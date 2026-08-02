import type { Card, DeckEntry } from '@/types'
import sample from '@/data/deck.sample.json'

/**
 * Loads the real deck built by scripts/build-deck.ts, falling back to the
 * bundled fixture so the game is playable before the builder has ever run.
 *
 * The fixture's URIs are placeholders — it exercises the UI and the rules,
 * but it cannot play audio. Only the built deck carries real Spotify URIs.
 */
// A glob rather than a direct import: deck.json does not exist until the
// builder has been run, and a glob over a missing file is simply empty
// instead of a build error.
const built = import.meta.glob<{ default: DeckEntry[] }>('../data/deck.json')

export async function loadDeck(): Promise<Card[]> {
  const load = built['../data/deck.json']
  if (load) {
    try {
      const mod = await load()
      const entries = mod.default
      if (Array.isArray(entries) && entries.length > 0) return entries
    } catch {
      // Malformed deck — fall through to the fixture rather than dying.
    }
  }
  return sample as DeckEntry[]
}

/** True when we're running on the fixture, so the UI can say so plainly. */
export function isFixture(deck: Card[]): boolean {
  return deck.length > 0 && deck[0].id.startsWith('fixture-')
}
