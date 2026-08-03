import { Fragment } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { decadeHex, decadeLabel } from '@/lib/decades'
import type { PlacedCard } from '@/types'

interface Props {
  timeline: PlacedCard[]
  /** Gaps are only tappable while a card is in play. */
  active: boolean
  /** Set after a miss, to show where the card actually belonged. */
  highlightGap?: number | null
  onPlace: (gapIndex: number) => void
}

/** The rail carries the decade gradient — the timeline's colour is its content. */
function railGradient(timeline: PlacedCard[]): string {
  if (timeline.length === 0) return 'var(--color-edge)'
  if (timeline.length === 1) return decadeHex(timeline[0].year)
  const stops = timeline
    .map((c, i) => `${decadeHex(c.year)} ${(i / (timeline.length - 1)) * 100}%`)
    .join(', ')
  return `linear-gradient(to bottom, ${stops})`
}

function Gap({
  index,
  active,
  highlighted,
  onPlace,
}: {
  index: number
  active: boolean
  highlighted: boolean
  onPlace: (i: number) => void
}) {
  if (!active) {
    return highlighted ? (
      <div className="my-0.5 flex h-10 items-center gap-3 pr-1 pl-9" aria-hidden>
        <span className="h-px flex-1 bg-correct/60" />
        <span className="meta rounded-full border border-correct bg-correct/15 px-3 py-1 font-semibold text-correct">
          belongs here
        </span>
        <span className="h-px w-4 bg-correct/60" />
      </div>
    ) : (
      <div className="h-2.5" aria-hidden />
    )
  }

  // A quiet separator carrying a pill: the line keeps the timeline reading as
  // one continuous run, while the pill gives the tap target an obvious edge.
  // Both stay legible at rest — on a phone there is no hover to reveal them.
  return (
    <button
      type="button"
      onClick={() => onPlace(index)}
      aria-label={`Place the song at position ${index + 1}`}
      className="group my-0.5 flex h-11 w-full items-center gap-3 pr-1 pl-9"
    >
      <span className="h-px flex-1 bg-ivory/25 transition-colors duration-150 group-hover:bg-ivory/50" />
      <span
        className="meta flex items-center gap-1.5 rounded-full border border-ivory/30 bg-raised
          px-3 py-1 font-semibold text-ivory/80 transition-colors duration-150
          group-hover:border-ivory/70 group-hover:text-ivory
          group-active:bg-ivory group-active:text-ink"
      >
        <span className="text-sm leading-none" aria-hidden>
          +
        </span>
        place here
      </span>
      <span className="h-px w-4 bg-ivory/25 transition-colors duration-150 group-hover:bg-ivory/50" />
    </button>
  )
}

function CardRow({ card }: { card: PlacedCard }) {
  const hex = decadeHex(card.year)
  return (
    <article className="relative flex items-center gap-4 overflow-hidden rounded-(--radius-card) bg-raised py-3 pr-4 pl-5">
      {/* Decade-tinted edge — docks the card visually to the rail. */}
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: hex }} aria-hidden />
      <div className="year min-w-[4.5ch] text-[1.75rem]" style={{ color: hex }}>
        {card.year}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.9375rem] leading-tight font-medium">{card.title}</div>
        <div className="meta mt-0.5 truncate normal-case">{card.artist}</div>
      </div>
      <span className="meta shrink-0 opacity-50">{decadeLabel(card.year)}</span>
    </article>
  )
}

export function Timeline({ timeline, active, highlightGap = null, onPlace }: Props) {
  const reduce = useReducedMotion()

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
      <div
        className="pointer-events-none absolute top-2 bottom-4 left-[22px] w-[3px] rounded-full opacity-90"
        style={{ background: railGradient(timeline) }}
        aria-hidden
      />

      <ol className="relative flex list-none flex-col">
        {timeline.map((card, i) => (
          <Fragment key={card.id}>
            <li className="list-none">
              <Gap index={i} active={active} highlighted={highlightGap === i} onPlace={onPlace} />
            </li>
            <motion.li
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: -10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className="list-none"
            >
              <CardRow card={card} />
            </motion.li>
          </Fragment>
        ))}
        <li className="list-none">
          <Gap
            index={timeline.length}
            active={active}
            highlighted={highlightGap === timeline.length}
            onPlace={onPlace}
          />
        </li>
      </ol>
    </div>
  )
}
