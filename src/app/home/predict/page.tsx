'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

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
  )
}
