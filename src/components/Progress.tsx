import { decadeHex } from '@/lib/decades'
import { TARGET } from '@/store/game'
import type { PlacedCard } from '@/types'

/**
 * Pips fill with the decade colour of the card that earned them, so the
 * header echoes the spectrum building up on the rail below.
 */
export function Progress({
  timeline,
  earned,
  streak,
}: {
  timeline: PlacedCard[]
  earned: number
  streak: number
}) {
  const earnedCards = timeline.filter((c) => !c.seeded)

  return (
    <header className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
      <div className="flex flex-1 items-center gap-[5px]" aria-hidden>
        {Array.from({ length: TARGET }, (_, i) => {
          const card = earnedCards[i]
          return (
            <span
              key={i}
              className="h-1.5 flex-1 rounded-full transition-colors duration-300"
              style={{ background: card ? decadeHex(card.year) : 'var(--color-edge)' }}
            />
          )
        })}
      </div>

      <div className="meta tabular-nums" aria-live="polite">
        {earned} / {TARGET}
      </div>

      {streak >= 2 && (
        <div className="meta text-correct tabular-nums">{streak}&nbsp;streak</div>
      )}
    </header>
  )
}
