import { create } from 'zustand'
import type { Card, Phase, PlacedCard } from '@/types'
import { firstValidGap, isCorrectPlacement } from '@/lib/rules'

/** Cards you must place correctly to win, straight from the official rules. */
export const TARGET = 10

export interface Result {
  card: Card
  /** Gap the player chose. */
  chosenIndex: number
  /** Where the card actually belongs. */
  correctIndex: number
  correct: boolean
}

interface GameState {
  phase: Phase
  /** Undrawn cards, pre-shuffled. */
  draw: Card[]
  /** Always sorted ascending by year. */
  timeline: PlacedCard[]
  /** The face-down card in play. Its year must never reach the DOM. */
  current: Card | null
  lastResult: Result | null
  /** Cards correctly placed — the win condition counts these, not attempts. */
  earned: number
  attempts: number
  streak: number
  bestStreak: number
  /** Set when the deck empties before reaching TARGET. */
  exhausted: boolean

  startGame: (deck: Card[]) => void
  drawNext: () => void
  /** Called once the SDK reports the track is actually rolling. */
  markPlaying: () => void
  place: (gapIndex: number) => void
  continueGame: () => void
  reset: () => void
}

/** Fisher-Yates. A fresh order every session keeps practice honest. */
function shuffle<T>(input: readonly T[]): T[] {
  const a = [...input]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const useGame = create<GameState>((set, get) => ({
  phase: 'idle',
  draw: [],
  timeline: [],
  current: null,
  lastResult: null,
  earned: 0,
  attempts: 0,
  streak: 0,
  bestStreak: 0,
  exhausted: false,

  startGame: (deck) => {
    const shuffled = shuffle(deck)
    // Seed the timeline with one revealed card, exactly as the physical game does.
    const [seed, ...rest] = shuffled
    if (!seed) {
      set({ phase: 'idle', exhausted: true })
      return
    }
    set({
      phase: 'drawing',
      draw: rest,
      timeline: [{ ...seed, seeded: true }],
      current: null,
      lastResult: null,
      earned: 0,
      attempts: 0,
      streak: 0,
      bestStreak: 0,
      exhausted: false,
    })
    get().drawNext()
  },

  drawNext: () => {
    const { draw } = get()
    const [next, ...rest] = draw
    if (!next) {
      set({ phase: 'won', exhausted: true })
      return
    }
    set({ current: next, draw: rest, phase: 'playing', lastResult: null })
  },

  markPlaying: () => {
    if (get().phase === 'playing') set({ phase: 'placing' })
  },

  place: (gapIndex) => {
    const { current, timeline, phase } = get()
    if (!current) return
    // Guard against a double-tap landing two placements on one card.
    if (phase !== 'placing' && phase !== 'playing') return

    const correct = isCorrectPlacement(timeline, current.year, gapIndex)
    const correctIndex = firstValidGap(timeline, current.year)

    const nextTimeline = correct
      ? [...timeline.slice(0, gapIndex), { ...current }, ...timeline.slice(gapIndex)]
      : timeline

    const streak = correct ? get().streak + 1 : 0
    const earned = correct ? get().earned + 1 : get().earned

    set({
      phase: 'revealing',
      timeline: nextTimeline,
      lastResult: { card: current, chosenIndex: gapIndex, correctIndex, correct },
      earned,
      attempts: get().attempts + 1,
      streak,
      bestStreak: Math.max(get().bestStreak, streak),
    })
  },

  continueGame: () => {
    const { earned, draw } = get()
    if (earned >= TARGET) {
      set({ phase: 'won', current: null })
      return
    }
    if (draw.length === 0) {
      set({ phase: 'won', current: null, exhausted: true })
      return
    }
    get().drawNext()
  },

  reset: () => set({ phase: 'idle', current: null, lastResult: null }),
}))
