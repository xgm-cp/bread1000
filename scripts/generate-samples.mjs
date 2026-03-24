import sharp from 'sharp'
import { writeFileSync } from 'fs'

const ORIG_BREAD = 'C:/Users/Administrator/.claude/projects/D--XGM-R-bread1000/e8f9a1c4-a34d-40c7-8bf2-a704da041256/tool-results/webfetch-1773903285878-7kjm8w.png'

const SIZE = 512
const RADIUS = 88

const mask = Buffer.from(
  `<svg width="${SIZE}" height="${SIZE}">
    <rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="white"/>
  </svg>`
)

async function makeIcon(svgBuf, filename) {
  const base = await sharp(svgBuf).resize(SIZE, SIZE).png().toBuffer()
  const final = await sharp(base).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
  writeFileSync(filename, final)
}

// ── 샘플 A: 핑크-퍼플 그라디언트 배경 + 흰색 식빵 + 차트 ──
const sampleA = Buffer.from(`
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF3D78"/>
      <stop offset="100%" stop-color="#6B1FA8"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <!-- 배경 원형 장식 -->
  <circle cx="390" cy="130" r="100" fill="#ffffff" opacity="0.07"/>
  <circle cx="110" cy="400" r="80" fill="#ffffff" opacity="0.05"/>
  <!-- 식빵 몸통 -->
  <rect x="130" y="195" width="252" height="178" rx="20" fill="#ffffff" opacity="0.92"/>
  <!-- 식빵 윗부분 -->
  <ellipse cx="256" cy="198" rx="112" ry="45" fill="#ffffff" opacity="0.92"/>
  <!-- 크러스트 느낌 내부 -->
  <rect x="148" y="212" width="216" height="150" rx="12" fill="#FF3D78" opacity="0.12"/>
  <ellipse cx="256" cy="222" rx="94" ry="32" fill="#FF3D78" opacity="0.12"/>
  <!-- 슬라이스 라인 -->
  <line x1="256" y1="160" x2="256" y2="373" stroke="#FF3D78" stroke-width="2" opacity="0.25"/>
  <line x1="210" y1="220" x2="210" y2="373" stroke="#FF3D78" stroke-width="1.5" opacity="0.2"/>
  <line x1="302" y1="220" x2="302" y2="373" stroke="#FF3D78" stroke-width="1.5" opacity="0.2"/>
  <!-- 차트 라인 -->
  <polyline points="148,358 196,328 240,340 284,305 328,278 364,252"
            fill="none" stroke="#ffffff" stroke-width="3.5"
            stroke-linecap="round" stroke-linejoin="round" opacity="0.85" filter="url(#glow)"/>
  <circle cx="364" cy="252" r="6" fill="#ffffff" opacity="0.9" filter="url(#glow)"/>
  <!-- "1000" 텍스트 -->
  <text x="256" y="442" font-family="Arial Black,Arial,sans-serif" font-size="54"
        font-weight="900" font-style="italic" text-anchor="middle"
        fill="#ffffff" opacity="0.95" letter-spacing="-1">1000</text>
</svg>`)

