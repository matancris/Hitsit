/**
 * Authorization Code + PKCE. No client secret, so this is safe to ship in a
 * browser bundle. Tokens live in localStorage and are refreshed on demand.
 */

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined
const STORAGE_KEY = 'hitsit.spotify.token'
const VERIFIER_KEY = 'hitsit.spotify.verifier'

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
].join(' ')

export const redirectUri = (): string => `${window.location.origin}/callback`

export const isConfigured = (): boolean => Boolean(CLIENT_ID)

interface StoredToken {
  access_token: string
  refresh_token?: string
  /** Epoch ms. */
  expires_at: number
}

function read(): StoredToken | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredToken) : null
  } catch {
    return null
  }
}

function write(t: StoredToken) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t))
}

export function signOut() {
  localStorage.removeItem(STORAGE_KEY)
}

function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Sends the browser to Spotify. Never returns. */
export async function beginLogin(): Promise<void> {
  if (!CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID is not set')

  const verifier = randomString(64)
  sessionStorage.setItem(VERIFIER_KEY, verifier)

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: base64url(digest),
  })

  window.location.assign(`https://accounts.spotify.com/authorize?${params}`)
}

async function exchange(body: Record<string, string>): Promise<StoredToken> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error_description || json.error || 'Token request failed')
  }

  const token: StoredToken = {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? read()?.refresh_token,
    // Refresh a minute early so a token never expires mid-track.
    expires_at: Date.now() + (json.expires_in - 60) * 1000,
  }
  write(token)
  return token
}

/** Call once on /callback. Returns true if a session was established. */
export async function completeLogin(code: string): Promise<boolean> {
  if (!CLIENT_ID) return false
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  if (!verifier) return false
  sessionStorage.removeItem(VERIFIER_KEY)

  await exchange({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    client_id: CLIENT_ID,
    code_verifier: verifier,
  })
  return true
}

/** A valid access token, refreshing if needed. Null when not signed in. */
export async function getAccessToken(): Promise<string | null> {
  const token = read()
  if (!token) return null
  if (Date.now() < token.expires_at) return token.access_token

  if (!token.refresh_token || !CLIENT_ID) {
    signOut()
    return null
  }

  try {
    const fresh = await exchange({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      client_id: CLIENT_ID,
    })
    return fresh.access_token
  } catch {
    signOut()
    return null
  }
}

export const hasSession = (): boolean => read() !== null
