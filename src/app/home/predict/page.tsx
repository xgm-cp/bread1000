'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'


type KospiData = {
  bstp_nmix_prpr: string
  bstp_nmix_prdy_vrss: string
  prdy_vrss_sign: string
  bstp_nmix_prdy_ctrt: string
  prdy_clpr: string
  daily?: { date: string; close: string }[]
  mock?: boolean
}

export default function PredictPage() {
  const router = useRouter()
  const [price, setPrice] = useState('')
  const [sign, setSign] = useState<'+' | '-'>('+')
  const [kospi, setKospi] = useState<KospiData | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [alreadyPredicted, setAlreadyPredicted] = useState(false)

  const handleSubmit = async () => {
    if (!price) return
    const user = JSON.parse(sessionStorage.getItem('user') || '{}')
    const delta = sign === '-' ? -Number(price) : Number(price)
    const prevClose = kospi?.prdy_clpr ? Number(kospi.prdy_clpr) : 0
    const final = prevClose + delta
    const now = new Date()
    const 기준일자 = now.toISOString().slice(0, 10)

    setSubmitting(true)
    const { error } = await getSupabase()
      .from('종가예측내역')
      .insert({
        기준일자,
        종목코드: '0001',
        아이디: user.아이디,
        예측종가: final,
        순위: 0,
        종가증감구분: sign === '+' ? 'U' : 'D',
        종가증감값: Number(price),
        등록일시: now.toISOString(),
        변경일시: now.toISOString(),
      })
    setSubmitting(false)

    if (error) {
      alert('저장 실패: ' + error.message)
      return
    }
    router.push('/home/result')
  }

  const fetchKospi = () => {
    setRefreshing(true)
    fetch('/api/kospi')
      .then(res => res.json())
      .then(data => setKospi(data))
      .catch(() => {})
      .finally(() => setRefreshing(false))
  }

  useEffect(() => {
    fetchKospi()
    const user = JSON.parse(sessionStorage.getItem('user') || '{}')
    if (!user.아이디) return
    const today = new Date().toISOString().slice(0, 10)
    getSupabase()
      .from('종가예측내역')
      .select('종가증감구분, 종가증감값')
      .eq('기준일자', today)
      .eq('아이디', user.아이디)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAlreadyPredicted(true)
          setSign(data.종가증감구분 === 'U' ? '+' : '-')
          setPrice(String(data.종가증감값))
        }
      })
  }, [])

  return (
    <div className="page-predict">
      <div className="predict-body">
        <div className="predict-step">
          <div className="step-dot done" />
          <div className="step-line" />
          <div className="step-dot current" />
          <div className="step-line" />
          <div className="step-dot" />
          <div className="step-label" style={{ marginLeft: 8 }}>
            종목 선택 → <strong style={{ color: 'var(--gold)' }}>가격 입력</strong> → 제출
          </div>
        </div>

        <div className="predict-stock-info">
          <div>
            <div className="psi-ticker">전일 종가</div>
            <div className="psi-name">코스피</div>
            <div className="psi-market">Previous Day Closing Index</div>
          </div>
          <div className="psi-right">
            <div className="psi-current-label">전일 종가</div>
            <div className="psi-price">
              {kospi?.prdy_clpr
                ? Number(kospi.prdy_clpr).toLocaleString('ko-KR', { minimumFractionDigits: 2 })
                : '—'}
            </div>
            <div className="psi-prev">전영업일 기준</div>
          </div>
        </div>

        <div className="predict-stock-info">
          <div>
            <div className="psi-ticker">KOSPI 지수</div>
            <div className="psi-name">코스피</div>
            <div className="psi-market">Korea Composite Stock Price Index</div>
          </div>
          <div className="psi-right">
            <div className="psi-current-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              현재 지수{kospi?.mock ? ' (목업)' : ''}
              <button
                onClick={fetchKospi}
                disabled={refreshing}
                style={{ background: 'none', border: 'none', cursor: refreshing ? 'default' : 'pointer', padding: 0, lineHeight: 1, opacity: refreshing ? 0.4 : 1 }}
                title="새로고침"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}>
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
            </div>
            <div className="psi-price">
              {kospi ? Number(kospi.bstp_nmix_prpr).toLocaleString('ko-KR', { minimumFractionDigits: 2 }) : '—'}
            </div>
            <div className="psi-prev">
              {kospi
                ? (() => {
                    const up = kospi.prdy_vrss_sign === '2' || kospi.prdy_vrss_sign === '1'
                    const down = kospi.prdy_vrss_sign === '4' || kospi.prdy_vrss_sign === '5'
                    const sign = up ? '+' : down ? '-' : ''
                    const cls = up ? 'change-up' : down ? 'change-down' : ''
                    return (
                      <>
                        전일 대비{' '}
                        <span className={cls}>
                          {sign}{Number(kospi.bstp_nmix_prdy_vrss).toLocaleString('ko-KR', { minimumFractionDigits: 2 })}
                          {' '}({sign}{kospi.bstp_nmix_prdy_ctrt}%)
                        </span>
                      </>
                    )
                  })()
                : '데이터 로딩 중...'}
            </div>
          </div>
        </div>

        <div className="chart-area">
          {(() => {
            const daily = kospi?.daily
            if (!daily || daily.length < 2) {
              return <div className="chart-label"><span>5일 종가 흐름</span><span>로딩 중...</span></div>
            }
            const closes = daily.map(d => Number(d.close))
            const minV = Math.min(...closes)
            const maxV = Math.max(...closes)
            const W = 680, H = 130, PAD = 20, LABEL_H = 40, SIDE = 30
            const chartH = H - LABEL_H
            const x = (i: number) => SIDE + (i / (closes.length - 1)) * (W - SIDE * 2)
            const y = (v: number) => PAD + (1 - (v - minV) / (maxV - minV || 1)) * (chartH - PAD * 2)
            const pts = closes.map((v, i) => `${x(i)},${y(v)}`).join(' L')
            const areaPath = `M${pts} L${x(closes.length - 1)},${chartH} L${x(0)},${chartH} Z`
            const linePath = `M${pts}`
            const dateLabel = `${daily[0].date.slice(4, 6)}.${daily[0].date.slice(6, 8)} — ${daily[daily.length - 1].date.slice(4, 6)}.${daily[daily.length - 1].date.slice(6, 8)}`
            return (
              <>
                <div className="chart-label"><span>5일 종가 흐름</span><span>{dateLabel}</span></div>
                <svg className="mini-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2ECC8A" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#2ECC8A" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path className="chart-area-fill" d={areaPath} />
                  <path className="chart-line" d={linePath} />
                  {closes.map((v, i) => {
                    const cx = x(i), cy = y(v)
                    const isLast = i === closes.length - 1
                    const mm = daily[i].date.slice(4, 6)
                    const dd = daily[i].date.slice(6, 8)
                    return (
                      <g key={i}>
                        <circle cx={cx} cy={cy} r={isLast ? 4 : 3} fill={isLast ? '#2ECC8A' : '#2ECC8A'} opacity={isLast ? 1 : 0.7} />
                        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="10" fill="#2ECC8A" fontFamily="inherit">{v.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}</text>
                        <text x={cx} y={chartH + 14} textAnchor="middle" fontSize="11" fill="#8892A0" fontFamily="inherit">{mm}.{dd}</text>
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
          <p>장 마감(오후 3:30) 시 삼성전자의 최종 거래 가격을 입력하세요.<br />정확할수록 높은 점수를 받습니다.</p>
          <div className="input-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'DM Serif Display', serif", fontSize: 18, fontWeight: 700, color: 'var(--text1)', marginBottom: 10 }}>
              예측 증감값
              {price && (() => {
                const delta = sign === '-' ? -Number(price) : Number(price)
                const prevClose = kospi?.prdy_clpr ? Number(kospi.prdy_clpr) : null
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
                onClick={() => { if (!alreadyPredicted) setSign('+') }}
                disabled={alreadyPredicted}
              >+</button>
              <button
                className={`quick-btn${sign === '-' ? ' quick-btn-active' : ''}`}
                onClick={() => { if (!alreadyPredicted) setSign('-') }}
                disabled={alreadyPredicted}
              >−</button>
            </div>
            <div className="price-input-wrapper">
              <input className="price-input" type="number" placeholder="0" value={price} onChange={e => { if (!alreadyPredicted) setPrice(e.target.value) }} readOnly={alreadyPredicted} style={alreadyPredicted ? { opacity: 0.6, cursor: 'not-allowed' } : {}} />
            </div>
          </div>

          {alreadyPredicted && (
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>오늘 예측은 이미 제출되었습니다.</p>
          )}
          <div className="submit-row">
            <button className="btn-cancel" onClick={() => { setPrice(''); setSign('+') }} disabled={alreadyPredicted}>취소</button>
            <button className="btn-submit" onClick={handleSubmit} disabled={submitting || !price || alreadyPredicted}>
              {submitting ? '저장 중...' : alreadyPredicted ? '제출 완료' : '예측 제출하기 →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
