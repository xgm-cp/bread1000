import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 시장 마감시황 위주의 소스 (파싱 검증된 순)
const RSS_SOURCES = [
  { url: 'https://www.yna.co.kr/rss/economy.xml',                      encoding: 'utf-8' },
  { url: 'https://rss.hankyung.com/economy.xml',                       encoding: 'utf-8' },
  { url: 'https://finance.naver.com/news/rss.naver?category=mainnews', encoding: 'euc-kr' },
  { url: 'https://rss.mk.co.kr/rss/30000001/',                         encoding: 'euc-kr' },
  { url: 'https://rss.hankyung.com/stock.xml',                         encoding: 'utf-8' },
]

// 1단계 DENY: 이 단어가 포함된 기사는 즉시 제거
const DENY_KEYWORDS = [
  '노조', '파업', '채용', '이사회', '부동산', '아파트', '청약', '전세', '월세', '분양',
  '가상자산', '코인', '비트코인', '이더리움', 'NFT',
  '소송', '검찰', '경찰', '수사', '사건', '사고', '범죄',
  '지자체', '관광', '축제', '행사', '지방', '군청', '시청', '구청',
  '날씨', '스포츠', '연예', '복지', '교육', '창업', '제보', '민원', '전산장애', '견적',
  '음식', '용기', '단순지역', '문화재', '복지관',
]

