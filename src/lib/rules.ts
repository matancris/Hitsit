/**
 * The placement rules, kept free of React, zustand and path aliases so the
 * store and the test can both import the exact same implementation.
 */

export interface HasYear {
  year: number
}

/**
 * Gap `i` means "insert before timeline[i]", so valid gaps are 0..length.
 * A placement is correct when the card's year sits within the bounds of its
 * neighbours. The `<=` on both comparisons is what lets cards sharing a year
 * sit on either side of each other, matching the printed rule.
 */
export function isCorrectPlacement(
  timeline: readonly HasYear[],
  year: number,
  gapIndex: number,
): boolean {
  const leftOk = gapIndex === 0 || timeline[gapIndex - 1].year <= year
  const rightOk = gapIndex === timeline.length || year <= timeline[gapIndex].year
  return leftOk && rightOk
}

/** The leftmost gap the card would have been accepted in — used to show the miss. */
export function firstValidGap(timeline: readonly HasYear[], year: number): number {
  for (let i = 0; i <= timeline.length; i++) {
    if (isCorrectPlacement(timeline, year, i)) return i
  }
  return timeline.length
}
