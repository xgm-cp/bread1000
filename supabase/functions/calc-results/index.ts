import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 요청 body 파싱
  let body: { date?: string; actualClose?: number; direction?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* no body */ }

  // 날짜: body.date 우선, 없으면 KST 오늘
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayIso = body.date ?? nowKST.toISOString().slice(0, 10)

  // ① 이미 처리된 날짜인지 먼저 확인 (force:true 면 스킵)
  if (!body.force) {
    const { data: already } = await supabase
      .from('종가관리내역')
      .select('기준일자')
      .eq('기준일자', todayIso)
      .limit(1)

    if (already && already.length > 0) {
      return new Response(JSON.stringify({ message: '이미 처리된 날짜. force:true 로 강제 실행 가능', date: todayIso }), { status: 200 })
    }
  }

  // ② 종가/방향 결정: body에 직접 넘긴 값 우선, 없으면 KOSPI API 호출
  let actualClose: number
  let direction: 'U' | 'D'

  if (body.actualClose && body.direction) {
    actualClose = body.actualClose
    direction = body.direction as 'U' | 'D'
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
    direction = ['1', '2'].includes(kospi.prdy_vrss_sign) ? 'U' : 'D'
  }

  // ③ 해당 날짜 예측 목록 조회 (기준일자 기준)
  const { data: preds, error: predsErr } = await supabase
    .from('종가예측내역')
    .select('아이디, 예측종가, 종가증감구분')
    .eq('기준일자', todayIso)

  if (predsErr || !preds || preds.length === 0) {
    return new Response(JSON.stringify({ message: '예측 없음', date: todayIso }), { status: 200 })
  }

  type Pred = { 아이디: string; 예측종가: number; 종가증감구분: string }

  // ④ 방향 맞춘 사람 → 오차 오름차순 → 순위 부여
  const correct = (preds as Pred[])
    .filter(p => p.종가증감구분 === direction)
    .sort((a, b) => Math.abs(a.예측종가 - actualClose) - Math.abs(b.예측종가 - actualClose))

  const wrong = (preds as Pred[]).filter(p => p.종가증감구분 !== direction)

  // ⑤ 순위 업데이트
  for (const [i, p] of correct.entries()) {
    await supabase.from('종가예측내역')
      .update({ 순위: i + 1, 종가증감값: parseFloat(Math.abs(p.예측종가 - actualClose).toFixed(2)) })
      .eq('아이디', p.아이디)
      .eq('기준일자', todayIso)
  }
  for (const p of wrong) {
    await supabase.from('종가예측내역')
      .update({ 순위: null, 종가증감값: parseFloat(Math.abs(p.예측종가 - actualClose).toFixed(2)) })
      .eq('아이디', p.아이디)
      .eq('기준일자', todayIso)
  }

  // ⑥ 종가관리내역 저장 (처리 완료 마커 — 순위 업데이트 후에 저장)
  await supabase.from('종가관리내역').upsert({
    기준일자: todayIso,
    실제종가: actualClose,
    종가증감구분: direction,
  })

  // ⑦ 1등에게 풀 전체 지급
  const winner = correct[0]
  const totalPool = preds.length
  if (winner) {
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
    ranked: correct.length,
    unranked: wrong.length,
  }), { status: 200, headers: { 'content-type': 'application/json' } })
})
