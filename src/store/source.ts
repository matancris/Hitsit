import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Which backend supplies the audio.
 *
 * `preview` is the default because it works for anyone with no login. `spotify`
 * plays full tracks but needs Premium and one of the five authorised accounts
 * Development Mode allows, so it is an opt-in for the owner rather than the
 * path a new player is dropped into.
 */
export type Source = 'preview' | 'spotify'

interface SourceState {
  source: Source
  setSource: (s: Source) => void
}

export const useSource = create<SourceState>()(
  persist(
    (set) => ({
      source: 'preview',
      setSource: (source) => set({ source }),
    }),
    { name: 'hitsit.source' },
  ),
)