// 1단계 ALLOW: 이 단어 중 하나라도 포함된 기사만 통과
const ALLOW_KEYWORDS = [
  '금리', '환율', '수출', '수입', '물가', '인플레', '실적', '정책', '반도체', '자동차',
  '연준', 'Fed', '금통위', '기준금리', '국채', '주가', '증시', '코스피', 'KOSPI',
  '코스닥', '외국인', '기관', '매수', '매도', '상승', '하락', '경기', '성장률',
  '무역', '관세', '달러', '원화', '유가', '원유', 'WTI', '나스닥', 'S&P',
  '반등', '급등', '급락', '조정', 'GDP', 'CPI', 'PPI', '고용', '실업',
  '수출입', '경상수지', '기업', '실적', '영업이익', '매출', '투자', '채권',
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
    // ── 1. RSS 수집 (모든 소스 병렬 수집 후 합산) ────────────────
    type NewsItem = { title: string; desc: string }

    const extractItems = (xml: string): NewsItem[] =>
      [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
        .map(m => {
          const block = m[1]
          const t = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/)
          const d = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/)
          const decodeHtml = (s: string) => s
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
          const title = decodeHtml((t?.[1] ?? t?.[2] ?? '').trim())
          const desc  = decodeHtml((d?.[1] ?? d?.[2] ?? '')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 200))
          return { title, desc }
        })
        .filter(item => item.title)

    const results = await Promise.allSettled(
      RSS_SOURCES.map(async src => {
        const res = await fetch(src.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MarketBot/1.0)' },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) throw new Error(`${src.url} → ${res.status}`)
        const buf = await res.arrayBuffer()
        const xml = new TextDecoder(src.encoding).decode(buf)
        return extractItems(xml)
      })
    )

    const successSources = results.filter(r => r.status === 'fulfilled').length
    if (successSources === 0) throw new Error('모든 RSS 소스 실패')
    console.log(`[market-analysis] RSS 소스 ${successSources}/${RSS_SOURCES.length}개 성공`)

    // 중복 제거 후 합산 (제목 기준)
    const seen = new Set<string>()
    const allItems: NewsItem[] = results
      .flatMap(r => r.status === 'fulfilled' ? r.value : [])
      .filter(item => { if (seen.has(item.title)) return false; seen.add(item.title); return true })

    if (allItems.length === 0) throw new Error('RSS 파싱 결과 없음')

    // 1단계: DENY 제거 → ALLOW 통과 → 최대 30개
    const denied   = allItems.filter(item => !DENY_KEYWORDS.some(kw => item.title.includes(kw)))
    const filtered = denied.filter(item => ALLOW_KEYWORDS.some(kw => item.title.includes(kw) || item.desc.includes(kw))).slice(0, 30)
    console.log(`[market-analysis] 헤드라인 ${allItems.length}개 → DENY 후 ${denied.length}개 → ALLOW 후 ${filtered.length}개`)
    if (filtered.length === 0) throw new Error('필터링 후 유효한 헤드라인 없음 (시장 관련 뉴스 부족)')

    // ── 2. 오늘 KOSPI 종가 조회 ───────────────────────────
    const { data: closeData } = await supabase
      .from('종가관리내역')
      .select('종가, 기준일자')
      .eq('종목코드', '0001')
      .order('기준일자', { ascending: false })
      .limit(2)

    const closes = closeData as { 종가: number; 기준일자: string }[] | null
    // 오늘 데이터 없으면 가장 최근 데이터 사용
    const latestClose = closes?.[0] ?? null
    const prevCloseRow = closes?.[1] ?? null
    const isToday = latestClose?.기준일자 === today
    const latestPrice = latestClose?.종가 ?? null
    const prevClose   = prevCloseRow?.종가 ?? null
    const changeVal   = latestPrice !== null && prevClose ? (latestPrice - prevClose) : null
    const changeRate  = changeVal !== null && prevClose ? ((changeVal / prevClose) * 100).toFixed(2) : null
    const dateLabel   = isToday ? '' : ` (${latestClose?.기준일자} 기준)`

    const kospiLine = latestPrice !== null && changeVal !== null
      ? `KOSPI ${latestPrice.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}${dateLabel} (${changeVal > 0 ? '+' : ''}${changeVal.toFixed(2)}, ${changeVal > 0 ? '+' : ''}${changeRate}%)`
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
        const prev: number | undefined = meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPreviousClose
        if (!prev) return { price, change: 0, changeRate: '0.00' }
        const chg = price - prev
        return { price, change: chg, changeRate: ((chg / prev) * 100).toFixed(2) }
      } catch { return null }
    }

    const [sp500, nasdaq, wti, usdkrw, vix, tnx, dxy, ewy] = await Promise.all([
      fetchYahoo('^GSPC'),
      fetchYahoo('^IXIC'),
      fetchYahoo('CL=F'),
      fetchYahoo('USDKRW=X'),
      fetchYahoo('^VIX'),
      fetchYahoo('^TNX'),
      fetchYahoo('DX-Y.NYB'),
      fetchYahoo('EWY'),
    ])

    const fmtYahoo = (label: string, d: YahooData, unit = '') =>
      d ? `${label} ${d.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}${unit} (${d.change >= 0 ? '+' : ''}${d.change.toFixed(2)}, ${d.change >= 0 ? '+' : ''}${d.changeRate}%)` : `${label} 데이터 없음`

    // 데이터가 있는 항목만 포함
    const globalParts: string[] = []
    if (sp500)   globalParts.push(fmtYahoo('S&P500', sp500))
    if (nasdaq)  globalParts.push(fmtYahoo('NASDAQ', nasdaq))
    if (ewy)     globalParts.push(fmtYahoo('EWY(한국ETF)', ewy, '$'))
    if (wti)     globalParts.push(fmtYahoo('WTI유가', wti, '$'))
    if (usdkrw)  globalParts.push(fmtYahoo('USD/KRW', usdkrw, '원'))
    if (vix)     globalParts.push(fmtYahoo('VIX공포지수', vix))
    if (tnx)     globalParts.push(fmtYahoo('미국10년국채', tnx, '%'))
    if (dxy)     globalParts.push(fmtYahoo('달러인덱스DXY', dxy))
    const globalLines = globalParts.join('\n') || '국외 데이터 없음'

    console.log('[market-analysis] 국외 데이터:', globalLines.replace(/\n/g, ' | '))

    // ── 4. Groq API 분석 요청 ─────────────────────────────
    const systemPrompt = `당신은 엄격한 한국 증시 전문 금융 애널리스트입니다.
【언어 규칙 - 절대 준수】 모든 출력은 반드시 순수 한국어(한글)만 사용하세요. 株·超过·海外·今日 등 한자, 중국어, 일본어, 베트남어, 스페인어 단어를 단 한 글자도 섞지 마세요. 위반 시 응답 전체가 무효입니다.
【고유명사 번역 금지】 S&P500, NASDAQ, KOSPI, KOSDAQ, WTI, VIX, Fed, GDP, CPI, PPI, DXY 등 금융 고유명사는 절대 번역하거나 변형하지 마세요. 항상 원래 표기 그대로 사용하세요.

[핵심 원칙]
1. 제공된 실측 수치는 절대 변경하거나 다른 숫자를 만들어내지 마세요.
2. 뉴스에 근거 없는 내용을 추가하지 마세요.
3. 순환 논리 금지: '긍정적 뉴스→긍정적 영향' 같은 동어반복 금지. 반드시 금리·수급·환율·밸류에이션 등 구체적 금융 메커니즘으로 인과관계를 설명하세요.
4. 환율 원칙 (반드시 준수): 원화 강세(환율 하락) = 수출기업 수익성 약화 / 원화 약세(환율 상승) = 수출기업 수익성 강화. 이 방향을 절대 반대로 서술하지 마세요.
   - VIX 원칙: VIX↑ = 글로벌 공포심리 → 외국인 매도 → KOSPI 하락 압력
   - TNX 원칙: 미국 10년 국채금리↑ = 신흥국 자금 이탈 → 원화 약세 → KOSPI 수급 악화
   - DXY 원칙: 달러인덱스↑ = 달러 강세 → 원화 약세 → 외국인 환차손 → 매도 압력
5. 요인 우선순위 (반드시 이 순서로 factors 배열 구성):
   - 1순위 (거시경제): 환율·금리·유가·미국지수 — 지수를 크게 움직인 핵심 원인
   - 2순위 (정책·기업): 정부 정책, 기업 실적, 산업 뉴스 — 상승/하락세를 지속시킨 감성 요인
   이 논리 구조(거시경제가 방향을 결정 → 정책·뉴스가 지속성 부여)를 conclusion에도 반드시 반영하세요.
   - category는 반드시 '국내뉴스', '해외지수', '환율', '유가', 'EWY' 중 하나만 사용하세요. VIX·TNX·DXY는 별도 category 금지, '해외지수' 항목의 desc 안에서 언급하세요.
   - EWY(iShares MSCI South Korea ETF) 원칙: EWY↑ = 외국인의 한국 주식 선호 → 외국인 순매수 → KOSPI 상승 압력. EWY는 미국 시장에서 거래되므로 전일 종가 기준으로 분석하세요.
   - '국내뉴스' category는 반드시 1개 이상 포함하세요. 뉴스 데이터가 있는 한 confidence 50 미만으로 생략하지 마세요.
6. 경제·금융·거시경제·기업실적·수출입·통화정책과 직접 관련된 뉴스만 분석하세요. 지역행사·복지·사회면 뉴스는 완전히 무시하세요.
7. 문자열 내 큰따옴표 절대 사용금지 (작은따옴표 사용).
8. confidence가 50 미만인 요인은 factors 배열에서 완전히 생략하세요.
9. 반드시 순수 JSON만 출력하세요. 마크다운 코드 블록(\`\`\`) 금지.

[금융 분석 추가 규칙]
10. 환율 용어 엄수: 환율 상승(원화 가치 하락) = '원화 약세' / 환율 하락(원화 가치 상승) = '원화 강세'. 원화 약세는 수출 기업의 수익성 개선 요인으로 분석할 것.
11. 감성 지수 산출: 상승 요인 개수와 하락 요인 개수를 기반으로 sentiment_score를 산출할 것. 예: 상승 1개·하락 3개 → 50점 이하(중립/약세). 상승 요인이 많아야 높은 점수를 줄 것.
12. 결론 일관성: market_summary와 conclusion은 반드시 factors의 팩트와 일치해야 함. 상승 요인이 적은데 결론이 강세일 수 없음. 요인 비중을 정직하게 반영할 것.`

    // 한국시간 09:00~15:30은 장중, 그 외는 장외(마감 후 또는 개장 전)
    const kstH = kst.getUTCHours()
    const kstM = kst.getUTCMinutes()
    const kstTotalMin = kstH * 60 + kstM
    const isMarketOpen = kstTotalMin >= 9 * 60 && kstTotalMin < 15 * 60 + 30
    const marketContext = isMarketOpen
      ? `현재 시각은 KST ${String(kstH).padStart(2,'0')}:${String(kstM).padStart(2,'0')}으로 KOSPI 장중입니다. market_summary와 conclusion에 '마감', '마감했습니다' 등 장 마감을 의미하는 표현을 절대 쓰지 마세요. 대신 '거래 중', '현재 기준', '장중 흐름' 등의 표현을 사용하세요.`
      : `현재 시각은 KST ${String(kstH).padStart(2,'0')}:${String(kstM).padStart(2,'0')}으로 KOSPI 장 마감 이후입니다.`

    const userPrompt = `아래 데이터를 바탕으로 오늘 시황을 분석하세요.
${marketContext}

[지수 현황 - 실측값]
국내: ${kospiLine}
국외:
${globalLines}

[뉴스 데이터 ${filtered.length}개]
${filtered.map((item, i) => `${i + 1}. ${item.title}${item.desc ? ` / ${item.desc}` : ''}`).join('\n')}

[출력 형식 - 반드시 아래 JSON만 출력, 이 순서대로]
{
  "sentiment_score": 60,
  "market_summary": "${isMarketOpen ? 'KOSPI 실측값 포함 1문장 요약 (장중 표현 사용, 마감 표현 금지)' : 'KOSPI 실측값 포함 1문장 요약'}",
  "conclusion": "오늘 KOSPI 흐름의 핵심 원인과 향후 주시 변수를 2문장으로 서술",
  "factors": [
    {
      "type": "POSITIVE or NEGATIVE",
      "category": "국내뉴스",
      "title": "요인명 (10자 이내)",
      "mechanism": "원인 → 시장반응 → 주가영향 (1~2문장 인과 경로, 순환 표현 금지)",
      "confidence": 85,
      "desc": "인과 경로 중심 2~3문장. 실측 수치 인용 필수."
    },
    {
      "type": "POSITIVE or NEGATIVE",
      "category": "해외지수",
      "title": "S&P500 or NASDAQ",
      "mechanism": "미국 증시 방향성 → 외국인 투자심리 → KOSPI 수급 (1문장)",
      "confidence": 80,
      "desc": "실측 수치 인용. 2~3문장."
    },
    {
      "type": "POSITIVE or NEGATIVE",
      "category": "환율",
      "title": "USD/KRW 환율",
      "mechanism": "원화 강세/약세 → 외국인 수익률 → 자금 유출입 (1문장)",
      "confidence": 80,
      "desc": "실측 수치 인용. 2~3문장."
    },
    {
      "type": "POSITIVE or NEGATIVE",
      "category": "유가",
      "title": "WTI 유가",
      "mechanism": "유가 상승/하락 → 에너지 비용 → 제조업·화학 수익성 (1문장)",
      "confidence": 75,
      "desc": "실측 수치 인용. 2~3문장."
    }
  ]
}

[confidence 기준]
- 90~100: 실측 데이터와 뉴스 근거 모두 있고 인과관계 명확
- 70~89: 실측 데이터 있고 뉴스 근거 있음
- 50~69: 간접 근거만 있음
- 50 미만: factors에서 생략

【최종 확인】 출력 전 반드시 검토: 한자·중국어·일본어·베트남어·스페인어 단어가 하나라도 있으면 해당 단어를 순수 한국어로 교체 후 출력하세요.`

    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')
    const callGeminiModel = async (model: string): Promise<string> => {
      if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY 미설정')
      console.log(`[market-analysis] Gemini 호출: ${model}`)
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: { maxOutputTokens: 8000, temperature: 0.3, responseMimeType: 'application/json' },
          }),
        }
      )
      if (!res.ok) {
        const errBody = await res.text()
        console.error(`[market-analysis] ${model} 오류 ${res.status}:`, errBody.slice(0, 200))
        throw new Error(`Gemini API 오류 ${model}: ${res.status}`)
      }
      const json = await res.json()
      return json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    }

    // ── 3순위: Groq fallback ──────────────────────────────
    const callGroq = async (): Promise<string> => {
      console.log('[market-analysis] Groq fallback 호출')
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({
          model:           'llama-3.3-70b-versatile',
          max_tokens:      6000,
          response_format: { type: 'json_object' },
          messages:        [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
        }),
      })
      if (!res.ok) throw new Error(`Groq API 오류: ${res.status}`)
      const json = await res.json()
      return json.choices?.[0]?.message?.content ?? ''
    }

    let rawText = ''
    try {
      rawText = await callGeminiModel('gemini-3.1-flash-lite-preview')   // 1순위: RPD 500
    } catch (e1) {
      console.warn('[market-analysis] gemini-3.1-flash-lite-preview 실패 → gemini-2.5-flash 시도:', String(e1))
      try {
        rawText = await callGeminiModel('gemini-2.5-flash')       // 2순위: RPD 20
      } catch (e2) {
        console.warn('[market-analysis] gemini-2.5-flash 실패 → Groq fallback:', String(e2))
        try {
          rawText = await callGroq()                              // 3순위: Groq
        } catch (groqErr) {
          return new Response(
            JSON.stringify({ skipped: true, reason: `모든 AI 실패: ${String(groqErr)}`, existing_data: 'preserved' }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        }
      }
    }

    // 한자·일본어 감지 시 교정 API 호출
    const hasCJK = (s: string) => /[\u4e00-\u9fff\u3040-\u30ff]/.test(s)
    if (hasCJK(rawText)) {
      console.log('[market-analysis] 한자 감지 → 교정 호출')
      const fixRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({
          model:      'llama-3.1-8b-instant',
          max_tokens: 2000,
          messages: [
            { role: 'system', content: '아래 JSON에서 한자·중국어·일본어·베트남어·스페인어 단어를 모두 자연스러운 한국어로 교체하세요. JSON 구조와 나머지 내용은 절대 변경하지 마세요. 순수 JSON만 출력하세요. 마크다운 코드 블록 금지.' },
            { role: 'user',   content: rawText },
          ],
        }),
      })
      if (fixRes.ok) {
        const fixResJson = await fixRes.json()
        const fixed = fixResJson.choices?.[0]?.message?.content ?? ''
        if (fixed && /\{[\s\S]*\}/.test(fixed)) rawText = fixed
      }
      // 교정 후에도 CJK 남아있으면 강제 제거 후 계속 진행
      if (hasCJK(rawText)) {
        console.warn('[market-analysis] 교정 후에도 한자 잔존 → CJK 문자 강제 제거 후 저장')
        rawText = rawText.replace(/[\u4e00-\u9fff\u3040-\u30ff]/g, '')
      }
    }

    type Factor = { type: string; category?: string; title: string; mechanism?: string; confidence?: number; desc: string }
    type Analysis = { sentiment_score: number; market_summary: string; factors: Factor[]; conclusion: string }

    let analysis: Analysis
    try {
      // 마크다운 코드 블록 제거 → JSON 블록 추출
      const stripped = rawText.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '')
      const match = stripped.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('JSON 블록 없음: ' + rawText)
      const cleaned = match[0]
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // 제어문자 제거
        .replace(/,(\s*,)+/g, ',')                                  // 이중 콤마 제거
        .replace(/,\s*([}\]])/g, '$1')                              // trailing comma 제거
      analysis = JSON.parse(cleaned)
    } catch {
      throw new Error('Groq 응답 JSON 파싱 실패: ' + rawText)
    }

    // 필수 필드 유효성 검사 — market_summary, conclusion만 필수 (factors 비어도 허용)
    console.log('[market-analysis] 분석 결과:', JSON.stringify({ summary: analysis.market_summary?.slice(0,30), factorsCount: analysis.factors?.length, hasConclusion: !!analysis.conclusion }))
    if (!analysis.market_summary || !analysis.conclusion) {
      console.warn('[market-analysis] 분석 결과 필수 필드 누락 — DB 업데이트 생략')
      return new Response(
        JSON.stringify({ skipped: true, reason: '분석 결과 불완전', existing_data: 'preserved' }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }

    // type 필드 정규화 + 유효하지 않은 category 필터링 (깨진 한국어 제거)
    const VALID_CATEGORIES = ['국내뉴스', '해외지수', '환율', '유가', 'EWY']
    analysis.factors = (analysis.factors ?? [])
      .filter(f => !f.category || VALID_CATEGORIES.includes(f.category))
      .map(f => ({
        ...f,
        type: /pos|긍정|상승|호재/i.test(f.type ?? '') ? 'POSITIVE' : 'NEGATIVE'
      }))

    const score = analysis.sentiment_score ?? 50
    const sentimentLabel = score >= 70 ? '강세' : score >= 50 ? '중립' : score >= 30 ? '약세' : '하락'

    const analyzedAt = kst.toISOString().slice(0, 16).replace('T', ' ') // "YYYY-MM-DD HH:MM"

    const rawData = {
      date:           today,
      analyzed_at:    analyzedAt,
      sentiment:      { score, label: sentimentLabel },
      market_summary: analysis.market_summary,
      factors:        analysis.factors ?? [],
      conclusion:     analysis.conclusion,
      global: {
        sp500:  sp500  ? { price: sp500.price,   change: sp500.change,   changeRate: sp500.changeRate }  : null,
        nasdaq: nasdaq ? { price: nasdaq.price,  change: nasdaq.change,  changeRate: nasdaq.changeRate } : null,
        wti:    wti    ? { price: wti.price,     change: wti.change,     changeRate: wti.changeRate }    : null,
        usdkrw: usdkrw ? { price: usdkrw.price, change: usdkrw.change,  changeRate: usdkrw.changeRate } : null,
        vix:    vix    ? { price: vix.price,     change: vix.change,     changeRate: vix.changeRate }    : null,
        tnx:    tnx    ? { price: tnx.price,     change: tnx.change,     changeRate: tnx.changeRate }    : null,
        dxy:    dxy    ? { price: dxy.price,     change: dxy.change,     changeRate: dxy.changeRate }    : null,
        ewy:    ewy    ? { price: ewy.price,     change: ewy.change,     changeRate: ewy.changeRate }    : null,
      },
    }

    // ── 5. 1년 이전 데이터 삭제 후 INSERT ────────────────────
    const cutoff = new Date(kst)
    cutoff.setFullYear(cutoff.getFullYear() - 1)
    const cutoffDate = cutoff.toISOString().slice(0, 10)

    const { error: deleteErr } = await supabase
      .from('market_analysis')
      .delete()
      .lt('date', cutoffDate)
    if (deleteErr) console.warn('[market-analysis] 오래된 데이터 삭제 실패:', deleteErr.message)

    // JSON 직렬화 검증 후 삽입
    const rawDataStr = JSON.stringify(rawData)
    console.log('[market-analysis] rawData 길이:', rawDataStr.length, '샘플:', rawDataStr.slice(0, 100))
    const { error: insertErr } = await supabase
      .from('market_analysis')
      .upsert({ date: today, raw_data: JSON.parse(rawDataStr) }, { onConflict: 'date' })

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
