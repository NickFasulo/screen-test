// Renders the app-directory assets: cinema-marquee "?" badge — warm
// incandescent chase bulbs in sockets, brass-rimmed sign panels, spotlight
// beams on deep indigo. Usage: node scripts/generate-assets.cjs
const sharp = require('sharp')
const path = require('path')

const OUT = path.join(__dirname, '..', 'assets')
const PINK = '#ff4d8d'
const CYAN = '#4dd8ff'
const WHITE = '#f4f0ff'
const INK = '#15102e'
const FONT = 'Arial, Helvetica, sans-serif'

const DEFS = `<defs>
  <radialGradient id="bgGlow" cx="50%" cy="38%" r="85%">
    <stop offset="0%" stop-color="#33207a"/>
    <stop offset="55%" stop-color="#16103a"/>
    <stop offset="100%" stop-color="#0a0820"/>
  </radialGradient>
  <radialGradient id="bulbA" cx="42%" cy="38%" r="60%">
    <stop offset="0%" stop-color="#fff9e6"/>
    <stop offset="35%" stop-color="#ffd76a"/>
    <stop offset="70%" stop-color="#f5a623"/>
    <stop offset="100%" stop-color="#f5a623" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="disc" cx="50%" cy="40%" r="75%">
    <stop offset="0%" stop-color="#33236b"/>
    <stop offset="100%" stop-color="#1b1440"/>
  </radialGradient>
  <radialGradient id="halo" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#ffc947" stop-opacity="0.5"/>
    <stop offset="55%" stop-color="#ffc947" stop-opacity="0.2"/>
    <stop offset="100%" stop-color="#ffc947" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="vign" cx="50%" cy="50%" r="72%">
    <stop offset="60%" stop-color="#05030f" stop-opacity="0"/>
    <stop offset="100%" stop-color="#05030f" stop-opacity="0.55"/>
  </radialGradient>
  <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#f0d48a"/>
    <stop offset="45%" stop-color="#a8842f"/>
    <stop offset="60%" stop-color="#6e551f"/>
    <stop offset="100%" stop-color="#d9b96a"/>
  </linearGradient>
  <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#181142"/>
    <stop offset="100%" stop-color="#0b0820"/>
  </linearGradient>
</defs>`

// One marquee bulb: metal socket + glass dome + specular highlight.
// level: 2 lit, 1 half-lit, 0 unlit — wired as a fading chase.
const bulb = (x, y, r, level) => {
  const socket = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 1.35).toFixed(1)}" fill="#241c10" stroke="#4d3b1a" stroke-width="${(r * 0.18).toFixed(1)}"/>`
  const dome = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#4a3a20"/>` +
    `<circle cx="${(x - r * 0.34).toFixed(1)}" cy="${(y - r * 0.36).toFixed(1)}" r="${(r * 0.24).toFixed(1)}" fill="#8a7440" opacity="0.45"/>`
  if (level === 0)
    return (
      socket +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 2.0).toFixed(1)}" fill="url(#halo)" opacity="0.14"/>` +
      dome +
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#bulbA)" opacity="0.14"/>`
    )
  const o = level === 1 ? 0.5 : 1
  return (
    socket +
    (level === 1 ? dome : '') +
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 2.9).toFixed(1)}" fill="url(#halo)" opacity="${o}"/>` +
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#bulbA)" opacity="${o}"/>` +
    `<circle cx="${(x - r * 0.34).toFixed(1)}" cy="${(y - r * 0.36).toFixed(1)}" r="${(r * 0.3).toFixed(1)}" fill="#fffdf4" opacity="${0.9 * o}"/>`
  )
}

const chase = (i) => [2, 1, 0][i % 3]

// Ring of chase-wired bulbs around (cx, cy) at radius r. n is snapped to a
// multiple of 3 so the lit -> half -> unlit cycle wraps without a seam.
const bulbRing = (cx, cy, r, spacing, bulbR) => {
  const n = Math.max(9, Math.round((2 * Math.PI * r) / spacing / 3) * 3)
  const out = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    out.push(bulb(cx + Math.cos(a) * r, cy + Math.sin(a) * r, bulbR, chase(i)))
  }
  return out.join('')
}

