/**
 * Generates the PWA icons from the same 45rpm mark as the favicon.
 *
 *   npx tsx scripts/make-icons.ts
 *
 * Two shapes are produced. The plain icon fills the tile. The maskable one
 * keeps its artwork inside the centre 80%, because Android crops maskable
 * icons to whatever shape the launcher uses — anything near the edge is lost.
 */

import sharp from 'sharp'
import { resolve } from 'node:path'

const INK = '#12131A'
const RING = '#C2417E'
const INNER = '#D9A441'
const HOLE = '#F2EFE6'

/** `scale` shrinks the mark toward the centre for the maskable safe zone. */
function mark(size: number, scale: number): string {
  const c = size / 2
  const r = (size / 2) * scale
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${INK}"/>
  <circle cx="${c}" cy="${c}" r="${r * 0.78}" fill="none" stroke="${RING}" stroke-width="${r * 0.1}"/>
  <circle cx="${c}" cy="${c}" r="${r * 0.43}" fill="none" stroke="${INNER}" stroke-width="${r * 0.07}"/>
  <circle cx="${c}" cy="${c}" r="${r * 0.13}" fill="${HOLE}"/>
</svg>`
}

const targets = [
  { file: 'icon-192.png', size: 192, scale: 0.92 },
  { file: 'icon-512.png', size: 512, scale: 0.92 },
  { file: 'icon-512-maskable.png', size: 512, scale: 0.7 },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.92 },
]

for (const { file, size, scale } of targets) {
  const out = resolve('public', file)
  await sharp(Buffer.from(mark(size, scale))).png().toFile(out)
  console.log(`  ${file}  ${size}×${size}`)
}

console.log('\nIcons written to public/')
