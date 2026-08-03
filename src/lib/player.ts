import { getAccessToken } from './spotify-auth'

/**
 * Thin wrapper over the Spotify Web Playback SDK.
 *
 * The SDK is the only way to play full tracks: 30-second previews were removed
 * from the Web API for new apps in November 2024. It requires Premium and a
 * browser, which is why this app is a PWA rather than native.
 */

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void
    Spotify: {
      Player: new (opts: {
        name: string
        getOAuthToken: (cb: (token: string) => void) => void
        volume?: number
      }) => SpotifyPlayer
    }
  }
}

export interface SpotifyPlayerState {
  paused: boolean
  position: number
  duration: number
}

interface SpotifyPlayer {
  connect: () => Promise<boolean>
  disconnect: () => void
  addListener: (event: string, cb: (arg: any) => void) => void
  togglePlay: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  seek: (ms: number) => Promise<void>
  getCurrentState: () => Promise<SpotifyPlayerState | null>
}

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js'

let sdkPromise: Promise<void> | null = null

function loadSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    if (window.Spotify) return resolve()

    window.onSpotifyWebPlaybackSDKReady = () => resolve()

    const script = document.createElement('script')
    script.src = SDK_SRC
    script.async = true
    script.onerror = () => reject(new Error('Could not load the Spotify player.'))
    document.head.appendChild(script)
  })
  return sdkPromise
}

export class PlaybackError extends Error {
  constructor(
    message: string,
    readonly kind: 'premium' | 'auth' | 'network' | 'device' | 'unknown',
  ) {
    super(message)
  }
}

export interface Playback {
  deviceId: string
  play: (uri: string) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  toggle: () => Promise<void>
  seekToStart: () => Promise<void>
  state: () => Promise<SpotifyPlayerState | null>
  onStateChange: (cb: (s: SpotifyPlayerState | null) => void) => void
  disconnect: () => void
}

let shared: Promise<Playback> | null = null

/**
 * One player per page, created once.
 *
 * React StrictMode runs effects twice in development. Creating a player per
 * effect run registers two SDK devices and then disconnects one, which leaves
 * the surviving `device_id` unusable — Spotify answers 404 on every play call.
 * Holding the promise at module scope makes double-invocation harmless.
 */
export function getPlayback(): Promise<Playback> {
  if (!shared) {
    shared = createPlayback().catch((err) => {
      // Let the next attempt retry rather than caching a failure forever.
      shared = null
      throw err
    })
  }
  return shared
}

export async function createPlayback(): Promise<Playback> {
  await loadSdk()

  const listeners: Array<(s: SpotifyPlayerState | null) => void> = []

  const player = new window.Spotify.Player({
    name: 'HitsIt',
    volume: 0.8,
    getOAuthToken: (cb) => {
      // The SDK calls this whenever it needs a fresh token, including on
      // silent re-auth, so it must always go through the refresh path.
      void getAccessToken().then((t) => t && cb(t))
    },
  })

  const deviceId = await new Promise<string>((resolve, reject) => {
    player.addListener('ready', ({ device_id }: { device_id: string }) => resolve(device_id))

    player.addListener('account_error', () =>
      reject(
        new PlaybackError(
          'This Spotify account is not Premium. Full-track playback needs Premium.',
          'premium',
        ),
      ),
    )
    player.addListener('authentication_error', ({ message }: { message: string }) =>
      reject(new PlaybackError(message || 'Spotify rejected the session.', 'auth')),
    )
    player.addListener('initialization_error', ({ message }: { message: string }) =>
      reject(new PlaybackError(message || 'The browser blocked the player.', 'unknown')),
    )

    player.addListener('player_state_changed', (s: SpotifyPlayerState | null) => {
      for (const cb of listeners) cb(s)
    })

    void player.connect().then((ok) => {
      if (!ok) reject(new PlaybackError('The Spotify player refused to connect.', 'unknown'))
    })
  })

  async function api(path: string, init: RequestInit): Promise<void> {
    const token = await getAccessToken()
    if (!token) throw new PlaybackError('Signed out of Spotify.', 'auth')

    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    })

    // 204 is the normal success for player commands.
    if (res.status === 204 || res.ok) return
    if (res.status === 401) throw new PlaybackError('Spotify session expired.', 'auth')
    if (res.status === 403) {
      throw new PlaybackError('Playback refused — Premium is required.', 'premium')
    }
    if (res.status === 404) {
      throw new PlaybackError('Spotify does not see the HitsIt player yet.', 'device')
    }
    throw new PlaybackError(`Spotify returned ${res.status}.`, 'unknown')
  }

  /**
   * Hand playback to this device. A freshly-registered SDK device is often not
   * yet the user's active device, and Spotify answers 404 "device not found"
   * until it is — transferring first is what makes the play call stick.
   */
  const transfer = () =>
    api('/me/player', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_ids: [deviceId], play: false }),
    })

  const start = (uri: string) =>
    api(`/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [uri] }),
    })

  return {
    deviceId,
    play: async (uri) => {
      try {
        await start(uri)
      } catch (err) {
        if (!(err instanceof PlaybackError) || err.kind !== 'device') throw err
        // Claim the device, give Spotify a beat to register it, then retry once.
        await transfer()
        await new Promise((r) => setTimeout(r, 400))
        await start(uri)
      }
    },
    pause: () => player.pause(),
    resume: () => player.resume(),
    toggle: () => player.togglePlay(),
    seekToStart: () => player.seek(0),
    state: () => player.getCurrentState(),
    onStateChange: (cb) => listeners.push(cb),
    disconnect: () => player.disconnect(),
  }
}
