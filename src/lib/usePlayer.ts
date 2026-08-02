import { useCallback, useEffect, useRef, useState } from 'react'
import { getPlayback, PlaybackError, type Playback } from './player'
import { hasSession, isConfigured, beginLogin } from './spotify-auth'

export interface PlayerHandle {
  playing: boolean
  /** 0–1 through the current track. */
  progress: number
  /** Plain-language status, or null when everything is fine. */
  note: string | null
  /** True when Spotify is configured but nobody has signed in yet. */
  needsAuth: boolean
  play: (uri: string) => Promise<void>
  pause: () => void
  toggle: () => void
  replay: () => void
  connect: () => void
}

/**
 * Wraps the Spotify player in something the game can use unconditionally.
 *
 * When Spotify is not configured or not signed in, this runs silent: the game
 * is fully playable, there is just no audio. That keeps the rules and the UI
 * developable before any credentials exist.
 */
export function usePlayer(): PlayerHandle {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [needsAuth, setNeedsAuth] = useState(isConfigured() && !hasSession())
  const playback = useRef<Playback | null>(null)
  const tick = useRef<number | null>(null)

  useEffect(() => {
    if (!isConfigured()) {
      setNote('Running without audio — no Spotify client ID configured.')
      return
    }
    if (!hasSession()) {
      setNeedsAuth(true)
      setNote('Connect Spotify to hear the songs.')
      return
    }
    setNeedsAuth(false)

    let cancelled = false
    getPlayback()
      .then((p) => {
        if (cancelled) return
        playback.current = p
        setNote(null)
        p.onStateChange((s) => {
          if (!s) return
          setPlaying(!s.paused)
          setProgress(s.duration > 0 ? s.position / s.duration : 0)
        })
      })
      .catch((err: unknown) => {
        const message =
          err instanceof PlaybackError ? err.message : 'Could not start the Spotify player.'
        setNote(`${message} The game still works without audio.`)
      })

    // The player is a page-lifetime singleton, so it is deliberately not
    // disconnected here — tearing it down on unmount is what breaks it.
    return () => {
      cancelled = true
    }
  }, [])

  // Poll position while a track runs — the SDK only pushes on state changes.
  useEffect(() => {
    if (!playing || !playback.current) return
    tick.current = window.setInterval(async () => {
      const s = await playback.current?.state()
      if (s && s.duration > 0) setProgress(s.position / s.duration)
    }, 1000)
    return () => {
      if (tick.current) window.clearInterval(tick.current)
    }
  }, [playing])

  const play = useCallback(async (uri: string) => {
    setProgress(0)
    if (!playback.current) {
      // Silent mode: report "playing" so the transport reads correctly.
      setPlaying(true)
      return
    }
    try {
      await playback.current.play(uri)
      setPlaying(true)
    } catch (err) {
      const message =
        err instanceof PlaybackError ? err.message : 'Could not play this track.'
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

  return { playing, progress, note, needsAuth, play, pause, toggle, replay, connect }
}
