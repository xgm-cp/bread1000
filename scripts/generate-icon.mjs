import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'

const SRC = 'C:/Users/Administrator/.claude/projects/D--XGM-R-bread1000/e8f9a1c4-a34d-40c7-8bf2-a704da041256/tool-results/webfetch-1773903285878-7kjm8w.png'
const SIZE = 512

// 원본 이미지를 중앙에 배치하고 배경+효과 추가
async function generate() {
  // 1. 원본 이미지를 420px로 리사이즈 (중앙 컨텐츠용)
  const resized = await sharp(SRC)
    .resize(420, 420, { fit: 'cover' })
    .png()
    .toBuffer()

  // 2. 대비·채도·선명도 향상
  const enhanced = await sharp(resized)
    .modulate({ brightness: 1.08, saturation: 1.25 })
    .sharpen({ sigma: 1.2 })
    .png()
    .toBuffer()

  // 3. 512x512 다크 배경 (#0A0C0F) 위에 합성
  const background = await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 10, g: 12, b: 15, alpha: 1 }
    }
  })
    .png()
    .toBuffer()

  // 4. 배경 위에 향상된 이미지 중앙 합성
  const composited = await sharp(background)
    .composite([{ input: enhanced, top: 46, left: 46 }])
    .png()
    .toBuffer()

  // 5. 둥근 모서리 마스크 (radius 80)
  const radius = 80
  const mask = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}">
      <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>`
  )

  // 6. 핑크-퍼플 그라디언트 테두리 오버레이
  const border = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#FF3D78;stop-opacity:1"/>
          <stop offset="100%" style="stop-color:#9B2FC9;stop-opacity:1"/>
        </linearGradient>
        <linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#FF3D78;stop-opacity:0.6"/>
          <stop offset="100%" style="stop-color:#9B2FC9;stop-opacity:0.6"/>
        </linearGradient>
      </defs>
      <!-- 외부 글로우 (블러 효과 없이 다중 테두리로 표현) -->
      <rect x="3" y="3" width="${SIZE-6}" height="${SIZE-6}" rx="${radius-2}" ry="${radius-2}"
            fill="none" stroke="url(#g2)" stroke-width="6"/>
      <!-- 메인 테두리 -->
      <rect x="8" y="8" width="${SIZE-16}" height="${SIZE-16}" rx="${radius-5}" ry="${radius-5}"
            fill="none" stroke="url(#g)" stroke-width="4"/>
    </svg>`
  )

  // 7. 최종 합성 + 둥근 모서리 적용
  const final = await sharp(composited)
    .composite([{ input: border, blend: 'over' }])
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  // 8. 저장
  writeFileSync('public/apple-touch-icon.png', final)

  // 192x192 버전
  const icon192 = await sharp(final).resize(192, 192).png().toBuffer()
  writeFileSync('public/icon-192.png', icon192)

  // 512x512 그대로
  writeFileSync('public/icon-512.png', final)

  console.log('✅ 아이콘 생성 완료!')
  console.log('  - public/apple-touch-icon.png (512px, iOS용)')
  console.log('  - public/icon-192.png (192px, Android/manifest용)')
  console.log('  - public/icon-512.png (512px, manifest용)')
}

generate().catch(console.error)
