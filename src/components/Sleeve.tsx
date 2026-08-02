import { motion, useReducedMotion } from 'framer-motion'

/**
 * The face-down 7-inch. It shows nothing — no title, no artist, no year.
 * You identify the song by ear, exactly as at the table, and it keeps the
 * answer out of the DOM until the reveal.
 */
export function Sleeve({ spinning }: { spinning: boolean }) {
  const reduce = useReducedMotion()

  return (
    <div className="relative grid h-32 w-32 place-items-center">
      <motion.div
        className="absolute inset-0 rounded-full bg-[#0b0c11] ring-1 ring-edge"
        animate={spinning && !reduce ? { rotate: 360 } : { rotate: 0 }}
        transition={
          spinning && !reduce
            ? { repeat: Infinity, ease: 'linear', duration: 6 }
            : { duration: 0.2 }
        }
      >
        {/* Pressed grooves. */}
        {[0.86, 0.72, 0.58].map((s) => (
          <span
            key={s}
            className="absolute rounded-full ring-1 ring-ivory/5"
            style={{
              inset: `${((1 - s) / 2) * 100}%`,
            }}
            aria-hidden
          />
        ))}
        <span
          className="absolute inset-[30%] rounded-full"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #2b2f3d, #1a1d27)',
          }}
          aria-hidden
        />
      </motion.div>

      {/* The die-cut centre hole, pulsing while the track runs. */}
      <motion.span
        className="relative h-3.5 w-3.5 rounded-full bg-ink ring-2 ring-ivory/25"
        animate={spinning && !reduce ? { scale: [1, 1.28, 1], opacity: [0.6, 1, 0.6] } : {}}
        transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
        aria-hidden
      />

      <span className="sr-only">Face-down card. Listen, then choose a spot on your timeline.</span>
    </div>
  )
}
