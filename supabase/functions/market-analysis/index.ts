import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 여러 소스를 순서대로 시도 (앞에서 성공하면 뒤는 건너뜀)
const RSS_SOURCES = [
  { url: 'https://www.yna.co.kr/rss/economy.xml',          encoding: 'utf-8' },
  { url: 'https://rss.hankyung.com/economy.xml',            encoding: 'utf-8' },
  { url: 'https://finance.naver.com/news/rss.naver?category=mainnews', encoding: 'euc-kr' },
]

Deno.serve(async () => {
  const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const GROQ_KEY = Deno.env.get('GROQ_API_KEY')
  if (!GROQ_KEY) {
    return new Response(JSON.stringify({ error: 'GROQ_API_KEY 미설정' }), { status: 500 })
  }

  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const day = kst.getUTCDay()
  // 주말 스킵
  if (day === 0 || day === 6) {
    return new Response(JSON.stringify({ skipped: true, reason: '주말' }), { status: 200 })
  }

  const today = kst.toISOString().slice(0, 10)
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  try {
    // ── 1. RSS 수집 (여러 소스 순서대로 시도) ────────────────
    let xml = ''
    let sourceUsed = ''
    const errors: string[] = []

    for (const src of RSS_SOURCES) {
      try {
        const res = await fetch(src.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MarketBot/1.0)' },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) { errors.push(`${src.url} → ${res.status}`); continue }
        const buf = await res.arrayBuffer()
        xml = new TextDecoder(src.encoding).decode(buf)
        sourceUsed = src.url
        break
      } catch (e) {
        errors.push(`${src.url} → ${String(e)}`)
      }
    }

    if (!xml) throw new Error('모든 RSS 소스 실패: ' + errors.join(' | '))
    console.log('[market-analysis] RSS 소스:', sourceUsed)

    // <item> 블록에서 제목만 추출 (CDATA 포함)
    const items  = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    const titles = items
      .map(m => {
        const t = m[1].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/)
        return (t?.[1] ?? t?.[2] ?? '').trim()
      })
      .filter(Boolean)
      .slice(0, 20)

    if (titles.length === 0) throw new Error('RSS 파싱 결과 없음 (소스: ' + sourceUsed + ')')

    // ── 2. 오늘 KOSPI 종가 조회 ───────────────────────────
    const { data: closeData } = await supabase
      .from('종가관리내역')
      .select('종가, 기준일자')
      .eq('종목코드', '0001')
      .order('기준일자', { ascending: false })
      .limit(2)

    const closes = closeData as { 종가: number; 기준일자: string }[] | null
    const todayClose = closes?.[0]?.기준일자 === today ? closes[0].종가 : null
    const prevClose  = todayClose !== null ? closes?.[1]?.종가 : closes?.[0]?.종가
    const changeVal  = todayClose !== null && prevClose ? (todayClose - prevClose) : null
    const changeRate = changeVal !== null && prevClose ? ((changeVal / prevClose) * 100).toFixed(2) : null

    const kospiLine = todayClose !== null && changeVal !== null
      ? `오늘 KOSPI 종가: ${todayClose.toLocaleString('ko-KR', { minimumFractionDigits: 2 })} (전일 대비 ${changeVal > 0 ? '+' : ''}${changeVal?.toFixed(2)}, ${changeVal > 0 ? '+' : ''}${changeRate}%)`
      : '오늘 KOSPI 종가: 데이터 없음 (뉴스 기반으로 분석)'

    // ── 3. Groq API 분석 요청 ─────────────────────────────
    const prompt = `다음은 오늘(${today}) 한국 증시 마감 정보입니다.

[지수 현황]
${kospiLine}

[마감 시황 뉴스 헤드라인 ${titles.length}개]
${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

위 정보를 바탕으로 오늘 증시 마감을 종합 분석하고, 반드시 아래 JSON 형식으로만 응답하세요. 설명이나 마크다운 없이 JSON만 출력하세요.

{
  "reason": "오늘 시장 등락의 핵심 이유 - 지수 수치를 포함해 2~3문장으로 구체적으로",
  "impact_factor": "시장에 영향을 준 주요 요인 5가지 (국내외 요인 균형있게, 각 항목은 '|'로 구분)",
  "summary": "지수 등락폭을 포함한 한 문장 핵심 요약"
}`

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model:      'llama-3.1-8b-instant',
        max_tokens: 800,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })

    if (!groqRes.ok) {
      const err = await groqRes.text()
      throw new Error(`Groq API 오류: ${groqRes.status} - ${err}`)
    }

    const groqJson = await groqRes.json()
    const rawText  = groqJson.choices?.[0]?.message?.content ?? ''

    // JSON 문자열 값 내부의 제어 문자만 이스케이프 (구조적 공백은 보존)
    const sanitize = (s: string) =>
      s.replace(/"(?:[^"\\]|\\.)*"/g, str =>
        str.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
           .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      )

    let analysis: { reason: string; impact_factor: string; summary: string }
    try {
      const match = rawText.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('JSON 블록 없음: ' + rawText)
      analysis = JSON.parse(sanitize(match[0]))
    } catch {
      throw new Error('Groq 응답 JSON 파싱 실패: ' + rawText)
    }

    // ── 3. TRUNCATE 후 INSERT (항상 1건 유지) ────────────────
    const { error: truncErr } = await supabase.rpc('truncate_market_analysis')
    if (truncErr) throw new Error('TRUNCATE 실패: ' + truncErr.message)

    const { error: insertErr } = await supabase
      .from('market_analysis')
      .insert({
        date:          today,
        reason:        analysis.reason,
        impact_factor: analysis.impact_factor,
        summary:       analysis.summary,
      })

    if (insertErr) throw new Error('INSERT 실패: ' + insertErr.message)

    return new Response(
      JSON.stringify({ ok: true, date: today, summary: analysis.summary }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )

  } catch (e) {
    console.error('[market-analysis]', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
