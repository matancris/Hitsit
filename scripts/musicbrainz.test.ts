/**
 * Checks year resolution against songs with well-known release years.
 *
 *   npx tsx scripts/musicbrainz.test.ts
 *
 * The title-cleaning cases are pure and instant. The lookups hit the live
 * MusicBrainz API at ~1.2s per call.
 *
 * Every case here is one the naive "search and take the earliest hit" approach
 * gets wrong or answers inconsistently, so this is a real regression net rather
 * than a formality.
 */

import { MusicBrainz, cleanTitle } from './musicbrainz.ts'

let failures = 0

function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected
  if (!ok) failures++
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok ? '' : ` — got ${actual}, want ${expected}`}`)
}

console.log('\ntitle cleaning (Spotify noise MusicBrainz does not carry)')
check('remaster suffix', cleanTitle('Bohemian Rhapsody - 2011 Remaster'), 'Bohemian Rhapsody')
check('remastered suffix', cleanTitle('Walk of Life - Remastered 2000'), 'Walk of Life')
check('feat. in parens', cleanTitle('Crazy in Love (feat. Jay-Z)'), 'Crazy in Love')
check('bracketed tag', cleanTitle('Billie Jean [Live]'), 'Billie Jean')
check('single version', cleanTitle('Upside Down - Single Version'), 'Upside Down')
check('from-a-film suffix', cleanTitle('Footloose - From "Footloose"'), 'Footloose')
check('leaves clean titles alone', cleanTitle('Rolling in the Deep'), 'Rolling in the Deep')
check('keeps meaningful hyphens', cleanTitle("'74-'75"), "'74-'75")

const mb = new MusicBrainz()

/**
 * `hint` is the year Spotify would report for a track sitting on a
 * compilation — deliberately later than the truth, so these also prove the
 * hint shortcut cannot drag an answer forward.
 */
const cases: Array<{ title: string; artist: string; want: number; hint?: number }> = [
  { title: 'Upside Down', artist: 'Diana Ross', want: 1980, hint: 2003 },
  { title: 'The Rhythm of the Night', artist: 'Corona', want: 1993, hint: 1995 },
  { title: 'Walk of Life', artist: 'Dire Straits', want: 1985 },
  { title: 'Billie Jean', artist: 'Michael Jackson', want: 1982, hint: 2001 },
  { title: 'Smells Like Teen Spirit', artist: 'Nirvana', want: 1991 },
  { title: 'Rolling in the Deep', artist: 'Adele', want: 2010, hint: 2011 },
  { title: 'Bohemian Rhapsody', artist: 'Queen', want: 1975, hint: 2018 },
]

console.log('\nearliest release year (binary search over firstreleasedate)')
for (const { title, artist, want, hint } of cases) {
  const before = mb.stats.calls
  const got = await mb.yearFromSearch(title, artist, hint)
  check(`${title} — ${artist} [${mb.stats.calls - before} calls]`, got, want)
}

console.log('\nISRC lookup')
check('Bohemian Rhapsody by ISRC', await mb.yearFromIsrc('GBUM71029604'), 1975)

console.log('\nunresolvable input returns nothing rather than guessing')
check('nonsense title', await mb.yearFromSearch('Zzqxw Nonexistent Track', 'Nobody At All'), undefined)

console.log(
  `\n${JSON.stringify(mb.stats)}\n` +
    (failures === 0
      ? 'Year resolution holds.\n'
      : `${failures} failing — these feed straight into the deck, so fix before building.\n`),
)
process.exit(failures === 0 ? 0 : 1)
