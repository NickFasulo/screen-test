// Renders the app-directory assets: gold-on-charcoal film-frame mark with a
// question mark, same palette as the quiz webview. Usage: node scripts/generate-assets.js
const sharp = require('sharp')
const path = require('path')

const OUT = path.join(__dirname, '..', 'assets')
const GOLD = '#c9a227'
const BG = '#14181c'
const CARD = '#1a2028'
const EDGE = '#2a3442'

const sprockets = (w, h) => {
  const holes = []
  const n = Math.floor(w / 64)
  for (let i = 0; i < n; i++) {
    const x = 24 + i * 64
    holes.push(`<rect x="${x}" y="16" width="28" height="20" rx="4" fill="${BG}"/>`)
    holes.push(`<rect x="${x}" y="${h - 36}" width="28" height="20" rx="4" fill="${BG}"/>`)
  }
  return holes.join('')
}

const mark = (size) => `
  <rect x="${size * 0.08}" y="${size * 0.08}" width="${size * 0.84}" height="${size * 0.84}" rx="${size * 0.1}" fill="${CARD}" stroke="${EDGE}" stroke-width="${size * 0.012}"/>
  ${sprockets(size * 0.84, size * 0.84).replaceAll('x="24', `x="${size * 0.08 + 24}`).replaceAll('y="16', `y="${size * 0.08 + 16}`).replaceAll(`y="${size * 0.84 - 36}`, `y="${size * 0.08 + size * 0.84 - 36}`)}
  <text x="${size * 0.5}" y="${size * 0.6}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${size * 0.52}" fill="${GOLD}">?</text>`

const icon = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" rx="96" fill="${BG}"/>${mark(512)}</svg>`

const tile = `<svg width="560" height="256" xmlns="http://www.w3.org/2000/svg"><rect width="560" height="256" fill="${BG}"/>
<g transform="translate(28,28)">${mark(200)}</g>
<text x="256" y="120" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="52" fill="#e2e8f0">Screen Test</text>
<text x="258" y="168" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#94a3b8">daily film &amp; TV trivia</text></svg>`

const featuring = `<svg width="1500" height="1000" xmlns="http://www.w3.org/2000/svg"><rect width="1500" height="1000" fill="${BG}"/>
<g transform="translate(630,240)">${mark(240)}</g>
<text x="750" y="620" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="96" fill="#e2e8f0">Screen Test</text>
<text x="750" y="700" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" fill="#94a3b8">Daily film &amp; TV trivia for your community</text>
<text x="750" y="780" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="${GOLD}">movies · shows · actors · directors</text></svg>`

async function main() {
  await sharp(Buffer.from(icon)).png().toFile(path.join(OUT, 'devvit-icon-512.png'))
  await sharp(Buffer.from(tile)).png().toFile(path.join(OUT, 'devvit-tile-560x256.png'))
  await sharp(Buffer.from(featuring)).png().toFile(path.join(OUT, 'devvit-featuring-1500x1000.png'))
  console.log('wrote assets/')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