// ── 샘플 B: 다크 배경 + 골드 식빵 + 핑크 차트 ──
const sampleB = Buffer.from(`
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#1A1030"/>
      <stop offset="100%" stop-color="#07090D"/>
    </radialGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFD166"/>
      <stop offset="100%" stop-color="#F4A124"/>
    </linearGradient>
    <linearGradient id="pink" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FF3D78"/>
      <stop offset="100%" stop-color="#FF7DAA"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <circle cx="256" cy="190" r="160" fill="#FF3D78" opacity="0.06"/>
  <!-- 식빵 몸통 -->
  <rect x="82" y="148" width="348" height="210" rx="24" fill="url(#gold)"/>
  <!-- 식빵 윗부분 -->
  <ellipse cx="256" cy="152" rx="150" ry="58" fill="url(#gold)"/>
  <!-- 내부 하이라이트 -->
  <rect x="104" y="168" width="304" height="176" rx="16" fill="#ffffff" opacity="0.1"/>
  <ellipse cx="256" cy="182" rx="126" ry="40" fill="#ffffff" opacity="0.1"/>
  <line x1="256" y1="100" x2="256" y2="358" stroke="#ffffff" stroke-width="1.8" opacity="0.2"/>
  <line x1="172" y1="175" x2="172" y2="358" stroke="#ffffff" stroke-width="1.4" opacity="0.15"/>
  <line x1="340" y1="175" x2="340" y2="358" stroke="#ffffff" stroke-width="1.4" opacity="0.15"/>
  <!-- 핑크 차트 -->
  <polyline points="100,332 156,296 210,312 264,272 318,244 400,210"
            fill="none" stroke="url(#pink)" stroke-width="4"
            stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
  <circle cx="400" cy="210" r="7" fill="#FF3D78" filter="url(#glow)"/>
  <!-- "bread1000" -->
  <text x="256" y="408" font-family="Arial Black,Arial,sans-serif" font-size="38"
        font-weight="700" text-anchor="middle"
        fill="#ffffff" opacity="0.55" letter-spacing="3">bread</text>
  <text x="256" y="474" font-family="Arial Black,Arial,sans-serif" font-size="72"
        font-weight="900" font-style="italic" text-anchor="middle"
        fill="url(#pink)" opacity="0.95" letter-spacing="-2">1000</text>
  <rect x="156" y="484" width="200" height="2.5" rx="1.5" fill="#FF3D78" opacity="0.4"/>
</svg>`)

// ── 샘플 C: 미니멀 / 타이포 중심 "B 1000" ──
const sampleC = Buffer.from(`
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F0A1E"/>
      <stop offset="100%" stop-color="#0A0C0F"/>
    </linearGradient>
    <linearGradient id="gr" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF3D78"/>
      <stop offset="100%" stop-color="#9B2FC9"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <!-- 배경 글로우 -->
  <circle cx="256" cy="240" r="160" fill="#FF3D78" opacity="0.08" filter="url(#glow)"/>
  <!-- 빵 이모지 스타일 단순 도형 -->
  <!-- 크루아상 형태: 초승달 모양 두 개 겹침 -->
  <ellipse cx="256" cy="210" rx="118" ry="62" fill="url(#gr)" opacity="0.9"/>
  <ellipse cx="256" cy="218" rx="96" ry="48" fill="#0F0A1E" opacity="0.85"/>
  <!-- 점선 곡선 -->
  <path d="M 152 210 Q 256 130 360 210" fill="none" stroke="url(#gr)" stroke-width="4"
        stroke-linecap="round" opacity="0.9" filter="url(#glow)"/>
  <!-- 중앙 수직 스택 텍스트 -->
  <text x="256" y="305" font-family="Arial Black,Arial,sans-serif" font-size="72"
        font-weight="900" text-anchor="middle" fill="url(#gr)" opacity="0.95">bread</text>
  <text x="256" y="390" font-family="Arial Black,Arial,sans-serif" font-size="82"
        font-weight="900" font-style="italic" text-anchor="middle"
        fill="#ffffff" opacity="0.95" letter-spacing="-2">1000</text>
  <!-- 하단 라인 -->
  <rect x="156" y="406" width="200" height="3" rx="1.5" fill="url(#gr)" opacity="0.5"/>
</svg>`)

