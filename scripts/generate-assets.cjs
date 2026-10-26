// Renders the app-directory assets: cinema-marquee "?" badge — warm
// incandescent chase bulbs in sockets, brass rims on deep indigo.
// Text is rendered via Righteous (OFL, bundled in scripts/fonts) converted
// to vector paths so output is identical on any machine.
// Usage: node scripts/generate-assets.cjs
const sharp = require('sharp')
const path = require('path')
const TextToSVG = require('text-to-svg')

const OUT = path.join(__dirname, '..', 'assets')
const PINK = '#ff4d8d'
const CYAN = '#4dd8ff'
const WHITE = '#f4f0ff'
const AMBER = '#ffc947'
const INK = '#15102e'

const tts = TextToSVG.loadSync(path.join(__dirname, 'fonts', 'Righteous-Regular.ttf'))
const txt = (str, x, y, size, fill, letterSpacing = 0) =>
  `<path d="${tts.getD(str, { x, y, fontSize: size, anchor: 'center baseline', letterSpacing })}" fill="${fill}"/>`
const txtMid = (str, x, y, size, fill) =>
  `<path d="${tts.getD(str, { x, y, fontSize: size, anchor: 'center middle' })}" fill="${fill}"/>`

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
// glow scales halo strength (used for the video pulse).
const bulb = (x, y, r, level, glow = 1) => {
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
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 2.9).toFixed(1)}" fill="url(#halo)" opacity="${Math.min(1, o * glow)}"/>` +
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

// Exactly n chase bulbs evenly spaced along the rect perimeter. `phase`
// shifts the chase cycle (video frames); `glow` scales halo strength.
const bulbRect = (x, y, w, h, spacing, bulbR, phase = 0, glow = 1) => {
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
  return pts.map(([px, py], i) => bulb(px, py, bulbR, chase(i + phase), glow)).join('')
}

// The medallion: brass-rimmed plate, bulb ring, inset disc, "?".
const badge = (cx, cy, r) => `
  <circle cx="${cx}" cy="${cy}" r="${r * 1.16}" fill="url(#halo)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${INK}" stroke="url(#brass)" stroke-width="${r * 0.055}"/>
  ${bulbRing(cx, cy, r * 0.84, r * 0.24, r * 0.072)}
  <circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="url(#disc)" stroke="#0e0a26" stroke-width="${r * 0.02}"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="none" stroke="#5a44a8" stroke-width="${r * 0.012}" opacity="0.8"/>
  ${txtMid('?', cx + r * 0.025, cy + r * 0.03, r * 0.86, '#0b0820')}
  ${txtMid('?', cx + r * 0.025, cy, r * 0.86, AMBER)}`

const vignette = (w, h) => `<rect width="${w}" height="${h}" fill="url(#vign)"/>`

const icon = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
${DEFS}
<rect width="512" height="512" rx="104" fill="url(#bgGlow)"/>
${badge(256, 256, 216)}
${vignette(512, 512)}
</svg>`

const tile = `<svg width="560" height="256" xmlns="http://www.w3.org/2000/svg">
${DEFS}
<rect width="560" height="256" fill="url(#bgGlow)"/>
<rect x="12" y="12" width="536" height="232" rx="20" fill="none" stroke="url(#brass)" stroke-width="6"/>
${bulbRect(32, 32, 496, 192, 28, 8)}
${txt('SCREEN TEST', 280, 118, 40, AMBER, 0.04)}
<rect x="180" y="140" width="200" height="4" rx="2" fill="${PINK}"/>
${txt('DAILY FILM & TV TRIVIA', 280, 174, 17, CYAN, 0.16)}
${vignette(560, 256)}
</svg>`

const featuringSvg = (phase = 0, glow = 1) => `<svg width="1500" height="1000" xmlns="http://www.w3.org/2000/svg">
${DEFS}
<rect width="1500" height="1000" fill="url(#bgGlow)"/>
<rect x="30" y="95" width="1440" height="810" rx="44" fill="none" stroke="url(#brass)" stroke-width="12"/>
${bulbRect(64, 129, 1372, 742, 48, 14, phase, glow)}
${txt('SCREEN TEST', 750, 440, 100, AMBER, 0.1)}
<rect x="570" y="505" width="360" height="6" rx="3" fill="${PINK}"/>
${txt('The daily movie & TV trivia game', 750, 590, 40, '#cbd0e8')}
${txt("WHO DIRECTED IT · WHO'S IN IT · WHEN IT DROPPED", 750, 656, 26, CYAN, 0.18)}
${vignette(1500, 1000)}
</svg>`

async function main() {
  await sharp(Buffer.from(icon)).png().toFile(path.join(OUT, 'devvit-icon-512.png'))
  await sharp(Buffer.from(tile)).png().toFile(path.join(OUT, 'devvit-tile-560x256.png'))
  await sharp(Buffer.from(featuringSvg())).png().toFile(path.join(OUT, 'devvit-featuring-1500x1000.png'))
  // The form's optional "fallback asset" is the static stand-in for a video
  // featuring asset — the same art works.
  await sharp(Buffer.from(featuringSvg())).png().toFile(path.join(OUT, 'devvit-fallback-1500x1000.png'))
  console.log('wrote assets/')

  // --video: 8s seamless loop for the featuring slot (the only one that
  // accepts video; requires 6-15s). Chase steps every ~0.33s like a real
  // marquee; halos pulse gently.
  if (process.argv.includes('--video')) {
    const fs = require('fs')
    const HME = require('h264-mp4-encoder')
    const encoder = await HME.createH264MP4Encoder()
    encoder.width = 1500
    encoder.height = 1000
    encoder.frameRate = 24
    encoder.quantizationParameter = 17
    encoder.speed = 2
    encoder.groupOfPictures = 24
    encoder.initialize()
    const FRAMES = 192
    for (let f = 0; f < FRAMES; f++) {
      const phase = Math.floor(f / 8) % 3
      // cos peaks at f=0 so frame 0 matches the static fallback PNG exactly
      const glow = 0.85 + 0.15 * Math.cos((2 * Math.PI * 3 * f) / FRAMES)
      const { data } = await sharp(Buffer.from(featuringSvg(phase, glow)))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      encoder.addFrameRgba(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
      if (f % 30 === 0) console.log(`frame ${f}/${FRAMES}`)
    }
    encoder.finalize()
    fs.writeFileSync(
      path.join(OUT, 'devvit-featuring-1500x1000.mp4'),
      Buffer.from(encoder.FS.readFile(encoder.outputFilename)),
    )
    encoder.delete()
    console.log('wrote devvit-featuring-1500x1000.mp4')
  }

  // --gif: animated fallback for the featuring video (Reddit asks for a GIF
  // fallback when featuring is a video: 3:2, 1000-1500px wide, 3-10s looped,
  // <=3MB). 48 frames at 12fps = 3.84s. Shared palette from frame 0 plus
  // transparent-index diffs against the previous frame keep the file small.
  if (process.argv.includes('--gif')) {
    const fs = require('fs')
    const { GIFEncoder, quantize, applyPalette } = require('gifenc')
    const W = 1000
    const H = 667
    const FRAMES = 48
    const TIDX = 255
    const gif = GIFEncoder()
    let palette = null
    let prev = null
    for (let f = 0; f < FRAMES; f++) {
      const phase = Math.floor(f / 4) % 3
      const glow = 0.85 + 0.15 * Math.cos((2 * Math.PI * 2 * f) / FRAMES)
      const { data } = await sharp(Buffer.from(featuringSvg(phase, glow)))
        .resize(W, H)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      if (!palette) palette = quantize(data, TIDX)
      const idx = applyPalette(data, palette, 'rgba')
      if (!prev) {
        gif.writeFrame(idx, W, H, { palette, delay: 100, repeat: 0 })
      } else {
        const diff = new Uint8Array(idx.length)
        for (let i = 0; i < idx.length; i++) diff[i] = idx[i] === prev[i] ? TIDX : idx[i]
        gif.writeFrame(diff, W, H, {
          palette: palette.concat([[0, 0, 0]]),
          transparent: true,
          transparentIndex: TIDX,
          delay: 100
        })
      }
      prev = idx
      if (f % 12 === 0) console.log(`gif frame ${f}/${FRAMES}`)
    }
    gif.finish()
    fs.writeFileSync(path.join(OUT, 'devvit-fallback-1000x667.gif'), Buffer.from(gif.bytes()))
    console.log('wrote devvit-fallback-1000x667.gif')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
