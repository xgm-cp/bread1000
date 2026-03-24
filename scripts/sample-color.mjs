import sharp from 'sharp'

const SRC = 'C:/Users/Administrator/.claude/projects/D--XGM-R-bread1000/e8f9a1c4-a34d-40c7-8bf2-a704da041256/tool-results/webfetch-1773903285878-7kjm8w.png'
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

const sample = (x, y) => {
  const i = (y * info.width + x) * info.channels
  const hex = `#${data[i].toString(16).padStart(2,'0')}${data[i+1].toString(16).padStart(2,'0')}${data[i+2].toString(16).padStart(2,'0')}`
  return `rgba(${data[i]},${data[i+1]},${data[i+2]},${data[i+3]}) ${hex}`
}

// 빵 이미지 내부의 어두운 배경 영역 (빵 주변, 모서리 안쪽)
console.log('상단 중앙 (512,80):', sample(512, 80))
console.log('하단 중앙 (512,950):', sample(512, 950))
console.log('좌측 중간 (80,512):', sample(80, 512))
console.log('우측 중간 (950,512):', sample(950, 512))
console.log('좌상 안쪽 (150,150):', sample(150, 150))
