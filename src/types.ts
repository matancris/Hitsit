/** A single playable song. Built offline by scripts/build-deck.ts. */
export interface Card {
  /** Spotify track id — also the key used by data/year-overrides.json. */
  id: string
  /** spotify:track:… — what gets handed to the Web Playback SDK. */
  uri: string
  title: string
  artist: string
  /** Original release year, resolved offline. This is the answer. */
  year: number
  /** Album art URL, shown only after the reveal. */
  art?: string
}

/** How confident the deck builder was about a card's year. */
export type YearConfidence = 'confident' | 'reviewed' | 'needs-review'

export interface DeckEntry extends Card {
  confidence: YearConfidence
}

/** A track the builder could not corroborate, awaiting a human call. */
export interface ReviewEntry {
  id: string
  uri: string
  title: string
  artist: string
  art?: string
  /** The builder's best guess — not fact until approved. */
  suggested?: number
  candidates: {
    spotify?: number
    isrc?: number
    search?: number
  }
}

export type Phase =
  | 'idle'
  | 'drawing'
  | 'playing'
  | 'placing'
  | 'revealing'
  | 'resolved'
  | 'won'

/** Where a card sits once docked, plus whether it was earned or seeded. */
export interface PlacedCard extends Card {
  seeded?: boolean
}