// ── 샘플 D: 원형 배지 스타일 ──
const sampleD = Buffer.from(`
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="#1C0E2E"/>
      <stop offset="100%" stop-color="#08090D"/>
    </radialGradient>
    <linearGradient id="gr" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF3D78"/>
      <stop offset="100%" stop-color="#9B2FC9"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <!-- 외부 링 -->
  <circle cx="256" cy="230" r="158" fill="none" stroke="url(#gr)" stroke-width="3" opacity="0.5"/>
  <!-- 내부 원 배경 -->
  <circle cx="256" cy="230" r="130" fill="url(#gr)" opacity="0.12"/>
  <!-- 🍞 빵 심볼 - 단순 사다리꼴 + 아치 -->
  <rect x="168" y="208" width="176" height="118" rx="14" fill="url(#gr)" opacity="0.9"/>
  <path d="M 168 215 Q 256 148 344 215" fill="url(#gr)" opacity="0.9"/>
  <!-- 윗면 하이라이트 -->
  <path d="M 185 215 Q 256 162 327 215" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.25"/>
  <!-- 빵 내부 라인 -->
  <line x1="256" y1="175" x2="256" y2="326" stroke="#ffffff" stroke-width="1.5" opacity="0.18"/>
  <rect x="168" y="208" width="176" height="118" rx="14" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.15"/>
  <!-- 차트 화살표 -->
  <polyline points="178,310 210,290 240,298 272,274 304,258 330,240"
            fill="none" stroke="#ffffff" stroke-width="2.8"
            stroke-linecap="round" stroke-linejoin="round" opacity="0.8" filter="url(#glow)"/>
  <polygon points="330,240 318,248 322,260" fill="#ffffff" opacity="0.8"/>
  <!-- 하단 텍스트 -->
  <text x="256" y="390" font-family="Arial Black,Arial,sans-serif" font-size="38"
        font-weight="900" text-anchor="middle" fill="#ffffff" opacity="0.6"
        letter-spacing="2">BREAD</text>
  <text x="256" y="448" font-family="Arial Black,Arial,sans-serif" font-size="62"
        font-weight="900" font-style="italic" text-anchor="middle"
        fill="url(#gr)" opacity="0.95" letter-spacing="-2">1000</text>
</svg>`)

await makeIcon(sampleA, 'public/sample-a.png')

// ── 샘플 B: 원본 빵 이미지 + 다크 배경 + 핑크 차트 + bread1000 텍스트 ──
{
  // 1. 배경 (빵 이미지 내부 배경색 #151c2e 와 동일하게)
  const bgSvg = Buffer.from(`
  <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${SIZE}" height="${SIZE}" fill="#151c2e"/>
  </svg>`)
  const bg = await sharp(bgSvg).resize(SIZE, SIZE).png().toBuffer()

  // 2. 원본 빵 이미지 리사이즈
  const bread = await sharp(ORIG_BREAD)
    .resize(340, 340, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  // 3. 차트 + 텍스트 오버레이 (빵 위에 올라갈 레이어)
  const overlaySvg = Buffer.from(`
  <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pink" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#FF3D78"/>
        <stop offset="100%" stop-color="#FF7DAA"/>
      </linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <!-- 핑크 차트 (빵 위에 표시) -->
    <polyline points="60,320 120,288 185,302 250,264 315,238 410,200"
              fill="none" stroke="url(#pink)" stroke-width="4"
              stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
    <circle cx="410" cy="200" r="7" fill="#FF3D78" filter="url(#glow)"/>
    <!-- bread1000 텍스트 -->
    <text x="256" y="422" font-family="Arial Black,Arial,sans-serif" font-size="36"
          font-weight="700" text-anchor="middle"
          fill="#ffffff" opacity="0.55" letter-spacing="3">bread</text>
    <text x="256" y="484" font-family="Arial Black,Arial,sans-serif" font-size="70"
          font-weight="900" font-style="italic" text-anchor="middle"
          fill="url(#pink)" opacity="0.95" letter-spacing="-2">1000</text>
    <rect x="156" y="494" width="200" height="2.5" rx="1.5" fill="#FF3D78" opacity="0.4"/>
  </svg>`)
  const overlay = await sharp(overlaySvg).resize(SIZE, SIZE).png().toBuffer()

  // 4. 순서대로 합성: 배경 → 빵 → 차트+텍스트
  const composed = await sharp(bg)
    .composite([
      { input: bread, top: 28, left: 86, blend: 'over' },
      { input: overlay, top: 0, left: 0, blend: 'over' },
    ])
    .png()
    .toBuffer()

  // 5. 둥근 모서리
  const final = await sharp(composed)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  writeFileSync('public/sample-b.png', final)
}

await makeIcon(sampleC, 'public/sample-c.png')
await makeIcon(sampleD, 'public/sample-d.png')

console.log('✅ 샘플 4종 생성 완료: sample-a ~ sample-d')
