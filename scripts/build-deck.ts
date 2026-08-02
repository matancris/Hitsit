/**
 * Builds src/data/deck.json from a Spotify playlist you own.
 *
 * Why this runs offline instead of at game time
 * ---------------------------------------------
 * Spotify's `album.release_date` is the date of the album the track sits on,
 * which for catalogue music is usually a remaster or a greatest-hits comp.
 * A Diana Ross anthology reports 2003 for a 1980 single. Since the entire game
 * is guessing years, shipping that would break it.
 *
 * So years are resolved against MusicBrainz here, once, and reviewed by hand
 * where the signals disagree. The game itself only ever reads the JSON.
 *
 *   npm run auth:deck     # once, to sign in
 *   npm run build:deck
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { MusicBrainz, MB_DELAY_MS } from './musicbrainz.ts'

try {
  process.loadEnvFile('.env')
} catch {
  // No .env — fall back to real environment variables.
}

const CLIENT_ID = process.env.VITE_SPOTIFY_CLIENT_ID
const PLAYLIST_ID = process.env.DECK_PLAYLIST_ID
const MIN_TRACKS = Number(process.env.DECK_MIN_TRACKS ?? 100)

const TOKEN_PATH = resolve('.spotify-token.json')
const CACHE_PATH = resolve('data/.musicbrainz-cache.json')
const OVERRIDES_PATH = resolve('data/year-overrides.json')
const DECK_PATH = resolve('src/data/deck.json')
const REVIEW_PATH = resolve('data/deck.review.csv')

type Confidence = 'confident' | 'reviewed' | 'needs-review'

interface Track {
  id: string
  uri: string
  title: string
  artist: string
  isrc?: string
  art?: string
  spotifyYear?: number
}

interface Resolved extends Track {
  isrcYear?: number
  searchYear?: number
  year?: number
  confidence: Confidence
}

// ─── small helpers ───────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function die(message: string): never {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
}

// ─── Spotify ─────────────────────────────────────────────────────────────────

async function accessToken(): Promise<string> {
  const stored = readJson<{
    access_token?: string
    refresh_token?: string
    expires_at?: number
  }>(TOKEN_PATH, {})

  if (!stored.access_token) {
    die('Not signed in to Spotify. Run:  npm run auth:deck')
  }
  if (stored.expires_at && Date.now() < stored.expires_at) {
    return stored.access_token
  }
  if (!stored.refresh_token || !CLIENT_ID) {
    die('Spotify token expired and cannot be refreshed. Run:  npm run auth:deck')
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: stored.refresh_token,
      client_id: CLIENT_ID,
    }),
  })
  const json = (await res.json()) as Record<string, any>
  if (!res.ok) die(`Could not refresh the Spotify token: ${json.error_description ?? json.error}`)

  const token = {
    access_token: json.access_token as string,
    refresh_token: (json.refresh_token as string) ?? stored.refresh_token,
    expires_at: Date.now() + (json.expires_in - 60) * 1000,
  }
  writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2))
  return token.access_token
}

async function fetchPlaylist(token: string): Promise<Track[]> {
  const tracks: Track[] = []
  // Development Mode moved playlist contents from /tracks to /items in the
  // February 2026 reshape, and each entry is keyed `item` rather than `track`.
  // The old path still exists but answers 403.
  let url:
    | string
    | null = `https://api.spotify.com/v1/playlists/${PLAYLIST_ID}/items?limit=100&fields=next,items(is_local,item(id,uri,name,artists(name),external_ids(isrc),album(release_date,images)))`
  let page = 0

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

    if (res.status === 401) die('Spotify rejected the token. Run:  npm run auth:deck')
    if (res.status === 403) {
      die(
        `Spotify refused access to playlist ${PLAYLIST_ID}.\n` +
          '  Two things cause this in Development Mode:\n' +
          '    · the playlist is owned by someone else — make your own copy, not a follow\n' +
          '    · the request used the retired /tracks path instead of /items',
      )
    }
    if (res.status === 404) die(`Playlist ${PLAYLIST_ID} not found.`)
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') ?? 5)
      console.log(`  rate limited, waiting ${wait}s …`)
      await sleep(wait * 1000)
      continue
    }
    if (!res.ok) die(`Spotify returned ${res.status} for the playlist.`)

    const body = (await res.json()) as any
    page++

    for (const entry of body.items ?? []) {
      const t = entry?.item
      // Local files and unavailable tracks come back without a usable id.
      if (!t?.id || entry.is_local) continue

      const release: string | undefined = t.album?.release_date
      const year = release ? Number(release.slice(0, 4)) : undefined

      tracks.push({
        id: t.id,
        uri: t.uri,
        title: t.name,
        artist: t.artists?.[0]?.name ?? 'Unknown',
        isrc: t.external_ids?.isrc,
        art: t.album?.images?.at(-1)?.url ?? t.album?.images?.[0]?.url,
        spotifyYear: Number.isFinite(year) ? year : undefined,
      })
    }

    url = body.next
    console.log(`  page ${page}: ${tracks.length} tracks so far`)
  }

  return tracks
}

// ─── MusicBrainz ─────────────────────────────────────────────────────────────

const mb = new MusicBrainz(readJson<Record<string, number>>(CACHE_PATH, {}))

// ─── triage ──────────────────────────────────────────────────────────────────

/**
 * A song released more than this long before the album Spotify found it on is
 * more likely a loose Lucene match on another artist's recording than a real
 * find. Deep-catalogue reissues do exist, so these are flagged, not dropped.
 */
