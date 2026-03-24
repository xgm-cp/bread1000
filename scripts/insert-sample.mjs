import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://auronbamuigpeuymeuke.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cm9uYmFtdWlncGV1eW1ldWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MTY0MzMsImV4cCI6MjA4OTE5MjQzM30.LcZlyP7OZmp0817xpBecfCxNhjsFTqgMp06w_oz7xok'
)

const now = new Date().toISOString()
const today = now.slice(0, 10)

// 1. 종가관리내역에 오늘 날짜 기준 데이터 삽입
const { error: masterError } = await supabase.from('종가관리내역').insert({
  기준일자: today,
  종목코드: '0001',
  종목코드명: '코스피',
  종가: 2650.50,
  등록일시: now,
  변경일시: now,
})
if (masterError && masterError.code !== '23505') { // 중복이면 무시
  console.error('❌ 종가관리내역 삽입 실패:', masterError.message)
  process.exit(1)
} else {
  console.log('✅ 종가관리내역 준비 완료 (기준일자:', today, '종목코드: 0001)')
}

// 2. 종가예측내역 샘플 삽입
const samples = [
  { 아이디: 'ykim',   예측종가: 2658.50, 종가증감구분: 'U', 종가증감값: 8.00 },
  { 아이디: 'yskim1', 예측종가: 2645.30, 종가증감구분: 'D', 종가증감값: 5.20 },
  { 아이디: 'yskim2', 예측종가: 2672.10, 종가증감구분: 'U', 종가증감값: 21.60 },
]

for (const s of samples) {
  const { error } = await supabase.from('종가예측내역').insert({
    기준일자: today,
    종목코드: '0001',
    아이디: s.아이디,
    예측종가: s.예측종가,
    순위: 0,
    종가증감구분: s.종가증감구분,
    종가증감값: s.종가증감값,
    등록일시: now,
    변경일시: now,
  })
  if (error) console.error(`❌ ${s.아이디} 삽입 실패:`, error.message)
  else console.log(`✅ ${s.아이디} 삽입 완료 (${today}, 예측종가: ${s.예측종가})`)
}
