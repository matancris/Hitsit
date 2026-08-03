/**
 * The decade spectrum — the app's signature.
 *
 * Each card is tinted by its decade so a finished timeline reads as a
 * gradient. This is deliberately ordered warm-to-cool rather than a
 * palette of unrelated hues: the ordering itself is the information.
 */

export type DecadeToken =
  | 'dec-early'
  | 'dec-60'
  | 'dec-70'
  | 'dec-80'
  | 'dec-90'
  | 'dec-00'
  | 'dec-10'

const HEX: Record<DecadeToken, string> = {
  'dec-early': '#c4713d',
  'dec-60': '#d9a441',
  'dec-70': '#d4573f',
  'dec-80': '#c2417e',
  'dec-90': '#5e63c7',
  'dec-00': '#2f8fa8',
  'dec-10': '#3fa46a',
}

export function decadeToken(year: number): DecadeToken {
  if (year < 1960) return 'dec-early'
  if (year < 1970) return 'dec-60'
  if (year < 1980) return 'dec-70'
  if (year < 1990) return 'dec-80'
  if (year < 2000) return 'dec-90'
  if (year < 2010) return 'dec-00'
  return 'dec-10'
}

/** Raw hex, for inline styles and canvas/gradient work where a class won't do. */
export function decadeHex(year: number): string {
  return HEX[decadeToken(year)]
}

/** e.g. 1985 → "80s", 1957 → "50s". Used as the card's eyebrow label. */
export function decadeLabel(year: number): string {
  return `${String(Math.floor(year / 10) * 10).slice(-2)}s`
}
