import { Sleeve } from './Sleeve'

interface Props {
  playing: boolean
  /** 0–1. Elapsed position only — nothing here identifies the track. */
  progress: number
  /** Real length of whatever is playing: ~30s for a preview, minutes on Spotify. */
  durationMs: number
  onToggle: () => void
  onReplay: () => void
  disabled?: boolean
  note?: string | null
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Transport for the face-down card. Deliberately shows no metadata. */
export function NowPlaying({
  playing,
  progress,
  durationMs,
  onToggle,
  onReplay,
  disabled,
  note,
}: Props) {
  const elapsed = (progress * durationMs) / 1000

  return (
    <section className="flex flex-col items-center gap-5 border-t border-edge px-6 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <Sleeve spinning={playing} />

      <div className="flex w-full max-w-xs items-center gap-3">
        <span className="meta tabular-nums">{fmt(elapsed)}</span>
        <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-edge">
          <div
            className="absolute inset-y-0 left-0 bg-ivory/70 transition-[width] duration-500 ease-linear"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
        <button
          type="button"
          onClick={onReplay}
          disabled={disabled}
          className="meta transition-opacity hover:opacity-100 disabled:opacity-25"
          aria-label="Restart the song"
        >
          replay
        </button>
      </div>

      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="grid h-14 w-14 place-items-center rounded-full bg-ivory text-ink
          transition-transform duration-150 hover:scale-105 active:scale-95 disabled:opacity-30"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
            <rect x="3" y="2" width="4" height="14" rx="1" />
            <rect x="11" y="2" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
            <path d="M4 2.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 4 2.5Z" />
          </svg>
        )}
      </button>

      {note && <p className="meta max-w-xs text-center normal-case">{note}</p>}
    </section>
  )
}
