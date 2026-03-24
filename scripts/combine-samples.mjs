import sharp from 'sharp'
import { writeFileSync, readFileSync } from 'fs'

const SIZE = 512
const PAD = 40
const LABEL_H = 60
const COLS = 2
const ROWS = 2
const W = COLS * SIZE + (COLS + 1) * PAD
const H = ROWS * (SIZE + LABEL_H) + (ROWS + 1) * PAD

const labels = ['A', 'B', 'C', 'D']
const files = ['public/sample-a.png', 'public/sample-b.png', 'public/sample-c.png', 'public/sample-d.png']

const composites = []

for (let i = 0; i < 4; i++) {
  const col = i % COLS
  const row = Math.floor(i / COLS)
  const x = PAD + col * (SIZE + PAD)
  const y = PAD + row * (SIZE + LABEL_H + PAD)

  composites.push({ input: files[i], left: x, top: y })

  // 라벨 텍스트 SVG
  const labelSvg = Buffer.from(`
    <svg width="${SIZE}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${SIZE/2}" y="42" font-family="Arial Black,Arial,sans-serif"
            font-size="32" font-weight="900" text-anchor="middle"
            fill="#ffffff" opacity="0.7">Sample ${labels[i]}</text>
    </svg>`)
  composites.push({ input: labelSvg, left: x, top: y + SIZE })
}

const bg = await sharp({
  create: { width: W, height: H, channels: 4, background: { r: 10, g: 10, b: 16, alpha: 1 } }
}).png().toBuffer()

const result = await sharp(bg).composite(composites).png().toBuffer()
writeFileSync('public/samples-preview.png', result)
console.log('✅ samples-preview.png 생성 완료')
