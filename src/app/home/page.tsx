'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

type StockData = {
  ticker: string
  name: string
  price: string
  change: string
  changeRate: string
  sign: string // '2':상승, '5':하락, '3':보합
}

type LeaderboardEntry = {
  아이디: string
  예측종가: number
  종가증감구분: string
  종가증감값: number
  순위: number
  회원기본: { 이름: string } | null
}

const RANK_STYLES = [
  { bg: 'linear-gradient(135deg,#FFD700,#FF8C00)', color: '#111' },
  { bg: 'linear-gradient(135deg,#B0C8DC,#6B9DB5)', color: '#fff' },
  { bg: 'linear-gradient(135deg,#D49A6A,#A0622A)', color: '#fff' },
]

export default function HomePage() {
  const router = useRouter()
  const pathname = usePathname()
  const [stocks, setStocks] = useState<StockData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [hasPrediction, setHasPrediction] = useState<boolean | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])

  const fetchStocks = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/stocks')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data.stocks) || data.stocks.length === 0) throw new Error('no data')
      setStocks(data.stocks)
      // 코스피 현재가 저장 (종목코드 '0001', 첫 번째 항목)
      const kospi = data.stocks.find((s: StockData) => s.ticker === '0001')
      if (kospi) sessionStorage.setItem('kospiPrice', kospi.price)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStocks()

    const stored = sessionStorage.getItem('user')
    if (!stored) return
    const user = JSON.parse(stored)
    const today = new Date().toISOString().slice(0, 10)

    // 로그인 유저 예측 여부 확인
    getSupabase()
      .from('종가예측내역')
      .select('아이디', { count: 'exact', head: true })
      .eq('기준일자', today)
      .eq('아이디', user.아이디)
      .then(({ count }) => {
        const predicted = (count ?? 0) > 0
        setHasPrediction(predicted)

        // 예측한 경우 전체 리더보드 조회 (코스피 기준, 예측종가 내림차순)
        if (predicted) {
          getSupabase()
            .from('종가예측내역')
            .select('아이디, 예측종가, 종가증감구분, 종가증감값, 순위, 회원기본(이름)')
            .eq('기준일자', today)
            .eq('종목코드', '0001')
            .limit(50)
            .then(({ data }) => {
              if (!data) return
              const entries = data as LeaderboardEntry[]
              // 현재 코스피 값 기준 오차 오름차순 정렬 (오차 작을수록 1위)
              const kospiPrice = Number(sessionStorage.getItem('kospiPrice') ?? '0')
              if (kospiPrice > 0) {
                entries.sort((a, b) =>
                  Math.abs(a.예측종가 - kospiPrice) - Math.abs(b.예측종가 - kospiPrice)
                )
              }
              setLeaderboard(entries.slice(0, 10))
            })
        }
      })
  }, [fetchStocks, pathname])

  function getSign(sign: string) {
    if (sign === '2' || sign === '1') return 'up'
    if (sign === '5' || sign === '4') return 'down'
    return 'neutral'
  }

  function formatPrice(price: string) {
    return Number(price).toLocaleString('ko-KR')
  }

  function formatChange(change: string, sign: string) {
    const direction = getSign(sign)
    if (direction === 'up') return `▲ ${Number(change).toLocaleString('ko-KR')}원`
    if (direction === 'down') return `▼ ${Number(change).toLocaleString('ko-KR')}원`
    return `${Number(change).toLocaleString('ko-KR')}원`
  }

  function formatRate(rate: string, sign: string) {
    const direction = getSign(sign)
    const prefix = direction === 'up' ? '+' : direction === 'down' ? '-' : ''
    return `${prefix}${Number(rate).toFixed(2)}%`
  }

  function formatPrediction(entry: LeaderboardEntry) {
    const dir = entry.종가증감구분 === 'U' ? '▲' : '▼'
    const kospiPrice = Number(sessionStorage.getItem('kospiPrice') ?? '0')
    const diff = kospiPrice > 0 ? Math.abs(entry.예측종가 - kospiPrice).toFixed(2) : null
    return (
      <span>
        {entry.예측종가.toFixed(2)} {dir}{entry.종가증감값}
        {diff !== null && (
          <span> (현재차이 : <span style={{ color: '#ffffff' }}>{diff}</span>)</span>
        )}
      </span>
    )
  }

  return (
    <div className="page-home">
      <div className="home-body">

        <div className="home-hero">
          <div className="eyebrow">천원으로 시작하는 투자 감각</div>
          <h1>오늘의 <em>종가</em>,<br />당신이 맞춰보세요</h1>
          <p>실시간 주식 데이터를 바탕으로 종가를 예측하고<br />내부 투자자들과 실력을 겨뤄보세요.</p>
          <div className="home-cta">
            <button className="btn-gold" onClick={() => router.push('/home/predict')}>지금 예측하기</button>
            <button className="btn-ghost" onClick={() => router.push('/home/result')}>오늘의 결과 보기</button>
          </div>
        </div>

        <div className="home-grid">
          <div>
            <div className="section-header">
              <div className="section-title">오늘의 종목</div>
              <button className="section-sub" onClick={fetchStocks} disabled={loading}>
                {loading ? '🔄 새로고침 중...' : '🔄 새로고침'}
              </button>
            </div>
            <div className="stock-grid">
              {loading
                ? [0, 1, 2].map(i => (
                    <div key={i} className="stock-card" style={{ opacity: 0.5 }}>
                      <div className="stock-card-left">
                        <div className="stock-card-top">
                          <div className="stock-ticker">------</div>
                        </div>
                        <div className="stock-name">불러오는 중...</div>
                      </div>
                    </div>
                  ))
                : error
                ? (
                    <div className="stock-card" style={{ gridColumn: '1 / -1', justifyContent: 'center', flexDirection: 'column', gap: '8px', textAlign: 'center' }}>
                      <div className="stock-name" style={{ color: '#ff6b6b' }}>데이터를 불러오지 못했습니다</div>
                      <button className="btn-ghost" onClick={fetchStocks} style={{ fontSize: '0.85em' }}>다시 시도</button>
                    </div>
                  )
                : stocks.map(stock => {
                    const direction = getSign(stock.sign)
                    return (
                      <div key={stock.ticker} className="stock-card" onClick={() => router.push('/home/predict')}>
                        <div className="stock-card-left">
                          <div className="stock-card-top">
                            <div className="stock-ticker">{stock.ticker}</div>
                            <div className={`stock-badge badge-${direction}`}>
                              {formatRate(stock.changeRate, stock.sign)}
                            </div>
                          </div>
                          <div className="stock-name">{stock.name}</div>
                        </div>
                        <div className="stock-card-right">
                          <div className="stock-price">{formatPrice(stock.price)}</div>
                          <div className={`stock-change change-${direction}`}>
                            {formatChange(stock.change, stock.sign)}
                          </div>
                        </div>
                      </div>
                    )
                  })
              }
            </div>
          </div>

          <div className="leaderboard-card">
            <div className="lb-header">
              <span className="lb-title">실시간 리더보드</span>
              <span className="lb-see-all" onClick={() => router.push('/home/result')}>전체 보기 →</span>
            </div>
            {hasPrediction === false ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '32px 0' }}>
                <div style={{ fontSize: '2em' }}>🎯</div>
                <div style={{ color: 'var(--text2)', fontSize: '14px', textAlign: 'center' }}>오늘 아직 예측하지 않으셨어요!</div>
                <button className="btn-gold" style={{ fontSize: '13px', padding: '8px 20px' }} onClick={() => router.push('/home/predict')}>
                  지금 예측해주세요
                </button>
              </div>
            ) : leaderboard.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text2)', fontSize: '14px' }}>
                데이터를 불러오는 중...
              </div>
            ) : (
              leaderboard.map((entry, idx) => {
                const rankStyle = RANK_STYLES[idx] ?? { bg: 'var(--surface2)', color: 'var(--text)' }
                const rankClass = idx < 3 ? `rank-${idx + 1}` : ''
                return (
                  <div key={entry.아이디} className="lb-row">
                    <div className={`lb-rank ${rankClass}`}>{idx + 1}</div>
                    <div className="lb-avatar" style={{ background: rankStyle.bg, color: rankStyle.color }}>
                      {entry.회원기본?.이름?.slice(0, 1) ?? entry.아이디.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="lb-user-info">
                      <div className="lb-user-name">
                        {entry.회원기본?.이름 ? `${entry.회원기본.이름}(${entry.아이디})` : entry.아이디}
                      </div>
                      <div className="lb-user-score" style={{ color: entry.종가증감구분 === 'U' ? '#FF5C5C' : '#4A90E2', fontWeight: 700 }}>
                        {formatPrediction(entry)}
                      </div>
                    </div>
                    <div className="lb-accuracy">
                      <div className="lb-pct" style={{ color: entry.종가증감구분 === 'U' ? 'var(--up)' : 'var(--down)' }}>
                        {entry.종가증감구분 === 'U' ? '▲' : '▼'}
                      </div>
                      <div className="lb-streak">예측</div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