const MAX_PLAUSIBLE_GAP = 45

function triage(t: Track, isrcYear?: number, searchYear?: number): Resolved {
  const spotify = t.spotifyYear
  const base = { ...t, isrcYear, searchYear }

  // The binary search is exhaustive and deterministic, so when it answers it
  // is the best evidence available — subject only to the sanity checks below.
  if (searchYear !== undefined) {
    // A compilation is always released after the original, never before. If
    // MusicBrainz claims a *later* year than Spotify, something is off.
    if (spotify !== undefined && searchYear > spotify) {
      return { ...base, year: spotify, confidence: 'needs-review' }
    }
    if (spotify !== undefined && spotify - searchYear > MAX_PLAUSIBLE_GAP) {
      return { ...base, year: searchYear, confidence: 'needs-review' }
    }
    return { ...base, year: searchYear, confidence: 'confident' }
  }

  // Falling back to the ISRC means the title/artist search found nothing —
  // often a live version or a re-recording. Worth a year, not worth trusting.
  if (isrcYear !== undefined) {
    return { ...base, year: isrcYear, confidence: 'needs-review' }
  }

  return { ...base, year: spotify, confidence: 'needs-review' }
}

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!PLAYLIST_ID) die('DECK_PLAYLIST_ID is not set. Copy .env.example to .env.')

  console.log(`\nBuilding deck from playlist ${PLAYLIST_ID}\n`)

  const token = await accessToken()
  console.log('Fetching playlist …')
  const tracks = await fetchPlaylist(token)

  console.log(`\n  ${tracks.length} playable tracks fetched`)
  if (tracks.length < MIN_TRACKS) {
    die(
      `Only ${tracks.length} tracks, expected at least ${MIN_TRACKS}.\n` +
        '  Either the copy is truncated or pagination stopped early. Both would\n' +
        '  silently shrink the game, so nothing has been written.\n' +
        '  Check the count in Spotify, or lower DECK_MIN_TRACKS if it is genuinely short.',
    )
  }

  const overrides = readJson<Record<string, number>>(OVERRIDES_PATH, {})
  console.log(`  ${Object.keys(overrides).length} hand-corrected years on file\n`)

  console.log(`Resolving release years via MusicBrainz (~${MB_DELAY_MS / 1000}s per call) …`)
  const resolved: Resolved[] = []

  for (const [i, track] of tracks.entries()) {
    // Overridden tracks never need a lookup — that is the point of the file.
    if (overrides[track.id]) {
      resolved.push({ ...track, year: overrides[track.id], confidence: 'reviewed' })
      continue
    }

    // Spotify's own year is passed as a hint: the original release is always
    // at or before it, which lets the binary search skip the upper half and,
    // for tracks already on their original album, settle in two calls.
    const searchYear = await mb.yearFromSearch(track.title, track.artist, track.spotifyYear)

    // Only worth a second lookup when the primary signal came back empty.
    const isrcYear =
      searchYear === undefined && track.isrc
        ? await mb.yearFromIsrc(track.isrc, track.spotifyYear)
        : undefined

    const entry = triage(track, isrcYear, searchYear)
    resolved.push(entry)

    const mark = entry.confidence === 'confident' ? '·' : '?'
    console.log(
      `  ${mark} [${String(i + 1).padStart(3)}/${tracks.length}] ${entry.year ?? '????'}  ${track.title} — ${track.artist}`,
    )

    // Persist as we go: a 10-minute run should never be lost to one bad call.
    if (i % 20 === 0) writeJson(CACHE_PATH, mb.cacheData)
  }

  writeJson(CACHE_PATH, mb.cacheData)

  const playable = resolved.filter((r) => r.year !== undefined && r.confidence !== 'needs-review')
  const review = resolved.filter((r) => r.confidence === 'needs-review')

  writeJson(
    DECK_PATH,
    playable.map((r) => ({
      id: r.id,
      uri: r.uri,
      title: r.title,
      artist: r.artist,
      year: r.year,
      art: r.art,
      confidence: r.confidence,
    })),
  )

  const header = 'id,title,artist,spotify_year,isrc_year,search_year,suggested_year'
  const rows = review.map((r) =>
    [r.id, r.title, r.artist, r.spotifyYear, r.isrcYear, r.searchYear, r.year]
      .map(csvCell)
      .join(','),
  )
  mkdirSync(dirname(REVIEW_PATH), { recursive: true })
  writeFileSync(REVIEW_PATH, [header, ...rows].join('\n') + '\n')

  const pct = Math.round((playable.length / resolved.length) * 100)
  console.log(`\n─────────────────────────────────────────────`)
  console.log(`  fetched        ${resolved.length}`)
  console.log(`  in the deck    ${playable.length}  (${pct}%)`)
  console.log(`  needs review   ${review.length}`)
  console.log(`  MusicBrainz    ${mb.stats.calls} calls, ${mb.stats.cacheHits} cached`)
  if (mb.stats.failed) {
    console.log(`  lookups failed ${mb.stats.failed}  (those tracks fell through to review)`)
  }
  console.log(`─────────────────────────────────────────────`)
  console.log(`\n  deck    → ${DECK_PATH}`)
  console.log(`  review  → ${REVIEW_PATH}`)

  if (review.length) {
    console.log(
      `\nThe ${review.length} flagged tracks are excluded from the deck. To add them, put the\n` +
        `correct years in data/year-overrides.json keyed by track id, then re-run —\n` +
        `overrides are applied first, so nothing you have already fixed is looked up again.`,
    )
  }
  console.log()
}

main().catch((err) => die(String(err)))
