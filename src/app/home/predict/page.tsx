'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { BarChart2, X } from 'lucide-react'

type 종가Row = {
  기준일자: string
  종가: number
  변경일시: string | null
}

const CACHE_TTL = 2 * 60 * 1000

export default function PredictPage() {
  const router = useRouter()
  const [price, setPrice] = useState('')
  const [sign, setSign] = useState<'+' | '-'>('+')
  const [rows, setRows] = useState<종가Row[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [alreadyPredicted, setAlreadyPredicted] = useState(false)
  const [myPredictions, setMyPredictions] = useState<Record<string, number>>({}) // 날짜 → 예측종가
  const [timeExpired, setTimeExpired] = useState(false)
  const [isWeekend, setIsWeekend] = useState(false)
  const [marketClosed, setMarketClosed] = useState(false)
  const [marketPreparing, setMarketPreparing] = useState(false)
  type Factor = { type: string; category?: string; title: string; mechanism?: string; confidence?: number; desc: string }
  type GlobalItem = { price: number; change: number; changeRate: string } | null
  type AnalysisData = {
    date: string
    raw_data: {
      analyzed_at?: string
      sentiment: { score: number; label: string }
      market_summary: string
      factors: Factor[]
      conclusion: string
      global?: { sp500: GlobalItem; nasdaq: GlobalItem; wti: GlobalItem; usdkrw: GlobalItem; vix: GlobalItem; tnx: GlobalItem; dxy: GlobalItem }
    } | null
  }
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [analysisData, setAnalysisData] = useState<AnalysisData | null | 'loading'>('loading')

  const checkTimeExpired = () => {
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const h = kstNow.getUTCHours()
    const m = kstNow.getUTCMinutes()
    setMarketClosed(h >= 16)
    setMarketPreparing(h < 7 || (h === 7 && m < 30))
    setTimeExpired((h > 9 || (h === 9 && m >= 31)) && h < 16)
  }

  const checkTradingDay = async () => {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const dateStr = kst.toISOString().slice(0, 10)
    const dateKey = dateStr.replace(/-/g, '')
    try {
      const cached = sessionStorage.getItem('tradingDayCache')
      if (cached) {
        const { date, isTradingDay: cachedResult } = JSON.parse(cached)
        if (date === dateStr) { setIsWeekend(!cachedResult); return }
      }
      const res = await fetch(`/api/trading-day?date=${dateKey}`)
      const data = await res.json()
      setIsWeekend(!data.isTradingDay)
      sessionStorage.setItem('tradingDayCache', JSON.stringify({ date: dateStr, isTradingDay: data.isTradingDay }))
    } catch {
      setIsWeekend(false)
    }
  }

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

  async function openAnalysis() {
    setShowAnalysis(true)
    setAnalysisData('loading')
    const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    // 오늘 데이터 우선 조회, 없으면 가장 최근 데이터 fallback
    const { data: todayData } = await getSupabase()
      .from('market_analysis')
      .select('date, raw_data')
      .eq('date', kstToday)
      .maybeSingle()
    if (todayData) {
      setAnalysisData(todayData as typeof analysisData)
      return
    }
    const { data: latestData } = await getSupabase()
      .from('market_analysis')
      .select('date, raw_data')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    setAnalysisData(latestData as typeof analysisData ?? null)
  }

  const handleSubmit = async () => {
    if (!price) return
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const delta = sign === '-' ? -Number(price) : Number(price)
    const prevClose = rows.find(r => r.기준일자 < today)?.종가 ?? null
    if (prevClose === null) {
      alert('전일 종가 데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.')
      setSubmitting(false)
      return
    }
    const final = prevClose + delta
    const now = new Date()
    const kstISO = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 23)
    const 기준일자 = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

    setSubmitting(true)
    const supabase = getSupabase()

    const { data: bal } = await supabase
      .from('빵보유기본')
      .select('빵갯수')
      .eq('아이디', user.아이디)
      .single()
    const current = (bal as { 빵갯수: number } | null)?.빵갯수 ?? 0
    if (current < 1) {
      alert('빵이 부족해요! 충전 후 참여해주세요.')
      setSubmitting(false)
      return
    }

    const { error } = await supabase
      .from('종가예측내역')
      .insert({
        기준일자,
        종목코드: '0001',
        아이디: user.아이디,
        예측종가: final,
        종가증감구분: sign === '+' ? 'U' : 'D',
        종가증감값: Number(price),
        등록일시: kstISO,
        변경일시: kstISO,
      })

    if (error) {
      alert('저장 실패: ' + error.message)
      setSubmitting(false)
      return
    }

    await supabase
      .from('빵보유기본')
      .upsert({ 아이디: user.아이디, 빵갯수: current - 1 })

    const logNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const ts = `${logNow.getUTCFullYear()}${String(logNow.getUTCMonth()+1).padStart(2,'0')}${String(logNow.getUTCDate()).padStart(2,'0')}${String(logNow.getUTCHours()).padStart(2,'0')}${String(logNow.getUTCMinutes()).padStart(2,'0')}${String(logNow.getUTCSeconds()).padStart(2,'0')}`
    await supabase.from('계좌거래내역').insert({
      아이디: user.아이디, 거래일시: ts,
      입출금구분: 'B', 빵갯수: 1, 상태: 'Y',
    })

    setSubmitting(false)
    router.push('/home/result')
  }

  const fetchRows = async (forceRefresh = false) => {
    if (!forceRefresh) {
      try {
        const cached = sessionStorage.getItem('kospiCache')
        if (cached) {
          const { data, at } = JSON.parse(cached)
          if (Date.now() - at < CACHE_TTL && Array.isArray(data)) {
            setRows(data)
            return
          }
        }
      } catch { /* 파싱 실패 시 무시 */ }
    }
    setRefreshing(true)
    const { data } = await getSupabase()
      .from('종가관리내역')
      .select('기준일자, 종가, 변경일시')
      .eq('종목코드', '0001')
      .order('기준일자', { ascending: false })
      .limit(6)
    if (data) {
      setRows(data as unknown as 종가Row[])
      sessionStorage.setItem('kospiCache', JSON.stringify({ data, at: Date.now() }))
    }
    setRefreshing(false)
  }

  useEffect(() => {
    checkTimeExpired()
    checkTradingDay()
    const timer = setInterval(checkTimeExpired, 60 * 1000)
    fetchRows()
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    if (!user.아이디) return
    // 5일치 예측 전체 조회
    const since = new Date(Date.now() + 9 * 60 * 60 * 1000)
    since.setDate(since.getDate() - 7) // 7일 전부터 (주말 포함해서 여유)
    const sinceStr = since.toISOString().slice(0, 10)
    getSupabase()
      .from('종가예측내역')
      .select('종가증감구분, 종가증감값, 예측종가, 기준일자')
      .gte('기준일자', sinceStr)
      .eq('아이디', user.아이디)
      .then(({ data }) => {
        const rows = data as unknown as { 종가증감구분: string; 종가증감값: number; 예측종가: number | null; 기준일자: string }[] | null
        if (!rows) return
        const map: Record<string, number> = {}
        rows.forEach(r => { if (r.예측종가) map[r.기준일자] = r.예측종가 })
        setMyPredictions(map)
        const todayRow = rows.find(r => r.기준일자 === today)
        if (todayRow) {
          setAlreadyPredicted(true)
          setSign(todayRow.종가증감구분 === 'U' ? '+' : '-')
          setPrice(String(todayRow.종가증감값))
        }
      })
    return () => clearInterval(timer)
  }, [])

  const latest = rows.find(r => r.기준일자 === today)
  const prev = rows.find(r => r.기준일자 < today)
  const change = latest && prev ? latest.종가 - prev.종가 : null
  const changeRate = change !== null && prev ? ((change / prev.종가) * 100).toFixed(2) : null
  const isUp = change !== null && change > 0
  const isDown = change !== null && change < 0
  const changeSign = isUp ? '+' : isDown ? '-' : ''
  const changeCls = isUp ? 'change-up' : isDown ? 'change-down' : ''

  const daily = rows.length >= 2 ? [...rows].slice(0, 5).reverse() : []

  return (
    <>
    <div className="page-predict">
      <div className="predict-body">

        <div className="predict-stock-info">
          <div>
            <div className="psi-ticker">
              KOSPI 지수
              {latest?.변경일시 && (
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  {new Date(latest.변경일시).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} 기준
                </span>
              )}
            </div>
            <div className="psi-name">코스피</div>
            <div className="psi-market">Korea Composite Stock Price Index</div>
          </div>
          <div className="psi-right">
            <div className="psi-current-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              현재 지수
            </div>
            <div className="psi-price">
              {latest ? Number(latest.종가).toLocaleString('ko-KR', { minimumFractionDigits: 2 }) : '—'}
            </div>
            <div className="psi-prev">
              {change !== null
                ? <>
                    전일 대비{' '}
                    <span className={changeCls}>
                      {changeSign}{Math.abs(change).toLocaleString('ko-KR', { minimumFractionDigits: 2 })}
                      {changeRate !== null && <> ({changeSign}{Math.abs(Number(changeRate)).toFixed(2)}%)</>}
                    </span>
                  </>
                : '데이터 로딩 중...'}
            </div>
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border, rgba(255,255,255,0.08))', fontSize: 12, color: 'var(--text2)' }}>
              전일 종가{' '}
              <span style={{ fontWeight: 600, color: '#22c55e' }}>
                {prev ? Number(prev.종가).toLocaleString('ko-KR', { minimumFractionDigits: 2 }) : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="chart-area">
          {(() => {
            if (daily.length === 0) {
              return <div className="chart-label"><span>5일 종가 흐름</span><span>로딩 중...</span></div>
            }
            const fmt = (d: string) => { const s = d.replace(/-/g, ''); return `${s.slice(4, 6)}.${s.slice(6, 8)}` }

            // ── 5-slot 구성: 데이터가 5개 미만이면 앞 날짜를 null로 패딩 ──
            type Slot = { date: string; value: number | null }
            const slots: Slot[] = daily.map(d => ({ date: d.기준일자, value: d.종가 }))
            while (slots.length < 5) {
              const prev = new Date(slots[0].date)
              prev.setDate(prev.getDate() - 1)
              slots.unshift({ date: prev.toISOString().slice(0, 10), value: null })
            }

            const N = slots.length
            const predValues = Object.values(myPredictions)
            const realVals = [...slots.map(s => s.value).filter(v => v !== null) as number[], ...predValues]
            if (realVals.length === 0) return <div className="chart-label"><span>5일 종가 흐름</span><span>데이터 없음</span></div>

            const minV = Math.min(...realVals)
            const maxV = Math.max(...realVals)
            const CW = 680, CH = 240, PAD = 30, LABEL_H = 70, SIDE = 40
            const dataH = CH - LABEL_H
            const BOTTOM_Y = dataH - 6

            const x = (i: number) => SIDE + (i / (N - 1)) * (CW - SIDE * 2)
            const y = (v: number) => PAD + (1 - (v - minV) / (maxV - minV || 1)) * (dataH - PAD * 2)

            // ── 경로 포인트 계산 ──
            // 시작 null → BOTTOM_Y, 중간 null → 건너뜀(이전·이후 직결), 끝 null → 건너뜀
            const firstRealIdx = slots.findIndex(s => s.value !== null)
            type Pt = { i: number; cy: number }
            const pathPts: Pt[] = []
            slots.forEach((s, i) => {
              if (s.value !== null) {
                pathPts.push({ i, cy: y(s.value) })
              } else if (i < firstRealIdx) {
                pathPts.push({ i, cy: BOTTOM_Y }) // 시작 null → 바닥
              }
              // 중간·끝 null은 건너뜀 → 자동으로 이전·이후 직결
            })

            const linePath = pathPts.map((p, j) => `${j === 0 ? 'M' : 'L'}${x(p.i)},${p.cy}`).join(' ')
            // area fill: 실제 데이터 포인트만 (null 패딩 제외)
            const realPts = slots.map((s, i) => s.value !== null ? { i, cy: y(s.value) } : null).filter(Boolean) as Pt[]
            const areaPath = realPts.length >= 2
              ? `M${realPts.map(p => `${x(p.i)},${p.cy}`).join(' L')} L${x(realPts[realPts.length-1].i)},${dataH} L${x(realPts[0].i)},${dataH} Z`
              : ''

            const lastSlotDate = slots[Math.min(4, slots.length - 1)].date
            const firstSlotDate = slots[0].date
            const dateLabel = `${fmt(firstSlotDate)} — ${fmt(lastSlotDate)}`

            return (
              <>
                <div className="chart-label"><span>5일 종가 흐름</span><span>{dateLabel}</span></div>
                <svg className="mini-chart" viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF3D78" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#FF3D78" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {areaPath && <path className="chart-area-fill" d={areaPath} />}
                  {linePath && <path className="chart-line" d={linePath} />}

                  {/* 실제 종가 점 + 값 */}
                  {slots.map((s, i) => {
                    if (s.value === null) return null
                    const cx = x(i), cy = y(s.value)
                    const isLast = i === realPts[realPts.length - 1]?.i
                    const pv = myPredictions[s.date]
                    // 예측 점이 종가 점보다 위에 있으면(값이 크면) 종가 텍스트를 점 아래로
                    const predAbove = pv !== undefined && y(pv) < cy - 10
                    // 예측 점이 종가 점보다 아래 있으면(값이 작으면) 종가 텍스트를 점 위로 (기본)
                    const labelY = predAbove ? cy + 20 : cy - 10
                    return (
                      <g key={i}>
                        <circle cx={cx} cy={cy} r={isLast ? 5 : 4} fill="#FF3D78" opacity={isLast ? 1 : 0.75} />
                        <text x={cx} y={labelY} textAnchor="middle" fontSize="12" fontWeight="bold" fill="#FF3D78" fontFamily="inherit">
                          {s.value.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}
                        </text>
                      </g>
                    )
                  })}

                  {/* 예측 점 (차트 영역) — 종가보다 위면 위에, 아래면 아래에 점 표시 */}
                  {slots.map((s, i) => {
                    const pv = myPredictions[s.date]
                    if (pv === undefined) return null
                    return (
                      <circle key={`pred-dot-${i}`} cx={x(i)} cy={y(pv)} r={6} fill="#FFD700" stroke="#fff" strokeWidth="2" />
                    )
                  })}

                  {/* 날짜 + 예측값 레이블 (하단 고정 영역) */}
                  {slots.map((s, i) => {
                    const pv = myPredictions[s.date]
                    const hasDate = i < N
                    return (
                      <g key={`label-${i}`}>
                        {/* 날짜 */}
                        <text x={x(i)} y={dataH + 18} textAnchor="middle" fontSize="13"
                          fill={pv !== undefined ? '#FFD700' : s.value !== null ? '#8892A0' : '#4A5568'}
                          fontFamily="inherit">{fmt(s.date)}</text>
                        {/* 예측값 — 날짜 바로 아래 */}
                        {pv !== undefined && (
                          <text x={x(i)} y={dataH + 36} textAnchor="middle" fontSize="12" fontWeight="bold"
                            fill="#FFD700" fontFamily="inherit">
                            {pv.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}
                          </text>
                        )}
                      </g>
                    )
                  })}
                </svg>
              </>
            )
          })()}
        </div>

        <button
          onClick={openAnalysis}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', padding: '13px', borderRadius: 12, border: '1px solid #F59E0B', background: 'rgba(245,158,11,0.06)', color: '#F59E0B', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12 }}
        >
          <BarChart2 size={15} /> 오늘의 증시 한입분석
        </button>

        <div className="prediction-panel">
          <h3 style={{ whiteSpace: 'nowrap' }}>종가 예측</h3>
          <p>예측 마감시간은 09시 30분 입니다. <br />
            예측 제출시 빵 1개가 차감됩니다.</p>
          <div className="input-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
              예측 증감값
              {price && (() => {
                const delta = sign === '-' ? -Number(price) : Number(price)
                const prevClose = rows.find(r => r.기준일자 < today)?.종가 ?? null
                const final = prevClose !== null ? prevClose + delta : null
                return (
                  <>
                    <span style={{ color: 'var(--gold)' }}>{sign}{Number(price).toLocaleString()}</span>
                    {final !== null && (
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', fontFamily: 'inherit' }}>
                        → <span style={{ color: 'var(--gold)' }}>{final.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}</span>
                      </span>
                    )}
                  </>
                )
              })()}
            </div>
            <div className="quick-buttons">
              <button
                className={`quick-btn${sign === '+' ? ' quick-btn-active' : ''}`}
                onClick={() => { if (!alreadyPredicted && !timeExpired && !isWeekend && !marketClosed && !marketPreparing) setSign('+') }}
                disabled={alreadyPredicted || timeExpired || isWeekend || marketClosed || marketPreparing}
              >+</button>
              <button
                className={`quick-btn${sign === '-' ? ' quick-btn-active' : ''}`}
                onClick={() => { if (!alreadyPredicted && !timeExpired && !isWeekend && !marketClosed && !marketPreparing) setSign('-') }}
                disabled={alreadyPredicted || timeExpired || isWeekend || marketClosed || marketPreparing}
              >−</button>
            </div>
            <div className="price-input-wrapper">
              <input className="price-input" type="number" placeholder="0" value={price} onChange={e => { if (!alreadyPredicted && !timeExpired && !isWeekend && !marketClosed && !marketPreparing) setPrice(e.target.value) }} readOnly={alreadyPredicted || timeExpired || isWeekend || marketClosed || marketPreparing} style={alreadyPredicted || timeExpired || isWeekend || marketClosed || marketPreparing ? { opacity: 0.6, cursor: 'not-allowed' } : {}} />
            </div>
          </div>

          {alreadyPredicted && (
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>오늘 예측은 이미 제출되었습니다.</p>
          )}
          {isWeekend && !alreadyPredicted && (
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>마감입니다</p>
          )}
          {timeExpired && !alreadyPredicted && !isWeekend && (
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>예측시간종료 (09:30 마감)</p>
          )}
          {marketClosed && !alreadyPredicted && !isWeekend && (
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>오늘 장 마감</p>
          )}
          {marketPreparing && !alreadyPredicted && !isWeekend && (
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>예측 준비중 (08:00 오픈)</p>
          )}
          <div className="submit-row">
            <button className="btn-cancel" onClick={() => { setPrice(''); setSign('+') }} disabled={alreadyPredicted || timeExpired || isWeekend || marketClosed || marketPreparing}>취소</button>
            <button className="btn-submit" onClick={handleSubmit} disabled={submitting || !price || rows.length === 0 || alreadyPredicted || timeExpired || isWeekend || marketClosed || marketPreparing}>
              {submitting ? '저장 중...' : alreadyPredicted ? '제출 완료' : isWeekend ? '마감입니다' : marketClosed ? '오늘 장 마감' : marketPreparing ? '예측 준비중' : timeExpired ? '제출 마감' : '예측 제출하기 →'}
            </button>
          </div>
        </div>
      </div>
    </div>

    {showAnalysis && (
      <div onClick={() => setShowAnalysis(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 400, display: 'flex', alignItems: 'flex-end' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface)', borderRadius: '20px 20px 0 0', maxHeight: '88vh', overflowY: 'auto', boxSizing: 'border-box' }}>

          {/* 헤더 */}
          <div style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1, padding: '20px 24px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={18} color="#F59E0B" />
              <span style={{ fontSize: 15, fontWeight: 700 }}>오늘의 증시 한입분석</span>
            </div>
            <button onClick={() => setShowAnalysis(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><X size={20} /></button>
          </div>

          <div style={{ padding: '20px 24px 36px' }}>
            {analysisData === 'loading' && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text3)', fontSize: 14 }}>분석 중...</div>
            )}
            {analysisData === null && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
                <div style={{ fontSize: 14, color: 'var(--text3)', lineHeight: 1.7 }}>오늘 분석 결과가 아직 없어요.<br />장 마감(17:00) 후 자동으로 업데이트됩니다.</div>
              </div>
            )}

            {analysisData && analysisData !== 'loading' && (() => {
              const rd        = analysisData.raw_data
              if (!rd) return <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 14 }}>분석 데이터 형식이 올바르지 않습니다.</div>
              const analyzedAt = rd.analyzed_at
                ? (() => {
                    const [datePart, timePart] = rd.analyzed_at!.split(' ')
                    const [y, m, d] = datePart.split('-')
                    return `${m}월 ${d}일 ${timePart} KST 기준`
                  })()
                : null
              const score     = rd.sentiment.score
              const label     = rd.sentiment.label
              const summary   = rd.market_summary
              const allFactors = rd.factors ?? []
              const factors   = allFactors.filter(f => (f.confidence ?? 100) >= 50)
              const global    = rd.global

              const getGlobalValue = (f: Factor): string | null => {
                if (!global) return null
                const fmt = (v: number, decimals = 2) => v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
                const fmtChg = (chg: number, rate: string) => `${chg >= 0 ? '+' : ''}${fmt(chg)} (${chg >= 0 ? '+' : ''}${rate}%)`
                if (f.category === '해외지수') {
                  const t = f.title?.toUpperCase() ?? ''
                  if (t.includes('NASDAQ') && global.nasdaq) return `${fmt(global.nasdaq.price)} ${fmtChg(global.nasdaq.change, global.nasdaq.changeRate)}`
                  if (global.sp500) return `${fmt(global.sp500.price)} ${fmtChg(global.sp500.change, global.sp500.changeRate)}`
                }
                if (f.category === '환율' && global.usdkrw) return `${fmt(global.usdkrw.price, 2)}원 ${fmtChg(global.usdkrw.change, global.usdkrw.changeRate)}`
                if (f.category === '유가' && global.wti) return `$${fmt(global.wti.price)} ${fmtChg(global.wti.change, global.wti.changeRate)}`
                return null
              }
              const conclusion= rd.conclusion
              const ARC_LEN   = 251.33
              const gaugeColor= score >= 70 ? '#22C55E' : score >= 50 ? '#EAB308' : score >= 30 ? '#F97316' : '#EF4444'

              return (
                <>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16, fontWeight: 600, textAlign: 'right' }}>{analysisData.date} 기준</div>

                  {/* ── 감성 게이지 ── */}
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 18px', marginBottom: 14, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.1em', marginBottom: 8 }}>📈 시장 감성 지수 (Sentiment Score)</div>
                    <svg viewBox="0 0 200 115" style={{ width: 180, display: 'block', margin: '0 auto' }}>
                      <path d="M 20,100 A 80,80 0 0 1 180,100" fill="none" stroke="var(--border)" strokeWidth="16" strokeLinecap="round" />
                      <path d="M 20,100 A 80,80 0 0 1 180,100" fill="none" stroke={gaugeColor} strokeWidth="16" strokeLinecap="round"
                        strokeDasharray={`${(score / 100) * ARC_LEN} ${ARC_LEN}`} />
                      <text x="100" y="88" textAnchor="middle" fontSize="34" fontWeight="bold" fill={gaugeColor} fontFamily="inherit">{score}</text>
                      <text x="100" y="108" textAnchor="middle" fontSize="13" fill="var(--text3)" fontFamily="inherit">{label} {score >= 50 ? '🟢' : '🔴'}</text>
                    </svg>
                    {analyzedAt && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, fontWeight: 600 }}>🕐 {analyzedAt}</div>
                    )}
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8, lineHeight: 1.6 }}>{summary}</div>
                  </div>

                  {/* ── 핵심 요인 ── */}
                  {factors.length > 0 && (
                    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 18px', marginBottom: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.1em', marginBottom: 12 }}>📌 핵심 분석 요인</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {factors.length === 0 && (
                          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>데이터 부족 — 신뢰도 높은 요인이 없습니다.</div>
                        )}
                        {factors.map((f, idx) => {
                          const isPos = f.type?.toUpperCase() === 'POSITIVE'
                          const accentColor = isPos ? '#22C55E' : '#EF4444'
                          const conf = f.confidence
                          const confColor = conf !== undefined ? (conf >= 80 ? '#22C55E' : conf >= 60 ? '#EAB308' : '#F97316') : undefined
                          const globalVal = getGlobalValue(f)
                          return (
                            <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: isPos ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${isPos ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                              <span style={{ fontSize: 16, flexShrink: 0 }}>{isPos ? '✅' : '⚠️'}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                                  {f.category && (
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: 'rgba(99,102,241,0.12)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.2)' }}>{f.category}</span>
                                  )}
                                  <span style={{ fontSize: 12, fontWeight: 700, color: accentColor }}>{f.title}</span>
                                  {globalVal && (
                                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'var(--text2)', border: '1px solid var(--border)' }}>{globalVal}</span>
                                  )}
                                  {conf !== undefined && (
                                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: 'rgba(0,0,0,0.15)', color: confColor }}>신뢰도 {conf}</span>
                                  )}
                                </div>
                                {f.mechanism && (
                                  <div style={{ fontSize: 11, color: accentColor, fontWeight: 600, marginBottom: 5, lineHeight: 1.5, opacity: 0.85 }}>{f.mechanism}</div>
                                )}
                                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>{f.desc}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── 결론 ── */}
                  <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 16, padding: '16px 18px', marginBottom: 20 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#F59E0B', letterSpacing: '0.1em', marginBottom: 8 }}>💡 결론 및 시장 해석</div>
                    <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>{conclusion}</div>
                  </div>

                  {/* ── 다음 액션 ── */}
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, marginBottom: 14 }}>
                      오늘의 시장 분석을 보셨나요?<br />
                      <span style={{ fontWeight: 700 }}>다음 KOSPI는 어떻게 될까요?</span>
                    </div>
                    <button onClick={() => setShowAnalysis(false)}
                      style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'var(--primary-gradient)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(255,61,120,0.3)' }}>
                      다음 종가 예측하기 →
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      </div>
    )}
    </>
  )
}

