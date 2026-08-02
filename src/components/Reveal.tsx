import { motion, useReducedMotion } from 'framer-motion'
import { decadeHex, decadeLabel } from '@/lib/decades'
import type { Result } from '@/store/game'

/**
 * The flip. This is the only elaborate animation in the app — the card turns
 * over and the year lands. Everything else stays short and functional.
 */
export function Reveal({ result, onContinue }: { result: Result; onContinue: () => void }) {
  const reduce = useReducedMotion()
  const { card, correct } = result
  const hex = decadeHex(card.year)

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-ink/92 px-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        className="w-full max-w-sm [perspective:1200px]"
        initial={reduce ? false : { rotateY: -180, opacity: 0 }}
        animate={{ rotateY: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 90, damping: 16, mass: 0.9 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div
          className="relative overflow-hidden rounded-(--radius-card) bg-raised px-6 py-7 text-center"
          style={{ boxShadow: `0 0 0 1px ${hex}44, 0 18px 60px -20px ${hex}66` }}
        >
          <span className="absolute inset-x-0 top-0 h-1" style={{ background: hex }} aria-hidden />

          <div className="meta mb-3" style={{ color: hex }}>
            {decadeLabel(card.year)}
          </div>

          <div className="year text-[5.5rem]" style={{ color: hex }}>
            {card.year}
          </div>

          <div className="mt-5 text-lg leading-snug font-medium text-balance">{card.title}</div>
          <div className="meta mt-1 normal-case">{card.artist}</div>

          {card.art && (
            <img
              src={card.art}
              alt=""
              className="mx-auto mt-5 h-20 w-20 rounded-md object-cover opacity-90"
              loading="lazy"
            />
          )}
        </div>
      </motion.div>

      <motion.div
        className="flex flex-col items-center gap-4"
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 0.35 }}
      >
        <div
          className="text-sm font-semibold tracking-wide uppercase"
          style={{ color: correct ? 'var(--color-correct)' : 'var(--color-wrong)' }}
          role="status"
        >
          {correct ? 'Correct — card is yours' : 'Wrong spot — card discarded'}
        </div>

        <button
          type="button"
          onClick={onContinue}
          autoFocus
          className="rounded-full bg-ivory px-8 py-3 text-sm font-semibold text-ink
            transition-transform duration-150 hover:scale-[1.03] active:scale-95"
        >
          Next song
        </button>
      </motion.div>
    </motion.div>
  )
}
