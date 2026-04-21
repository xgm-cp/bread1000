import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 시장 마감시황 위주의 소스 (파싱 검증된 순)
const RSS_SOURCES = [
  { url: 'https://www.yna.co.kr/rss/economy.xml',           encoding: 'utf-8' },
  { url: 'https://rss.hankyung.com/economy.xml',            encoding: 'utf-8' },
  { url: 'https://finance.naver.com/news/rss.naver?category=mainnews', encoding: 'euc-kr' },
]

// 시장과 무관한 노이즈 키워드 — 이 단어가 포함된 기사는 AI에 전달하지 않음
const NOISE_KEYWORDS = [
  '노조', '이사', '견적', '전산장애', '창업', '제보', '민원', '채용', '인사', '부동산',
  '아파트', '청약', '가상자산', '코인', '비트코인', '이더리움', '이사회', '대표이사',
  '소송', '검찰', '경찰', '사건', '사고', '날씨', '스포츠', '연예', '복지', '교육',
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

    // 노이즈 키워드 포함 기사 필터링 후 최대 20개
    const filtered = titles.filter(t => !NOISE_KEYWORDS.some(kw => t.includes(kw))).slice(0, 20)
    console.log(`[market-analysis] 헤드라인 ${titles.length}개 → 필터링 후 ${filtered.length}개`)
    if (filtered.length === 0) throw new Error('필터링 후 유효한 헤드라인 없음')

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
      ? `KOSPI ${todayClose.toLocaleString('ko-KR', { minimumFractionDigits: 2 })} (${changeVal > 0 ? '+' : ''}${changeVal.toFixed(2)}, ${changeVal > 0 ? '+' : ''}${changeRate}%)`
      : 'KOSPI 데이터 없음'

    // ── 3. 국외 시장 데이터 (Yahoo Finance) ──────────────────
    type YahooData = { price: number; change: number; changeRate: string } | null
    const fetchYahoo = async (symbol: string): Promise<YahooData> => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) }
        )
        if (!res.ok) return null
        const json = await res.json()
        const meta = json?.chart?.result?.[0]?.meta
        if (!meta?.regularMarketPrice) return null
        const price = meta.regularMarketPrice as number
        const prev  = meta.previousClose as number
        const chg   = price - prev
        return { price, change: chg, changeRate: ((chg / prev) * 100).toFixed(2) }
      } catch { return null }
    }

    const [sp500, nasdaq, wti, usdkrw] = await Promise.all([
      fetchYahoo('^GSPC'),
      fetchYahoo('^IXIC'),
      fetchYahoo('CL=F'),
      fetchYahoo('USDKRW=X'),
    ])

    const fmtYahoo = (label: string, d: YahooData, unit = '') =>
      d ? `${label} ${d.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}${unit} (${d.change >= 0 ? '+' : ''}${d.change.toFixed(2)}, ${d.change >= 0 ? '+' : ''}${d.changeRate}%)` : `${label} 데이터 없음`

    const globalLines = [
      fmtYahoo('S&P500', sp500),
      fmtYahoo('NASDAQ', nasdaq),
      fmtYahoo('WTI유가', wti, '$'),
      fmtYahoo('USD/KRW', usdkrw, '원'),
    ].join('\n')

    console.log('[market-analysis] 국외 데이터:', globalLines.replace(/\n/g, ' | '))

    // ── 4. Groq API 분석 요청 ─────────────────────────────
    const prompt = `당신은 한국 증시 전문 금융 애널리스트입니다.
아래 데이터를 바탕으로 오늘 마감 시황을 분석하세요.

[규칙]
1. [지수 현황]의 수치는 실측값입니다. 반드시 이 수치를 그대로 사용하고 절대 다른 숫자를 만들어내지 마세요.
2. 국외 지수(S&P500, NASDAQ), 환율(USD/KRW), 유가(WTI)는 제공된 실측값을 분석에 활용하세요.
3. 뉴스에 근거 없는 내용은 추가하지 마세요. 데이터 부족 시 해당 항목을 생략하세요.
4. 주가와 무관한 사회/일반 뉴스는 무시하세요.
5. 문자열 내 큰따옴표 절대 사용금지 (작은따옴표 사용).

[지수 현황 - 실측값]
국내: ${kospiLine}
국외:
${globalLines}

[뉴스 데이터 ${filtered.length}개]
${filtered.map((t, i) => `${i + 1}. ${t}`).join('\n')}

[출력 형식 - 반드시 아래 JSON만 출력, 마크다운 금지]
{
  "sentiment_score": 60,
  "market_summary": "KOSPI 실측값 포함 1문장 요약",
  "factors": [
    { "type": "POSITIVE", "title": "요인명 (10자 이내)", "desc": "이 요인이 왜 주가 상승에 기여했는지 금융 논리로 상세히 설명. 인과관계를 화살표(→)로 연결하고, 시장 참여자(외국인/기관/개인) 반응, 관련 섹터 영향까지 포함해 5~10줄로 서술" },
    { "type": "NEGATIVE", "title": "요인명 (10자 이내)", "desc": "이 요인이 왜 주가 하락 또는 부담으로 작용했는지 금융 논리로 상세히 설명. 인과관계를 화살표(→)로 연결하고, 리스크 전파 경로와 투자심리 위축 과정까지 포함해 5~10줄로 서술" }
  ],
  "conclusion": "오늘 시장 전체를 한 줄로 정의한 뒤, 상승/하락 요인들이 어떻게 충돌하거나 균형을 이뤘는지, 그리고 향후 주목할 변수는 무엇인지 종합해서 서술"
}`

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model:      'llama-3.1-8b-instant',
        max_tokens: 2000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })

    if (!groqRes.ok) {
      const err = await groqRes.text()
      throw new Error(`Groq API 오류: ${groqRes.status} - ${err}`)
    }

    const groqJson = await groqRes.json()
    const rawText  = groqJson.choices?.[0]?.message?.content ?? ''

    // JSON 문자열 내부 문제 문자 수정 (제어 문자 + 내부 따옴표)
    const fixJson = (s: string): string => {
      let result = ''
      let inString = false
      let escaped = false
      for (let i = 0; i < s.length; i++) {
        const c = s[i]
        if (escaped) { result += c; escaped = false; continue }
        if (c === '\\') { result += c; escaped = true; continue }
        if (c === '\n' && inString) { result += '\\n'; continue }
        if (c === '\r' && inString) { result += '\\r'; continue }
        if (c === '\t' && inString) { result += '\\t'; continue }
        if (c === '"') {
          if (!inString) { inString = true; result += c; continue }
          // 닫는 따옴표인지 확인: 뒤에 공백 제거 후 :,}] 가 오면 닫는 따옴표
          let j = i + 1
          while (j < s.length && ' \t\r\n'.includes(s[j])) j++
          const next = s[j]
          if (next === ':' || next === ',' || next === '}' || next === ']' || j >= s.length) {
            inString = false; result += c
          } else {
            result += '\\"' // 내부 따옴표 → 이스케이프
          }
          continue
        }
        result += c
      }
      return result
    }

    type Factor = { type: string; title: string; desc: string }
    type Analysis = { sentiment_score: number; market_summary: string; factors: Factor[]; conclusion: string }

    let analysis: Analysis
    try {
      const match = rawText.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('JSON 블록 없음: ' + rawText)
      analysis = JSON.parse(fixJson(match[0]))
    } catch {
      throw new Error('Groq 응답 JSON 파싱 실패: ' + rawText)
    }

    const score = analysis.sentiment_score ?? 50
    const sentimentLabel = score >= 70 ? '강세' : score >= 50 ? '중립' : score >= 30 ? '약세' : '하락'

    const rawData = {
      date:           today,
      sentiment:      { score, label: sentimentLabel },
      market_summary: analysis.market_summary,
      factors:        analysis.factors ?? [],
      conclusion:     analysis.conclusion,
    }

    // ── 5. TRUNCATE 후 INSERT (항상 1건 유지) ────────────────
    const { error: truncErr } = await supabase.rpc('truncate_market_analysis')
    if (truncErr) throw new Error('TRUNCATE 실패: ' + truncErr.message)

    const { error: insertErr } = await supabase
      .from('market_analysis')
      .insert({
        date:     today,
        raw_data: rawData,
      })

    if (insertErr) throw new Error('INSERT 실패: ' + insertErr.message)

    return new Response(
      JSON.stringify({ ok: true, date: today, summary: analysis.market_summary }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )

  } catch (e) {
    console.error('[market-analysis]', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
