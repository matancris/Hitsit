/**
 * One-time Spotify sign-in for the deck builder.
 *
 * The deck is built from a playlist you own, which means a user-authorized
 * token — Client Credentials cannot read it. This spins up a throwaway local
 * server, walks the PKCE flow, and writes .spotify-token.json for
 * build-deck.ts to pick up.
 *
 *   npm run auth:deck
 *
 * Register this exact redirect URI in your Spotify app dashboard:
 *   http://127.0.0.1:8888/callback
 */

import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

try {
  process.loadEnvFile('.env')
} catch {
  // No .env — fall back to real environment variables.
}

const CLIENT_ID = process.env.VITE_SPOTIFY_CLIENT_ID
const PORT = 8888
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`
const TOKEN_PATH = resolve('.spotify-token.json')

const SCOPES = ['playlist-read-private', 'playlist-read-collaborative'].join(' ')

if (!CLIENT_ID) {
  console.error('VITE_SPOTIFY_CLIENT_ID is not set. Copy .env.example to .env and fill it in.')
  process.exit(1)
}

const base64url = (b: Buffer) =>
  b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const verifier = base64url(randomBytes(48))
const challenge = base64url(createHash('sha256').update(verifier).digest())

const authUrl =
  'https://accounts.spotify.com/authorize?' +
  new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })

async function exchange(code: string) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID!,
      code_verifier: verifier,
    }),
  })

  const json = (await res.json()) as Record<string, any>
  if (!res.ok) throw new Error(json.error_description || json.error || 'Token request failed')

  writeFileSync(
    TOKEN_PATH,
    JSON.stringify(
      {
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_at: Date.now() + (json.expires_in - 60) * 1000,
      },
      null,
      2,
    ),
  )
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  if (url.pathname !== '/callback') {
    res.writeHead(404).end()
    return
  }

  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end(`Sign-in failed: ${error ?? 'no code returned'}`)
    console.error(`\nSign-in failed: ${error ?? 'no code returned'}`)
    server.close()
    process.exit(1)
  }

  try {
    await exchange(code)
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Signed in. You can close this tab and return to the terminal.')
    console.log(`\nToken saved to ${TOKEN_PATH}`)
    console.log('Now run: npm run build:deck')
    server.close()
    process.exit(0)
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(String(err))
    console.error(`\n${err}`)
    server.close()
    process.exit(1)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('\nOpen this URL in your browser to authorize HitsIt:\n')
  console.log(`  ${authUrl}\n`)
  console.log(`Waiting for the redirect on ${REDIRECT_URI} …`)
  console.log('(If Spotify rejects the redirect, add that exact URI to your app in the dashboard.)')
})
