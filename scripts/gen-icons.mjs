// Tiny PNG generator using node:zlib — no external deps required.
// Produces simple branded PNGs at 192 and 512 with a "blade + edge" motif.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { resolve } from 'node:path'

function makePNG(width, height, pixels) {
  function crc32(buf) {
    let c
    const table = []
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
    let crc = 0xffffffff
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
    return (crc ^ 0xffffffff) >>> 0
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
    const typeBuf = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
    return Buffer.concat([len, typeBuf, data, crc])
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8     // bit depth
  ihdr[9] = 6     // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  // Raw image data with filter byte per row
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    pixels.subarray(y * stride, y * stride + stride).copy(raw, y * (stride + 1) + 1)
  }
  const idat = deflateSync(raw)
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function setPx(buf, w, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w || y >= w) return
  const i = (y * w + x) * 4
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a
}

function blend(buf, w, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= w || y >= w) return
  const i = (y * w + x) * 4
  const ia = a / 255
  buf[i] = Math.round(buf[i] * (1 - ia) + r * ia)
  buf[i + 1] = Math.round(buf[i + 1] * (1 - ia) + g * ia)
  buf[i + 2] = Math.round(buf[i + 2] * (1 - ia) + b * ia)
  buf[i + 3] = 255
}

function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4)
  // Background dark with rounded corners
  const radius = Math.round(size * 0.18)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside = true
      if (x < radius && y < radius) {
        const dx = radius - x, dy = radius - y
        if (dx * dx + dy * dy > radius * radius) inside = false
      } else if (x >= size - radius && y < radius) {
        const dx = x - (size - radius - 1), dy = radius - y
        if (dx * dx + dy * dy > radius * radius) inside = false
      } else if (x < radius && y >= size - radius) {
        const dx = radius - x, dy = y - (size - radius - 1)
        if (dx * dx + dy * dy > radius * radius) inside = false
      } else if (x >= size - radius && y >= size - radius) {
        const dx = x - (size - radius - 1), dy = y - (size - radius - 1)
        if (dx * dx + dy * dy > radius * radius) inside = false
      }
      if (inside) setPx(buf, size, x, y, 10, 12, 15, 255)
    }
  }
  // Diagonal blade — a polygon from upper-left to lower-right
  // Angle of about -25 deg. Use parametric line thickness for blade body and bright edge.
  const cx = size / 2, cy = size / 2
  const angle = -25 * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  // Blade extents in rotated space
  const halfLen = size * 0.34
  const bodyTop = -size * 0.06   // top of blade
  const bodyBot = size * 0.04    // bottom of blade body
  const edgeBot = size * 0.07    // bottom edge line (sharp edge)
  const handleStart = halfLen * 0.55
  const handleEnd = halfLen
  for (let py = -size; py < size; py++) {
    for (let px = -halfLen - 4; px < halfLen + 4; px++) {
      const sx = cx + px * cos - py * sin
      const sy = cy + px * sin + py * cos
      if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue
      const ix = Math.round(sx), iy = Math.round(sy)
      // Handle region (right side)
      if (px >= handleStart && px <= handleEnd && py > bodyTop - 6 && py < edgeBot + 4) {
        const t = (py - (bodyTop - 6)) / ((edgeBot + 4) - (bodyTop - 6))
        const shade = Math.round(28 + (1 - t) * 18)
        setPx(buf, size, ix, iy, shade, shade + 4, shade + 8, 255)
        continue
      }
      // Blade body
      if (px >= -halfLen && px < handleStart && py >= bodyTop && py <= bodyBot) {
        const t = (py - bodyTop) / (bodyBot - bodyTop)
        const g = Math.round(220 - t * 110)
        setPx(buf, size, ix, iy, g, g + 4, g + 10, 255)
        continue
      }
      // Sharp glowing edge
      if (px >= -halfLen && px < handleStart && py > bodyBot && py <= edgeBot) {
        const t = (py - bodyBot) / (edgeBot - bodyBot)
        const r = Math.round(0 + (1 - t) * 50)
        const g = Math.round(229 - t * 40)
        const b = 255
        blend(buf, size, ix, iy, r, g, b, 230)
        continue
      }
    }
  }
  // Outer edge glow halo
  for (let py = -size; py < size; py++) {
    for (let px = -halfLen; px < handleStart; px++) {
      if (py < edgeBot || py > edgeBot + size * 0.04) continue
      const sx = cx + px * cos - py * sin
      const sy = cy + px * sin + py * cos
      if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue
      const ix = Math.round(sx), iy = Math.round(sy)
      const t = (py - edgeBot) / (size * 0.04)
      blend(buf, size, ix, iy, 0, 229, 255, Math.round(90 * (1 - t)))
    }
  }
  return makePNG(size, size, buf)
}

mkdirSync(resolve('public'), { recursive: true })
writeFileSync(resolve('public/icon-192.png'), drawIcon(192))
writeFileSync(resolve('public/icon-512.png'), drawIcon(512))
console.log('Generated icon-192.png and icon-512.png')