// Exactly n chase bulbs evenly spaced along the rect perimeter.
const bulbRect = (x, y, w, h, spacing, bulbR) => {
  const P = 2 * (w + h)
  const n = Math.max(6, Math.round(P / spacing / 3) * 3)
  const s = P / n
  const pts = []
  for (let i = 0; i < n; i++) {
    let d = i * s
    if (d < w) pts.push([x + d, y])
    else if ((d -= w) < h) pts.push([x + w, y + d])
    else if ((d -= h) < w) pts.push([x + w - d, y + h])
    else pts.push([x, y + h - (d - w)])
  }
  return pts.map(([px, py], i) => bulb(px, py, bulbR, chase(i))).join('')
}

// The medallion: brass-rimmed plate, bulb ring, inset disc, "?".
const badge = (cx, cy, r) => `
  <circle cx="${cx}" cy="${cy}" r="${r * 1.16}" fill="url(#halo)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${INK}" stroke="url(#brass)" stroke-width="${r * 0.055}"/>
  ${bulbRing(cx, cy, r * 0.84, r * 0.24, r * 0.072)}
  <circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="url(#disc)" stroke="#0e0a26" stroke-width="${r * 0.02}"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="none" stroke="#5a44a8" stroke-width="${r * 0.012}" opacity="0.8"/>
  <text x="${cx}" y="${cy + r * 0.3}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="${r * 0.86}" fill="#0b0820">?</text>
  <text x="${cx}" y="${cy + r * 0.28}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="${r * 0.86}" fill="${WHITE}">?</text>`

const vignette = (w, h) => `<rect width="${w}" height="${h}" fill="url(#vign)"/>`

// Marquee sign panel: inset plate, brass rim, chase bulbs along the inner edge.
const sign = (x, y, w, h, rx, rim, spacing, bulbR) => `
  <rect x="${x - rim}" y="${y - rim}" width="${w + rim * 2}" height="${h + rim * 2}" rx="${rx + rim}" fill="url(#brass)"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="url(#panel)" stroke="#0a0718" stroke-width="2"/>
  ${bulbRect(x + rim * 1.7, y + rim * 1.7, w - rim * 3.4, h - rim * 3.4, spacing, bulbR)}`

const icon = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
${DEFS}
<rect width="512" height="512" rx="104" fill="url(#bgGlow)"/>
${badge(256, 256, 216)}
${vignette(512, 512)}
</svg>`

const tile = `<svg width="560" height="256" xmlns="http://www.w3.org/2000/svg">
${DEFS}
<rect width="560" height="256" fill="url(#bgGlow)"/>
${sign(8, 8, 544, 240, 26, 10, 62, 7)}
${badge(122, 130, 88)}
<text x="228" y="120" font-family="${FONT}" font-weight="bold" font-size="40" letter-spacing="1" fill="${WHITE}">SCREEN TEST</text>
<rect x="230" y="138" width="272" height="4" rx="2" fill="${PINK}"/>
<text x="230" y="176" font-family="${FONT}" font-size="18" letter-spacing="3" fill="${CYAN}">DAILY FILM &amp; TV TRIVIA</text>
${vignette(560, 256)}
</svg>`

const featuring = `<svg width="1500" height="1000" xmlns="http://www.w3.org/2000/svg">
${DEFS}
<rect width="1500" height="1000" fill="url(#bgGlow)"/>
<rect x="30" y="30" width="1440" height="940" rx="44" fill="none" stroke="url(#brass)" stroke-width="12"/>
${bulbRect(64, 64, 1372, 872, 48, 14)}
<text x="750" y="452" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="100" letter-spacing="12" fill="${WHITE}">SCREEN TEST</text>
<rect x="570" y="484" width="360" height="6" rx="3" fill="${PINK}"/>
<text x="750" y="552" text-anchor="middle" font-family="${FONT}" font-size="40" fill="#cbd0e8">The daily movie &amp; TV trivia game</text>
<text x="750" y="620" text-anchor="middle" font-family="${FONT}" font-size="26" letter-spacing="6" fill="${CYAN}">WHO DIRECTED IT · WHO'S IN IT · WHEN IT DROPPED</text>
${vignette(1500, 1000)}
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
