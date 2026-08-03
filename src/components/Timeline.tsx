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
      <div
        className="my-1 ml-9 flex h-11 items-center justify-center rounded-lg
          border border-correct bg-correct/15"
        aria-hidden
      >
        <span className="meta font-semibold text-correct">belongs here</span>
      </div>
    ) : (
      <div className="h-2.5" aria-hidden />
    )
  }

  // A dashed slot rather than a hairline: on a phone there is no hover to
  // reveal anything, so the resting state has to read as a drop target on its
  // own. The indent leaves the decade rail visible down the left.
  return (
    <button
      type="button"
      onClick={() => onPlace(index)}
      aria-label={`Place the song at position ${index + 1}`}
      className="my-1 ml-9 flex h-11 w-[calc(100%-2.25rem)] items-center justify-center gap-2
        rounded-lg border border-dashed border-ivory/30 bg-ivory/[0.04]
        transition-all duration-150
        hover:border-ivory/60 hover:bg-ivory/10
        active:scale-[0.99] active:border-ivory active:bg-ivory/20"
    >
      <span className="text-base leading-none text-ivory/60" aria-hidden>
        +
      </span>
      <span className="meta font-semibold text-ivory/75">place here</span>
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
