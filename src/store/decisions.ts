import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Human verdicts on the tracks the deck builder could not corroborate.
 *
 * These live in localStorage rather than on a server: the site is static, so
 * there is nothing to write back to from a phone. The game reads them at deck
 * load, so a decision takes effect on the very next round — and `exportOverrides`
 * produces the JSON to paste into data/year-overrides.json when you want it
 * baked into the build permanently.
 */

export type Decision =
  | { status: 'approved'; year: number }
  /** Kept out of the deck. Not deleted — declining is reversible. */
  | { status: 'declined' }

interface DecisionsState {
  byId: Record<string, Decision>
  approve: (id: string, year: number) => void
  decline: (id: string) => void
  clear: (id: string) => void
  clearAll: () => void
  /** The contents of data/year-overrides.json for every approved track. */
  exportOverrides: () => Record<string, number>
}

export const useDecisions = create<DecisionsState>()(
  persist(
    (set, get) => ({
      byId: {},

      approve: (id, year) =>
        set((s) => ({ byId: { ...s.byId, [id]: { status: 'approved', year } } })),

      decline: (id) => set((s) => ({ byId: { ...s.byId, [id]: { status: 'declined' } } })),

      clear: (id) =>
        set((s) => {
          const { [id]: _removed, ...rest } = s.byId
          return { byId: rest }
        }),

      clearAll: () => set({ byId: {} }),

      exportOverrides: () =>
        Object.fromEntries(
          Object.entries(get().byId)
            .filter(([, d]) => d.status === 'approved')
            .map(([id, d]) => [id, (d as { status: 'approved'; year: number }).year]),
        ),
    }),
    { name: 'hitsit.decisions' },
  ),
)
