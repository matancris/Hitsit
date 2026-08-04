import { useCallback, useEffect, useRef, useState } from 'react'
import { getPlayback, PlaybackError, type Playback } from './player'
import { getPreviewPlayback, unlockAudio } from './preview-player'
import { hasSession, isConfigured, beginLogin } from './spotify-auth'
import { useSource, type Source } from '@/store/source'
import type { Playable } from '@/types'

export interface PlayerHandle {
  playing: boolean
  /** 0–1 through the current track. */
  progress: number
  /** Real track length in ms, or 0 before it is known. */
  durationMs: number
  /** Plain-language status, or null when everything is fine. */
  note: string | null
  /** True when Spotify is the source but nobody has signed in yet. */
  needsAuth: boolean
  source: Source
  setSource: (s: Source) => void
  /** Call from a real click before the first track — see preview-player.ts. */
  unlock: () => void
  play: (card: Playable) => Promise<void>
  pause: () => void
  toggle: () => void
  replay: () => void
  connect: () => void
}

/**
 * Presents whichever backend is active as one interface, so the game does not
 * know or care where the audio comes from.
 *
 * Previews need no setup and work for everyone. Spotify needs Premium and an
 * authorised account. If neither is available the game still runs silently,
 * which is what keeps the rules playable with no credentials at all.
 */
export function usePlayer(): PlayerHandle {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const playback = useRef<Playback | null>(null)
  const tick = useRef<number | null>(null)

  const source = useSource((s) => s.source)
  const setSource = useSource((s) => s.setSource)

  const needsAuth = source === 'spotify' && isConfigured() && !hasSession()

  useEffect(() => {
    setNote(null)
    setPlaying(false)
    setProgress(0)
    playback.current = null

    const observe = (p: Playback) => {
      playback.current = p
      p.onStateChange((s) => {
        if (!s) return
        setPlaying(!s.paused)
        setDurationMs(s.duration)
        setProgress(s.duration > 0 ? s.position / s.duration : 0)
      })
    }

    if (source === 'preview') {
      observe(getPreviewPlayback())
      return
    }

    if (!isConfigured()) {
      setNote('Running without audio — no Spotify client ID configured.')
      return
    }
    if (!hasSession()) {
      setNote('Connect Spotify to hear full tracks.')
      return
    }

    let cancelled = false
    getPlayback()
      .then((p) => {
        if (!cancelled) observe(p)
      })
      .catch((err: unknown) => {
        const message =
          err instanceof PlaybackError ? err.message : 'Could not start the Spotify player.'
        setNote(`${message} Switch to previews to keep playing.`)
      })

    // The Spotify player is a page-lifetime singleton and is deliberately not
    // disconnected here — tearing it down on unmount is what breaks it.
    return () => {
      cancelled = true
    }
  }, [source])

  // Poll position while a track runs. The Spotify SDK only pushes on state
  // changes; the audio element fires timeupdate but not while seeking.
  useEffect(() => {
    if (!playing || !playback.current) return
    tick.current = window.setInterval(async () => {
      const s = await playback.current?.state()
      if (s && s.duration > 0) {
        setDurationMs(s.duration)
        setProgress(s.position / s.duration)
      }
    }, 500)
    return () => {
      if (tick.current) window.clearInterval(tick.current)
    }
  }, [playing])

  const play = useCallback(async (card: Playable) => {
    setProgress(0)
    if (!playback.current) {
      // Silent mode: report "playing" so the transport reads correctly.
      setPlaying(true)
      return
    }
    try {
      await playback.current.play(card)
      setPlaying(true)
      setNote(null)
    } catch (err) {
      const message = err instanceof PlaybackError ? err.message : 'Could not play this track.'
      setNote(message)
      setPlaying(false)
    }
  }, [])

  const pause = useCallback(() => {
    setPlaying(false)
    void playback.current?.pause()
  }, [])

  const toggle = useCallback(() => {
    if (!playback.current) {
      setPlaying((p) => !p)
      return
    }
    void playback.current.toggle()
  }, [])

  const replay = useCallback(() => {
    setProgress(0)
    void playback.current?.seekToStart()
  }, [])

  const connect = useCallback(() => {
    void beginLogin()
  }, [])

  // Synchronous on purpose: it must run inside the click, not after an await.
  const unlock = useCallback(() => {
    unlockAudio()
  }, [])

  return {
    playing,
    progress,
    durationMs,
    note,
    needsAuth,
    source,
    setSource,
    unlock,
    play,
    pause,
    toggle,
    replay,
    connect,
  }
}
