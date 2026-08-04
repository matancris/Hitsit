/**
 * Guard cases for preview matching.
 *
 *   npx tsx scripts/previews.test.ts
 *
 * The pure guard cases are instant. The live lookups hit iTunes and Deezer at
 * ~300ms per call.
 *
 * Every artist case here is one that actually came up while testing against the
 * real deck — the naive comparison rejected two correct matches before `&` was
 * normalised, which would have silently dropped those tracks from preview mode.
 */

import { Previews, accepts, artistMatches, durationMatches } from './previews.ts'

let failures = 0

function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected
  if (!ok) failures++
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok ? '' : ` — got ${actual}, want ${expected}`}`)
}

console.log('\nartist matching')
check('identical', artistMatches('Nirvana', 'Nirvana'), true)
check('ampersand vs and', artistMatches('KC & The Sunshine Band', 'KC and the Sunshine Band'), true)
check('featured artist on one side', artistMatches('Lady Gaga', 'Lady Gaga & Bradley Cooper'), true)
check('punctuation and case', artistMatches('Gene Vincent & His Blue Caps', 'gene vincent and his blue caps'), true)
// Sinéad O'Connor is in the deck and providers spell her both ways; without
// accent folding her track would silently lose its preview.
check('accents fold together', artistMatches("Sinéad O'Connor", "Sinead O'Connor"), true)
check('accents fold, other direction', artistMatches('Beyoncé', 'Beyonce'), true)
check('genuinely different artist', artistMatches('Nirvana', 'The Smashing Pumpkins'), false)
check('karaoke impostor', artistMatches('Queen', 'Karaoke All Stars'), false)
check('empty is never a match', artistMatches('Queen', ''), false)

console.log('\nduration matching (rejects edits, live cuts, covers)')
check('exact', durationMatches(200_000, 200_000), true)
check('within 15%', durationMatches(200_000, 215_000), true)
check('just outside 15%', durationMatches(200_000, 240_000), false)
check('half-length radio edit', durationMatches(360_000, 180_000), false)
check('unknown on one side passes', durationMatches(undefined, 200_000), true)
check('unknown on both sides passes', durationMatches(undefined, undefined), true)

console.log('\nfull acceptance')
const good = { url: 'https://x/p.m4a', artist: 'Queen', durationMs: 355_000 }
check('good candidate', accepts(good, 'Queen', 354_000), true)
check('no url', accepts({ ...good, url: undefined }, 'Queen', 354_000), false)
check('wrong artist', accepts(good, 'Nirvana', 354_000), false)
check('wrong duration', accepts(good, 'Queen', 180_000), false)

console.log('\nlive lookup')
const p = new Previews()

const bohemian = await p.find('Bohemian Rhapsody', 'Queen', 354_000)
check('finds a real track', Boolean(bohemian?.url), true)
check('artist is right', bohemian ? artistMatches('Queen', bohemian.artist) : false, true)

// The 1939 Glenn Miller entry is where Deezer came up empty and iTunes did not,
// which is the whole reason there are two providers.
const deepCatalogue = await p.find('In the Mood', 'Glenn Miller')
check('reaches deep catalogue', Boolean(deepCatalogue?.url), true)

// Nothing should come back for a track that does not exist, and crucially it
// should return null rather than the nearest loose match.
const nonsense = await p.find('Zzqxw Nonexistent Track', 'Nobody At All')
check('refuses to guess', nonsense, null)

console.log(
  `\n${JSON.stringify(p.stats)}\n` +
    (failures === 0
      ? 'Preview matching holds.\n'
      : `${failures} failing — a bad match is worse than no audio, so fix before building.\n`),
)
process.exit(failures === 0 ? 0 : 1)
