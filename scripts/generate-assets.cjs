// Renders the app-directory assets: cinema-marquee "?" badge — neon pink/cyan
// accents and warm bulbs on deep indigo. Usage: node scripts/generate-assets.cjs
const sharp = require('sharp')
const path = require('path')

const OUT = path.join(__dirname, '..', 'assets')
const PINK = '#ff4d8d'
const CYAN = '#4dd8ff'
const WHITE = '#f4f0ff'
const INK = '#1b1440'

const DEFS = `<defs>
  <radialGradient id="bgGlow" cx="50%" cy="38%" r="85%">
    <stop offset="0%" stop-color="#33207a"/>
    <stop offset="55%" stop-color="#16103a"/>
    <stop offset="100%" stop-color="#0a0820"/>
  </radialGradient>
  <radialGradient id="bulbA" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#fff3d0"/>
    <stop offset="45%" stop-color="#ffc947"/>
    <stop offset="100%" stop-color="#ffc947" stop-opacity="0"/>
  </radialGradient>
</defs>`

// All-warm marquee bulbs; every 3rd is dim to suggest a chaser pattern.
const bulbRing = (cx, cy, r, n, bulbR) => {
  const out = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    const dim = i % 3 === 2
    out.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${bulbR}" fill="${dim ? '#4a3a20' : 'url(#bulbA)'}"/>`,
    )
  }
  return out.join('')
}

// Bulbs along the inside edge of a WxH frame, inset by `pad`.
const bulbFrame = (w, h, pad, spacing, bulbR) => {
  const pts = []
  for (let x = pad; x <= w - pad; x += spacing) pts.push([x, pad], [x, h - pad])
  for (let y = pad + spacing; y <= h - pad - spacing / 2; y += spacing) pts.push([pad, y], [w - pad, y])
  return pts
    .map(
      ([x, y], i) =>
        `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${bulbR}" fill="${i % 3 === 2 ? '#4a3a20' : 'url(#bulbA)'}"/>`,
    )
    .join('')
}

// The medallion: bulb ring + inner disc + big "?".
const badge = (cx, cy, outerR) => `
  <circle cx="${cx}" cy="${cy}" r="${outerR * 1.08}" fill="${INK}" opacity="0.85"/>
  ${bulbRing(cx, cy, outerR, Math.max(10, Math.round(outerR / 9)), outerR * 0.055)}
  <circle cx="${cx}" cy="${cy}" r="${outerR * 0.78}" fill="#241a55" stroke="#4a3590" stroke-width="${outerR * 0.02}"/>
  <text x="${cx}" y="${cy + outerR * 0.42}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${outerR * 1.15}" fill="${WHITE}">?</text>`

const beams = (w, h, targetX, targetY) => `
  <polygon points="${w * 0.06},0 ${w * 0.2},0 ${targetX + w * 0.09},${targetY} ${targetX - w * 0.03},${targetY}" fill="${CYAN}" opacity="0.07"/>
  <polygon points="${w * 0.8},0 ${w * 0.94},0 ${targetX + w * 0.03},${targetY} ${targetX - w * 0.09},${targetY}" fill="${PINK}" opacity="0.07"/>`

const FONT = 'Arial, Helvetica, sans-serif'

const icon = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
${DEFS}
<rect width="512" height="512" rx="104" fill="url(#bgGlow)"/>
${beams(512, 512, 256, 320)}
${badge(256, 256, 190)}
</svg>`

const tile = `<svg width="560" height="256" xmlns="http://www.w3.org/2000/svg">
${DEFS}
<rect width="560" height="256" fill="url(#bgGlow)"/>
${bulbFrame(560, 256, 14, 56, 6)}
${beams(560, 256, 120, 210)}
${badge(104, 134, 72)}
<text x="194" y="122" font-family="${FONT}" font-weight="bold" font-size="44" letter-spacing="1" fill="${WHITE}">SCREEN TEST</text>
<rect x="196" y="140" width="316" height="4" rx="2" fill="${PINK}"/>
<text x="196" y="180" font-family="${FONT}" font-size="19" letter-spacing="4" fill="${CYAN}">DAILY FILM &amp; TV TRIVIA</text>
</svg>`

const featuring = `<svg width="1500" height="1000" xmlns="http://www.w3.org/2000/svg">
${DEFS}
<rect width="1500" height="1000" fill="url(#bgGlow)"/>
${beams(1500, 1000, 750, 640)}
${bulbFrame(1500, 1000, 34, 64, 11)}
${badge(750, 380, 190)}
<text x="750" y="700" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="108" letter-spacing="12" fill="${WHITE}">SCREEN TEST</text>
<rect x="560" y="732" width="380" height="6" rx="3" fill="${PINK}"/>
<text x="750" y="800" text-anchor="middle" font-family="${FONT}" font-size="42" fill="#cbd0e8">The daily movie &amp; TV trivia game</text>
<text x="750" y="868" text-anchor="middle" font-family="${FONT}" font-size="28" letter-spacing="6" fill="${CYAN}">WHO DIRECTED IT · WHO'S IN IT · WHEN IT DROPPED</text>
</svg>`

async function main() {
  await sharp(Buffer.from(icon)).png().toFile(path.join(OUT, 'devvit-icon-512.png'))
  await sharp(Buffer.from(tile)).png().toFile(path.join(OUT, 'devvit-tile-560x256.png'))
  await sharp(Buffer.from(featuring)).png().toFile(path.join(OUT, 'devvit-featuring-1500x1000.png'))
  // The form's optional "fallback asset" is the static stand-in for a video
  // featuring asset — the same art works.
  await sharp(Buffer.from(featuring)).png().toFile(path.join(OUT, 'devvit-fallback-1500x1000.png'))
  console.log('wrote assets/')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
