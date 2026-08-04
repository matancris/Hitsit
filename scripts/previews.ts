/**
 * 30-second preview lookup.
 *
 * The game only needs about thirty seconds of audio to be playable, and both
 * Apple and Deezer publish preview clips with no key, no auth and no user cap.
 * That is what lets the app work for anyone, rather than the five people
 * Spotify's Development Mode allows.
 *
 * iTunes only, and that is a deliberate reversal.
 *
 * Deezer looked like the better source: identical coverage on a random sample,
 * MP3 rather than AAC, and no rate limiting where Apple starts returning 403
 * after roughly sixty sustained lookups. It was used for 263 of 265 tracks.
 *
 * Then every one of those URLs went dead. Deezer signs its preview links and
 * they expire within about an hour — re-querying the same track returns a
 * *different* URL. That is fatal here, because the deck is built once and
 * shipped as static JSON: an hour after the build, preview mode is silent.
 * Apple's preview links are plain long-lived CDN paths and were still serving
 * when Deezer's had expired.
 *
 * So the rate limit is simply paid for: calls are spaced widely and 403s are
 * backed off. A full build takes around twenty minutes instead of two, which is
 * a fine price for a deck that still works tomorrow.
 *
 * If preview coverage ever needs improving, the answer is not another provider
 * with signed URLs — it is checking whether that provider's links are stable
 * enough to store. Test by fetching a stored URL an hour later.
 *
 * The match guard matters more than coverage. A search for a title and artist
 * will happily return a karaoke version, a live cut or a re-recording, and a
 * wrong recording is worse than no audio: it makes the year unguessable while
 * looking perfectly fine.
 */

/**
 * Apple's documented ceiling is roughly 20 calls per minute. A 25-call burst
 * passes cleanly, which is misleading — sustained lookups start failing after
 * about sixty. Three seconds keeps a 300-track build comfortably inside it.
 */
const SPACING_MS = 3000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type Provider = 'itunes'

export interface PreviewMatch {
  url: string
  provider: Provider
  /** The artist the provider returned, kept so a bad match can be audited. */
  artist: string
  durationMs?: number
}

/** A candidate before the guard has ruled on it. */
interface Candidate {
  url?: string
  artist?: string
  durationMs?: number
}

/**
 * Compare artist names loosely enough to survive real-world punctuation.
 * "KC & The Sunshine Band" and "KC and the Sunshine Band" are the same act, and
 * Spotify's "Lady Gaga" is Apple's "Lady Gaga & Bradley Cooper" — both were
 * false alarms in testing before `&` was normalised.
 */
export function normaliseArtist(s: string): string {
  return (
    s
      .toLowerCase()
      // Decompose accents and drop the combining marks, so "Sinéad" and
      // "Sinead" agree. Providers are inconsistent about this and the deck
      // contains both forms; without it those tracks lose their preview.
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]/g, '')
  )
}

export function artistMatches(want: string, got: string): boolean {
  const a = normaliseArtist(want)
  const b = normaliseArtist(got)
  if (!a || !b) return false
  // Substring either way: featured artists appear on one side but not the other.
  return a === b || a.includes(b) || b.includes(a)
}

/** Within 15%. This is what rejects radio edits, live cuts and karaoke covers. */
export function durationMatches(wantMs?: number, gotMs?: number): boolean {
  // No duration on either side is not evidence of a mismatch, so do not fail on it.
  if (!wantMs || !gotMs) return true
  return Math.abs(wantMs - gotMs) / wantMs <= 0.15
}

export function accepts(
  candidate: Candidate,
  wantArtist: string,
  wantDurationMs?: number,
): boolean {
  if (!candidate.url || !candidate.artist) return false
  if (!artistMatches(wantArtist, candidate.artist)) return false
  return durationMatches(wantDurationMs, candidate.durationMs)
}

export interface Stats {
  calls: number
  cacheHits: number
  itunes: number
  rejected: number
  missing: number
  /** Requests refused for rate limiting — surfaced so it cannot hide. */
  throttled: number
}

export class Previews {
  readonly stats: Stats = {
    calls: 0,
    cacheHits: 0,
    itunes: 0,
    rejected: 0,
    missing: 0,
    throttled: 0,
  }

  constructor(private cache: Record<string, unknown> = {}) {}

  get cacheData(): Record<string, unknown> {
    return this.cache
  }

  private async fetchJson(url: string): Promise<any> {
    if (url in this.cache) {
      this.stats.cacheHits++
      return this.cache[url]
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(SPACING_MS)
      this.stats.calls++
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'HitsIt/0.1' } })

        // Apple signals throttling with 403, not 429. Back off and retry —
        // without this the caller cannot tell "rate limited" from "no such
        // track", and a whole build quietly degrades to one provider.
        if (res.status === 403 || res.status === 429 || res.status >= 500) {
          this.stats.throttled++
          await sleep(2000 * (attempt + 1))
          continue
        }
        if (!res.ok) return null

        // iTunes serves its JSON as text/javascript, so do not trust the type.
        const json = JSON.parse(await res.text())
        this.cache[url] = json
        return json
      } catch {
        await sleep(1000 * (attempt + 1))
      }
    }
    return null
  }

  private async itunes(title: string, artist: string): Promise<Candidate[]> {
    const term = encodeURIComponent(`${title} ${artist}`)
    const body = await this.fetchJson(
      `https://itunes.apple.com/search?term=${term}&entity=song&limit=5`,
    )
    return (body?.results ?? []).map((r: any) => ({
      url: r.previewUrl,
      artist: r.artistName,
      durationMs: r.trackTimeMillis,
    }))
  }

  /**
   * The first candidate that survives the guard. Returns null rather than a
   * doubtful match — a track with no preview is simply skipped in preview mode,
   * which is far better than the wrong song.
   */
  async find(title: string, artist: string, durationMs?: number): Promise<PreviewMatch | null> {
    const candidates = await this.itunes(title, artist)

    for (const c of candidates) {
      if (accepts(c, artist, durationMs)) {
        this.stats.itunes++
        return {
          url: c.url!,
          provider: 'itunes',
          artist: c.artist!,
          durationMs: c.durationMs,
        }
      }
    }

    // Distinguish "nothing came back" from "results came back but none passed":
    // a high rejection count means the guard is too strict, not the catalogue thin.
    if (candidates.length > 0) this.stats.rejected++
    else this.stats.missing++
    return null
  }
}
