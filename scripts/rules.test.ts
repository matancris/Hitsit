/**
 * Placement rules, checked directly. Run with `npx tsx scripts/rules.test.ts`.
 *
 * These are the rules the whole game rests on, and the boundary cases (first
 * gap, last gap, cards sharing a year) are exactly the ones that are easy to
 * get subtly wrong and hard to notice while playing.
 */

import { firstValidGap, isCorrectPlacement, type HasYear } from '../src/lib/rules.ts'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok ? '' : ` — got ${actual}, want ${expected}`}`)
}

const t = (...years: number[]): HasYear[] => years.map((year) => ({ year }))

console.log('\nboundaries')
check('before the only card', isCorrectPlacement(t(1985), 1970, 0), true)
check('after the only card', isCorrectPlacement(t(1985), 1999, 1), true)
check('before, but belongs after', isCorrectPlacement(t(1985), 1999, 0), false)
check('after, but belongs before', isCorrectPlacement(t(1985), 1970, 1), false)

console.log('\nmiddle')
const three = t(1970, 1985, 2000)
check('slots between 1970 and 1985', isCorrectPlacement(three, 1978, 1), true)
check('slots between 1985 and 2000', isCorrectPlacement(three, 1992, 2), true)
check('1978 rejected at the end', isCorrectPlacement(three, 1978, 3), false)
check('1992 rejected at the start', isCorrectPlacement(three, 1992, 0), false)

console.log('\nsame-year ties go either side (official rule)')
const tie = t(1980, 1990)
check('tie with left neighbour, placed before it', isCorrectPlacement(tie, 1980, 0), true)
check('tie with left neighbour, placed after it', isCorrectPlacement(tie, 1980, 1), true)
check('tie with right neighbour, placed before it', isCorrectPlacement(tie, 1990, 1), true)
check('tie with right neighbour, placed after it', isCorrectPlacement(tie, 1990, 2), true)

console.log('\nduplicate years already on the timeline')
const dupes = t(1975, 1975, 1975)
check('equal year fits at the front', isCorrectPlacement(dupes, 1975, 0), true)
check('equal year fits in the middle', isCorrectPlacement(dupes, 1975, 2), true)
check('equal year fits at the end', isCorrectPlacement(dupes, 1975, 3), true)
check('earlier year only fits at the front', isCorrectPlacement(dupes, 1970, 1), false)

console.log('\nfirstValidGap points at where it belonged')
check('oldest card', firstValidGap(three, 1960), 0)
check('newest card', firstValidGap(three, 2020), 3)
check('middle card', firstValidGap(three, 1990), 2)
check('ties resolve to the leftmost legal gap', firstValidGap(three, 1985), 1)

console.log('\nsingle-card timeline stays sane')
check('empty timeline accepts anything', isCorrectPlacement(t(), 1999, 0), true)
check('empty timeline gap is 0', firstValidGap(t(), 1999), 0)

console.log(failures === 0 ? '\nAll placement rules hold.\n' : `\n${failures} failing.\n`)
process.exit(failures === 0 ? 0 : 1)
