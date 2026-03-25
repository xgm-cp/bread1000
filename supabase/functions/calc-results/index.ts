import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: { date?: string; actualClose?: number; direction?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* no body */ }

  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayIso = body.date ?? nowKST.toISOString().slice(0, 10)

  if (!body.force) {
    const { data: already } = await supabase
      .from('종가예측내역')
      .select('순위')
      .eq('기준일자', todayIso)
      .not('순위', 'is', null)
      .limit(1)

    if (already && already.length > 0) {
      return new Response(JSON.stringify({ message: '이미 처리된 날짜. force:true 로 강제 실행 가능', date: todayIso }), { status: 200 })
    }
  }

  let actualClose: number
  let direction: 'U' | 'D' | 'F' // F = 보합

  if (body.actualClose && body.direction) {
    actualClose = body.actualClose
    direction = body.direction as 'U' | 'D' | 'F'
  } else {
    const appUrl = Deno.env.get('APP_URL')
    if (!appUrl) {
      return new Response(JSON.stringify({ error: 'APP_URL 미설정 — actualClose/direction 을 직접 넘겨주세요' }), { status: 200 })
    }
    const kospiRes = await fetch(`${appUrl}/api/kospi`)
    if (!kospiRes.ok) {
      return new Response(JSON.stringify({ error: `KOSPI API 오류: ${kospiRes.status}` }), { status: 200 })
    }
    const kospi = await kospiRes.json()
    actualClose = parseFloat(kospi.bstp_nmix_prpr)
    const sign = kospi.prdy_vrss_sign
    direction = sign === '3' ? 'F' : ['1', '2'].includes(sign) ? 'U' : 'D'
  }

  const { data: preds, error: predsErr } = await supabase
    .from('종가예측내역')
    .select('아이디, 예측종가, 종가증감구분, 등록일시')
    .eq('기준일자', todayIso)

  if (predsErr || !preds || preds.length === 0) {
    return new Response(JSON.stringify({ message: '예측 없음', date: todayIso }), { status: 200 })
  }

  type Pred = { 아이디: string; 예측종가: number; 종가증감구분: string; 등록일시: string }

  const allPreds = preds as Pred[]

  // 홈 리더보드와 동일한 정렬 로직
  // 1순위: 방향 일치 여부 (보합이면 방향 무관)
  // 2순위: 실제 종가와의 오차 오름차순
  // 3순위: 등록일시 오름차순
  const sorted = [...allPreds].sort((a, b) => {
    if (direction !== 'F') {
      const aDir = a.종가증감구분 === direction ? 0 : 1
      const bDir = b.종가증감구분 === direction ? 0 : 1
      if (aDir !== bDir) return aDir - bDir
    }
    const diff = Math.abs(a.예측종가 - actualClose) - Math.abs(b.예측종가 - actualClose)
    if (diff !== 0) return diff
    return a.등록일시 < b.등록일시 ? -1 : a.등록일시 > b.등록일시 ? 1 : 0
  })

  const updateErrors: string[] = []
  for (const [i, p] of sorted.entries()) {
    const { error } = await supabase.from('종가예측내역')
      .update({ 순위: i + 1 })
      .eq('아이디', p.아이디)
      .eq('기준일자', todayIso)
    if (error) updateErrors.push(`${p.아이디}: ${error.message}`)
  }

  await supabase.from('종가관리내역').upsert({
    기준일자: todayIso,
    종가: actualClose,
  })

  const winner = sorted[0]
  const totalPool = preds.length
  if (winner) {
    // 1. 계좌거래내역 INSERT 먼저 시도 — unique index(아이디+날짜+W)로 중복 방지
    const logNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const ts = `${logNow.getUTCFullYear()}${String(logNow.getUTCMonth()+1).padStart(2,'0')}${String(logNow.getUTCDate()).padStart(2,'0')}${String(logNow.getUTCHours()).padStart(2,'0')}${String(logNow.getUTCMinutes()).padStart(2,'0')}${String(logNow.getUTCSeconds()).padStart(2,'0')}`
    const { error: insertErr } = await supabase.from('계좌거래내역').insert({
      아이디: winner.아이디, 거래일시: ts,
      입출금구분: 'W', 빵갯수: totalPool, 상태: 'Y',
    })

    // 2. INSERT 실패(unique 위반 등)면 잔액 업데이트 없이 종료
    if (insertErr) {
      return new Response(JSON.stringify({ message: '빵 지급 INSERT 실패(중복 방지)', error: insertErr.message, date: todayIso, winner: winner.아이디 }), { status: 200 })
    }

    // 3. INSERT 성공한 경우에만 빵 잔액 업데이트
    const { data: winBal } = await supabase
      .from('빵보유기본').select('빵갯수').eq('아이디', winner.아이디).single()
    const winCurrent = (winBal as { 빵갯수: number } | null)?.빵갯수 ?? 0
    await supabase.from('빵보유기본')
      .upsert({ 아이디: winner.아이디, 빵갯수: winCurrent + totalPool })
  }

  return new Response(JSON.stringify({
    date: todayIso,
    actualClose,
    direction,
    totalPool,
    winner: winner?.아이디 ?? null,
    ranked: sorted.length,
    sorted: sorted.map(p => p.아이디),
    updateErrors,
  }), { status: 200, headers: { 'content-type': 'application/json' } })
})
