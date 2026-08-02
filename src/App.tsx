import { useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Progress } from '@/components/Progress'
import { Timeline } from '@/components/Timeline'
import { NowPlaying } from '@/components/NowPlaying'
import { Reveal } from '@/components/Reveal'
import { useGame, TARGET } from '@/store/game'
import { usePlayer } from '@/lib/usePlayer'
import { loadDeck } from '@/lib/deck'

export default function App() {
  const {
    phase,
    timeline,
    current,
    lastResult,
    earned,
    attempts,
    streak,
    bestStreak,
    exhausted,
    startGame,
    markPlaying,
    place,
    continueGame,
  } = useGame()

  const player = usePlayer()

  // Start the track as soon as a card is drawn; the store flips to 'placing'
  // once playback is actually rolling, so gaps can't be tapped early.
  useEffect(() => {
    if (phase === 'playing' && current) {
      player.play(current.uri).then(markPlaying).catch(markPlaying)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, current?.id])

  // Stop the music the instant a card is placed — the reveal is the payoff.
  useEffect(() => {
    if (phase === 'revealing') player.pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  if (phase === 'idle') {
    return (
      <Start
        onStart={() => loadDeck().then(startGame)}
        onConnect={player.connect}
        needsAuth={player.needsAuth}
        note={player.note}
      />
    )
  }

  if (phase === 'won') {
    return (
      <Summary
        earned={earned}
        attempts={attempts}
        bestStreak={bestStreak}
        exhausted={exhausted}
        onAgain={() => loadDeck().then(startGame)}
      />
    )
  }

  const placing = phase === 'playing' || phase === 'placing'

  return (
    <main className="relative flex h-full flex-col">
      <Progress timeline={timeline} earned={earned} streak={streak} />

      <Timeline
        timeline={timeline}
        active={placing}
        highlightGap={
          lastResult && !lastResult.correct && phase !== 'placing' ? lastResult.correctIndex : null
        }
        onPlace={place}
      />

      <NowPlaying
        playing={player.playing}
        progress={player.progress}
        onToggle={player.toggle}
        onReplay={player.replay}
        disabled={!placing}
        note={player.note}
      />

      <AnimatePresence>
        {phase === 'revealing' && lastResult && (
          <Reveal result={lastResult} onContinue={continueGame} />
        )}
      </AnimatePresence>
    </main>
  )
}

function Start({
  onStart,
  onConnect,
  needsAuth,
  note,
}: {
  onStart: () => void
  onConnect: () => void
  needsAuth: boolean
  note: string | null
}) {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-8 px-8 text-center">
      <div>
        <h1 className="year text-[3.5rem] leading-none">HITSIT</h1>
        <p className="meta mt-3 normal-case">Hear the song. Put it in the right year.</p>
      </div>

      <p className="max-w-xs text-sm leading-relaxed text-muted">
        A song plays face down. Slot it into your timeline where you think it belongs. Land it right
        and you keep it — {TARGET} cards wins.
      </p>

      <div className="flex flex-col items-center gap-3">
        {needsAuth && (
          <button
            type="button"
            onClick={onConnect}
            className="rounded-full bg-[#1DB954] px-10 py-3.5 text-sm font-semibold text-ink
              transition-transform duration-150 hover:scale-[1.03] active:scale-95"
          >
            Connect Spotify
          </button>
        )}

        <button
          type="button"
          onClick={onStart}
          className={
            needsAuth
              ? 'meta underline-offset-4 normal-case hover:underline'
              : `rounded-full bg-ivory px-10 py-3.5 text-sm font-semibold text-ink
                 transition-transform duration-150 hover:scale-[1.03] active:scale-95`
          }
        >
          {needsAuth ? 'Play without sound' : 'Start practising'}
        </button>
      </div>

      {note && <p className="meta max-w-xs normal-case">{note}</p>}
    </main>
  )
}

function Summary({
  earned,
  attempts,
  bestStreak,
  exhausted,
  onAgain,
}: {
  earned: number
  attempts: number
  bestStreak: number
  exhausted: boolean
  onAgain: () => void
}) {
  const pct = attempts > 0 ? Math.round((earned / attempts) * 100) : 0
  const won = earned >= TARGET

  return (
    <main className="flex h-full flex-col items-center justify-center gap-8 px-8 text-center">
      <div>
        <div className="meta">{won ? 'Timeline complete' : 'Deck ran out'}</div>
        <div className="year mt-2 text-[5rem] text-ivory">{earned}</div>
        <div className="meta normal-case">
          {earned === 1 ? 'card placed' : 'cards placed'} in {attempts}{' '}
          {attempts === 1 ? 'try' : 'tries'}
        </div>
      </div>

      <dl className="flex gap-10">
        <div>
          <dt className="meta">Accuracy</dt>
          <dd className="year mt-1 text-2xl tabular-nums">{pct}%</dd>
        </div>
        <div>
          <dt className="meta">Best streak</dt>
          <dd className="year mt-1 text-2xl tabular-nums">{bestStreak}</dd>
        </div>
      </dl>

      {exhausted && !won && (
        <p className="meta max-w-xs normal-case">
          Every card in the deck has been drawn. Start again for a fresh shuffle.
        </p>
      )}

      <button
        type="button"
        onClick={onAgain}
        className="rounded-full bg-ivory px-10 py-3.5 text-sm font-semibold text-ink
          transition-transform duration-150 hover:scale-[1.03] active:scale-95"
      >
        Play again
      </button>
    </main>
  )
}
