/**
 * Original-release-year resolution against MusicBrainz.
 *
 * Why this is not just "search and take the earliest result"
 * ----------------------------------------------------------
 * The obvious approach — search recordings, read `first-release-date`, take
 * the minimum — fails in a way that is invisible in the output. MusicBrainz
 * search is ranked by relevance, capped at 100 per page, and its ordering is
 * unstable across requests. A widely-covered song has hundreds of recordings:
 * "The Rhythm of the Night" by Corona reports 307. Paging through them returns
 * a *different* subset each sweep (one run collected 248 of 307), so the
 * minimum you compute is whichever early pressing happened to surface. Corona
 * resolves to 1993 or 1994 depending on the run. A year that is wrong by one
 * is indistinguishable from a hard question while playing.
 *
 * Instead this asks the server a question it can answer exactly: "how many
 * matching recordings were first released on or before year Y?" That is a
 * `firstreleasedate` range query returning a count, with no pagination and no
 * ordering involved. Binary searching Y finds the true earliest year in a
 * bounded number of calls, and gives the same answer every time.
 */

const UA = 'HitsIt/0.1 ( https://github.com/matancris/Hitsit )'
/** MusicBrainz asks for no more than one call per second. Stay under it. */
export const MB_DELAY_MS = 1200

const EARLIEST = 1900

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Lucene reserved characters, escaped so titles with punctuation still match. */
export function esc(s: string): string {
  return s.replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, '\\$1')
}

/**
 * Spotify titles carry noise MusicBrainz does not have: " - 2011 Remaster",
 * " (feat. X)", " - Single Version". Strip it before searching, or the phrase
 * query matches nothing at all.
 */
export function cleanTitle(title: string): string {
  return title
    .replace(
      /\s*[-–]\s*(\d{4}\s+)?(digital\s+)?(remaster(ed)?|mono|stereo|single|radio|album|live|version|mix|edit)\b.*$/i,
      '',
    )
    .replace(/\s*\((feat|ft|with)\.?[^)]*\)/gi, '')
    .replace(/\s*\((\d{4}\s+)?(remaster(ed)?|mono|stereo|single version|radio edit)[^)]*\)/gi, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s*[-–]\s*from\s+.*$/i, '')
    .trim()
}

export interface Stats {
  calls: number
  cacheHits: number
  /** Lookups abandoned because a request kept failing. */
  failed: number
}

/** Thrown when a query cannot be completed; the caller must not guess a year. */
class QueryFailed extends Error {}

export class MusicBrainz {
  readonly stats: Stats = { calls: 0, cacheHits: 0, failed: 0 }

  constructor(private cache: Record<string, number> = {}) {}

  get cacheData(): Record<string, number> {
    return this.cache
  }

  /** How many recordings match, according to the server. One call, no paging. */
  private async count(query: string): Promise<number> {
    const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=1`
    if (url in this.cache) {
      this.stats.cacheHits++
      return this.cache[url]
    }

    // 503 is MusicBrainz shedding load; it is transient and worth retrying.
    for (let attempt = 0; attempt < 5; attempt++) {
      await sleep(MB_DELAY_MS)
      this.stats.calls++
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA } })
        if (res.status === 503 || res.status === 429) {
          await sleep(2000 * (attempt + 1))
          continue
        }
        if (!res.ok) throw new QueryFailed(`HTTP ${res.status}`)

        const n = Number(((await res.json()) as any).count ?? 0)
        this.cache[url] = n
        return n
      } catch (err) {
        if (attempt === 4) break
        await sleep(1500 * (attempt + 1))
      }
    }

    this.stats.failed++
    throw new QueryFailed('MusicBrainz did not answer')
  }

  private inRange(base: string, upTo: number): Promise<number> {
    return this.count(`${base} AND firstreleasedate:[${EARLIEST} TO ${upTo}]`)
  }

  /**
   * The earliest year any matching recording was released, found by binary
   * search over the release-date range rather than by enumerating results.
   *
   * `hint` is Spotify's own year. Because a compilation is always released
   * *after* the original, the true answer is at or before the hint — and for
   * tracks that already sit on their original album it *is* the hint, which
   * two calls confirm outright. That shortcut is what keeps a 300-track build
   * to minutes instead of hours.
   */
  private async earliest(base: string, hint?: number): Promise<number | undefined> {
    const thisYear = new Date().getFullYear()

    let hi = thisYear
    if (hint && hint >= EARLIEST && hint <= thisYear) {
      if ((await this.inRange(base, hint)) === 0) {
        // Nothing at or before Spotify's year — the hint is not usable.
        if ((await this.inRange(base, thisYear)) === 0) return undefined
      } else {
        if ((await this.inRange(base, hint - 1)) === 0) return hint
        hi = hint - 1
      }
    } else if ((await this.inRange(base, thisYear)) === 0) {
      return undefined
    }

    let lo = EARLIEST
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if ((await this.inRange(base, mid)) > 0) hi = mid
      else lo = mid + 1
    }
    return lo
  }

  /** Earliest release year for a title/artist pair. Undefined if unresolvable. */
  async yearFromSearch(title: string, artist: string, hint?: number): Promise<number | undefined> {
    const base = `recording:"${esc(cleanTitle(title))}" AND artist:"${esc(artist)}"`
    try {
      return await this.earliest(base, hint)
    } catch {
      return undefined
    }
  }

  /**
   * Earliest release year for an ISRC. Precise when the ISRC belongs to the
   * original recording, later when it belongs to a reissue — which is exactly
   * why it is used as a second opinion rather than the primary signal.
   */
  async yearFromIsrc(isrc: string, hint?: number): Promise<number | undefined> {
    try {
      return await this.earliest(`isrc:${esc(isrc)}`, hint)
    } catch {
      return undefined
    }
  }
}
