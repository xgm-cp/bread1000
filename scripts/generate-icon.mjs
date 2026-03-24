import sharp from 'sharp'
import { writeFileSync } from 'fs'

const SIZE = 512
const RADIUS = 88

// 둥근 모서리 마스크
const mask = Buffer.from(
  `<svg width="${SIZE}" height="${SIZE}">
    <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="white"/>
  </svg>`
)

// 아이콘 SVG 디자인
// - 다크 배경 + 핑크-퍼플 방사형 그라디언트 배경
// - 빵 모양 (심플한 기하학적 식빵 + 상단 곡선)
// - 우상향 차트 라인 (예측 게임 의미)
// - 하단 "1000" 텍스트
const svg = Buffer.from(`
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- 배경 그라디언트 -->
    <radialGradient id="bg" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#1E1030"/>
      <stop offset="100%" stop-color="#080A0E"/>
    </radialGradient>

    <!-- 빵 그라디언트 -->
    <linearGradient id="bread" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF3D78"/>
      <stop offset="100%" stop-color="#9B2FC9"/>
    </linearGradient>

    <!-- 차트 그라디언트 -->
    <linearGradient id="chart" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FF3D78" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#FF3D78" stop-opacity="0"/>
    </linearGradient>

    <!-- 글로우 필터 -->
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <!-- 부드러운 글로우 -->
    <filter id="softglow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- 배경 -->
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>

  <!-- 배경 미세 글로우 원 -->
  <circle cx="200" cy="190" r="130" fill="#FF3D78" opacity="0.07"/>
  <circle cx="310" cy="310" r="100" fill="#9B2FC9" opacity="0.08"/>

  <!-- ====== 식빵 아이콘 (중앙) ====== -->
  <!-- 식빵 몸통 (둥근 사각형) -->
  <rect x="136" y="210" width="240" height="168" rx="18" ry="18" fill="url(#bread)" opacity="0.95"/>

  <!-- 식빵 윗부분 (둥근 봉긋한 모양) -->
  <ellipse cx="256" cy="213" rx="106" ry="42" fill="url(#bread)" opacity="0.95"/>

  <!-- 식빵 내부 밝은 하이라이트 -->
  <rect x="152" y="224" width="208" height="140" rx="12" ry="12" fill="#ffffff" opacity="0.07"/>
  <ellipse cx="256" cy="225" rx="88" ry="30" fill="#ffffff" opacity="0.07"/>

  <!-- 식빵 테두리 라인 (크러스트 느낌) -->
  <rect x="136" y="210" width="240" height="168" rx="18" ry="18"
        fill="none" stroke="#ffffff" stroke-width="2" opacity="0.18"/>

  <!-- 식빵 슬라이스 세로선 -->
  <line x1="220" y1="230" x2="220" y2="368" stroke="#ffffff" stroke-width="1.5" opacity="0.15"/>
  <line x1="256" y1="175" x2="256" y2="378" stroke="#ffffff" stroke-width="1.5" opacity="0.15"/>
  <line x1="292" y1="230" x2="292" y2="368" stroke="#ffffff" stroke-width="1.5" opacity="0.15"/>

  <!-- ====== 우상향 차트 라인 ====== -->
  <!-- 차트 채움 영역 -->
  <polygon points="148,355 192,320 236,332 280,295 324,270 360,248 360,378 148,378"
           fill="url(#chart)" opacity="0.35"/>

  <!-- 차트 라인 -->
  <polyline points="148,355 192,320 236,332 280,295 324,270 360,248"
            fill="none" stroke="#FF3D78" stroke-width="3"
            stroke-linecap="round" stroke-linejoin="round"
            opacity="0.9" filter="url(#glow)"/>

  <!-- 차트 끝점 원 -->
  <circle cx="360" cy="248" r="5" fill="#FF3D78" opacity="0.95" filter="url(#glow)"/>

  <!-- ====== 하단 "1000" 텍스트 ====== -->
  <text x="256" y="438"
        font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
        font-size="52" font-weight="900" font-style="italic"
        text-anchor="middle" fill="url(#bread)" opacity="0.92"
        letter-spacing="-1">1000</text>

  <!-- 1000 아래 얇은 라인 -->
  <rect x="176" y="448" width="160" height="2" rx="1"
        fill="url(#bread)" opacity="0.4"/>
</svg>
`)

async function generate() {
  // SVG → PNG 합성 + 둥근 모서리 적용
  const base = await sharp(svg)
    .resize(SIZE, SIZE)
    .png()
    .toBuffer()

  const final = await sharp(base)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  writeFileSync('public/apple-touch-icon.png', final)
  writeFileSync('public/icon-512.png', final)

  const icon192 = await sharp(final).resize(192, 192).png().toBuffer()
  writeFileSync('public/icon-192.png', icon192)

  console.log('✅ 아이콘 생성 완료!')
}

generate().catch(console.error)
