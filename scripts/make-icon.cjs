const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

// Generate a 22x22 white-on-transparent "XO" PNG for the macOS menu bar tray
const W = 22, H = 22

const pixels = new Uint8Array(W * H * 4) // all transparent by default

function setPixel(x, y) {
  if (x < 0 || x >= W || y < 0 || y >= H) return
  const i = (y * W + x) * 4
  pixels[i] = 255; pixels[i+1] = 255; pixels[i+2] = 255; pixels[i+3] = 255
}

// 3x5 pixel bitmaps for X and O
const X_GLYPH = [
  [1,0,1],
  [0,1,0],
  [0,1,0],
  [0,1,0],
  [1,0,1],
]
const O_GLYPH = [
  [1,1,1],
  [1,0,1],
  [1,0,1],
  [1,0,1],
  [1,1,1],
]

const scale = 2  // each pixel = 2x2 actual pixels
const totalW = (3 + 1 + 3) * scale  // X + gap + O = 14px
const startX = Math.floor((W - totalW) / 2)
const startY = Math.floor((H - 5 * scale) / 2)

X_GLYPH.forEach((row, ry) => {
  row.forEach((on, rx) => {
    if (!on) return
    for (let sy = 0; sy < scale; sy++)
      for (let sx = 0; sx < scale; sx++)
        setPixel(startX + rx * scale + sx, startY + ry * scale + sy)
  })
})

const oStartX = startX + 3 * scale + 1 * scale  // after X + 1px gap
O_GLYPH.forEach((row, ry) => {
  row.forEach((on, rx) => {
    if (!on) return
    for (let sy = 0; sy < scale; sy++)
      for (let sx = 0; sx < scale; sx++)
        setPixel(oStartX + rx * scale + sx, startY + ry * scale + sy)
  })
})

// Build PNG
const rows = []
for (let y = 0; y < H; y++) {
  const row = Buffer.alloc(W * 4)
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    row[x*4] = pixels[i]; row[x*4+1] = pixels[i+1]
    row[x*4+2] = pixels[i+2]; row[x*4+3] = pixels[i+3]
  }
  rows.push(row)
}

const raw = Buffer.concat(rows.map(r => Buffer.concat([Buffer.from([0]), r])))
const idat = zlib.deflateSync(raw)

function crc32(buf) {
  const t = []
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c
  }
  let c = 0xffffffff
  for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const lb = Buffer.alloc(4); lb.writeUInt32BE(data.length)
  const tb = Buffer.from(type)
  const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])))
  return Buffer.concat([lb, tb, data, cb])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8; ihdr[9] = 6  // 8-bit RGBA

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
])

const outPath = path.join(__dirname, '../public/tray-icon.png')
fs.writeFileSync(outPath, png)
console.log('Written:', outPath, '(' + png.length + ' bytes)')
