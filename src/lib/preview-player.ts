import type { Playable } from '@/types'
import type { Playback, SpotifyPlayerState } from './player'
import { PlaybackError } from './player'

/**
 * Playback over a plain HTML5 audio element, using the 30-second preview clips
 * attached to each card by the deck builder.
 *
 * This is what lets anyone play without a Spotify login, rather than the five
 * people Development Mode allows.
 *
 * ── The autoplay problem ──────────────────────────────────────────────────
 * Browsers refuse `audio.play()` unless the call descends from a user gesture.
 * The game starts each track from an effect when a card is drawn, which is not
 * a gesture, so on iOS every track after the first would fail silently.
 *
 * The escape is that an element which has *once* played inside a gesture stays
 * unlocked for the rest of the page's life. So there is exactly one element,
 * created lazily, and `unlock()` is called from the Start button's own handler.
 * Recreating the element per track would re-lock it and reintroduce the bug —
 * which is why this is a module-level singleton, the same shape and the same
 * reason as `getPlayback()` in player.ts.
 */

let audio: HTMLAudioElement | null = null
let unlocked = false

function element(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio()
    audio.preload = 'auto'
    // The clips are already loudness-normalised; full volume matches Spotify.
    audio.volume = 1
  }
  return audio
}

/** A silent WAV — playing a real clip here would give the answer away early. */
const SILENT =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

/**
 * Must be called synchronously inside a real user gesture (a click or tap).
 * Plays nothing audible — it only satisfies the browser that the element was
 * started by the user, after which effect-driven playback is permitted.
 *
 * Deliberately not `async`. An earlier version awaited the silent clip and then
 * paused it, which raced the first real track: `play()` would set the preview
 * source, the unlock's `pause()` would land a moment later and stop it, and the
 * element could be left holding the silent clip — so pressing play afterwards
 * played silence. Hence the guard below: only undo the unlock if the source is
 * still the silent one.
 */
export function unlockAudio(): void {
  if (unlocked) return
  const el = element()
  unlocked = true
  try {
    el.src = SILENT
    const started = el.play()
    if (started) {
      started
        .then(() => {
          if (el.src === SILENT) {
            el.pause()
            el.currentTime = 0
          }
        })
        .catch(() => {
          // Refused, or superseded by a real track. Either is fine.
        })
    }
  } catch {
    // Some browsers still refuse. The game keeps working, so do not fail start.
  }
}

/** Decodes HTMLMediaElement.error into something a person can act on. */
function describeMediaError(el: HTMLAudioElement): string | null {
  const err = el.error
  if (!err) return null
  switch (err.code) {
    case 1:
      return 'Loading the clip was aborted.'
    case 2:
      return 'Network error fetching the clip.'
    case 3:
      return 'The clip could not be decoded.'
    case 4:
      return 'This audio format is not supported by your browser.'
    default:
      return err.message || 'Unknown audio error.'
  }
}

let sharedPreview: Playback | null = null

/**
 * One instance per page. StrictMode double-invokes effects, and a second
 * instance would attach a duplicate set of listeners to the same element.
 */
export function getPreviewPlayback(): Playback {
  if (!sharedPreview) sharedPreview = createPreviewPlayback()
  return sharedPreview
}

function createPreviewPlayback(): Playback {
  const listeners: Array<(s: SpotifyPlayerState | null) => void> = []
  const el = element()

  const snapshot = (): SpotifyPlayerState => ({
    paused: el.paused,
    position: Number.isFinite(el.currentTime) ? el.currentTime * 1000 : 0,
    // A clip that has not loaded yet reports NaN duration; report 0 so callers
    // dividing by it do not produce NaN progress.
    duration: Number.isFinite(el.duration) ? el.duration * 1000 : 0,
  })

  const emit = () => {
    const s = snapshot()
    for (const cb of listeners) cb(s)
  }

  for (const event of ['play', 'pause', 'timeupdate', 'ended', 'loadedmetadata']) {
    el.addEventListener(event, emit)
  }

  // A load failure pauses the element without rejecting an already-resolved
  // play() promise, which is exactly the "icon flashes then reverts, silence"
  // symptom. Report it rather than letting it vanish.
  el.addEventListener('error', () => {
    const message = describeMediaError(el)
    if (message) console.error('[HitsIt] preview audio error:', message, el.currentSrc)
    emit()
  })

  return {
    deviceId: 'preview',

    play: async (card: Playable) => {
      if (!card.preview) {
        throw new PlaybackError('No preview available for this song.', 'unknown')
      }
      // Assigning src cancels any in-flight load, including the unlock clip,
      // and resets position — so do not touch currentTime before it loads.
      el.src = card.preview
      try {
        await el.play()
      } catch (err) {
        const name = err instanceof Error ? err.name : 'Error'
        // NotAllowedError is the autoplay policy; anything else is the clip
        // itself failing. Reporting them the same way hid a real load failure
        // behind a misleading "tap play" message, so keep them distinct.
        if (name === 'NotAllowedError') {
          throw new PlaybackError('Tap play to start the song.', 'unknown')
        }
        const media = describeMediaError(el)
        throw new PlaybackError(
          media ? `${media} (${name})` : `Playback failed: ${name}.`,
          'unknown',
        )
      }
    },

    pause: async () => {
      el.pause()
    },

    resume: async () => {
      await el.play()
    },

    toggle: async () => {
      if (el.paused) await el.play()
      else el.pause()
    },

    seekToStart: async () => {
      el.currentTime = 0
    },

    state: async () => snapshot(),

    onStateChange: (cb) => {
      listeners.push(cb)
    },

    disconnect: () => {
      el.pause()
      // The element itself is deliberately kept: discarding it would lose the
      // autoplay unlock and break every subsequent track.
      listeners.length = 0
    },
  }
}
