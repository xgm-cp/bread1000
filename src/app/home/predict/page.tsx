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
  const [timeExpired, setTimeExpired] = useState(false)
  const [isWeekend, setIsWeekend] = useState(false)

  const checkTimeExpired = () => {
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const h = kstNow.getUTCHours()
    const m = kstNow.getUTCMinutes()
    const day = kstNow.getUTCDay()
    setIsWeekend(day === 0 || day === 6)
    setTimeExpired(h > 14 || (h === 14 && m >= 30))
  }

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const handleSubmit = async () => {
    if (!price) return
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const delta = sign === '-' ? -Number(price) : Number(price)
    const prevClose = rows.find(r => r.기준일자 < today)?.종가 ?? 0
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
    const timer = setInterval(checkTimeExpired, 60 * 1000)
    fetchRows()
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    if (!user.아이디) return
    getSupabase()
      .from('종가예측내역')
      .select('종가증감구분, 종가증감값')
      .eq('기준일자', today)
      .eq('아이디', user.아이디)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as unknown as { 종가증감구분: string; 종가증감값: number } | null
        if (row) {
          setAlreadyPredicted(true)
          setSign(row.종가증감구분 === 'U' ? '+' : '-')
          setPrice(String(row.종가증감값))
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
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text2)', marginLeft: 6 }}>
                  {new Date(latest.변경일시).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <div className="psi-name">코스피</div>
            <div className="psi-market">Korea Composite Stock Price Index</div>
          </div>
          <div className="psi-right">
            <div className="psi-current-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              현재 지수
              <button
                onClick={() => { if (!refreshing) { sessionStorage.removeItem('kospiCache'); fetchRows(true) } }}
                style={{ background: 'none', border: 'none', cursor: refreshing ? 'default' : 'pointer', padding: 0, lineHeight: 1, opacity: refreshing ? 0.4 : 1, pointerEvents: refreshing ? 'none' : 'auto' }}
                title="새로고침"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }} className={refreshing ? 'icon-spin' : ''}>
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
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
            if (daily.length < 2) {
              return <div className="chart-label"><span>5일 종가 흐름</span><span>로딩 중...</span></div>
            }
            const closes = daily.map(d => d.종가)
            const minV = Math.min(...closes)
            const maxV = Math.max(...closes)
            const W = 680, H = 130, PAD = 20, LABEL_H = 40, SIDE = 30
            const chartH = H - LABEL_H
            const x = (i: number) => SIDE + (i / (closes.length - 1)) * (W - SIDE * 2)
            const y = (v: number) => PAD + (1 - (v - minV) / (maxV - minV || 1)) * (chartH - PAD * 2)
            const pts = closes.map((v, i) => `${x(i)},${y(v)}`).join(' L')
            const areaPath = `M${pts} L${x(closes.length - 1)},${chartH} L${x(0)},${chartH} Z`
            const linePath = `M${pts}`
            const fmt = (d: string) => {
              const s = d.replace(/-/g, '')
              return `${s.slice(4, 6)}.${s.slice(6, 8)}`
            }
            const dateLabel = `${fmt(daily[0].기준일자)} — ${fmt(daily[daily.length - 1].기준일자)}`
            return (
              <>
                <div className="chart-label"><span>5일 종가 흐름</span><span>{dateLabel}</span></div>
                <svg className="mini-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF3D78" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#FF3D78" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path className="chart-area-fill" d={areaPath} />
                  <path className="chart-line" d={linePath} />
                  {closes.map((v, i) => {
                    const cx = x(i), cy = y(v)
                    const isLast = i === closes.length - 1
                    return (
                      <g key={i}>
                        <circle cx={cx} cy={cy} r={isLast ? 4 : 3} fill="#FF3D78" opacity={isLast ? 1 : 0.7} />
                        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="10" fill="#FF3D78" fontFamily="inherit">{v.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}</text>
                        <text x={cx} y={chartH + 14} textAnchor="middle" fontSize="11" fill="#8892A0" fontFamily="inherit">{fmt(daily[i].기준일자)}</text>
                      </g>
                    )
                  })}
                </svg>
              </>
            )
          })()}
        </div>

        <div className="prediction-panel">
          <h3>오늘의 종가를 예측하세요</h3>
          <p>예측 마감시간은 14시 30분 입니다. 예측 제출시 빵 1개가 차감됩니다.</p>
          <div className="input-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'DM Serif Display', serif", fontSize: 18, fontWeight: 700, color: 'var(--text1)', marginBottom: 10 }}>
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
                onClick={() => { if (!alreadyPredicted && !timeExpired && !isWeekend) setSign('+') }}
                disabled={alreadyPredicted || timeExpired || isWeekend}
              >+</button>
              <button
                className={`quick-btn${sign === '-' ? ' quick-btn-active' : ''}`}
                onClick={() => { if (!alreadyPredicted && !timeExpired && !isWeekend) setSign('-') }}
                disabled={alreadyPredicted || timeExpired || isWeekend}
              >−</button>
            </div>
            <div className="price-input-wrapper">
              <input className="price-input" type="number" placeholder="0" value={price} onChange={e => { if (!alreadyPredicted && !timeExpired && !isWeekend) setPrice(e.target.value) }} readOnly={alreadyPredicted || timeExpired || isWeekend} style={alreadyPredicted || timeExpired || isWeekend ? { opacity: 0.6, cursor: 'not-allowed' } : {}} />
            </div>
          </div>

          {alreadyPredicted && (
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>오늘 예측은 이미 제출되었습니다.</p>
          )}
          {isWeekend && !alreadyPredicted && (
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>마감입니다</p>
          )}
          {timeExpired && !alreadyPredicted && !isWeekend && (
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>예측시간종료 (14:30 마감)</p>
          )}
          <div className="submit-row">
            <button className="btn-cancel" onClick={() => { setPrice(''); setSign('+') }} disabled={alreadyPredicted || timeExpired || isWeekend}>취소</button>
            <button className="btn-submit" onClick={handleSubmit} disabled={submitting || !price || alreadyPredicted || timeExpired || isWeekend}>
              {submitting ? '저장 중...' : alreadyPredicted ? '제출 완료' : isWeekend ? '마감입니다' : timeExpired ? '제출 마감' : '예측 제출하기 →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
