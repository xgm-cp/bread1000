'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

type StockData = {
  ticker: string
  name: string
  price: string
  change: string
  changeRate: string
  sign: string // '2':상승, '5':하락, '3':보합
}

export default function HomePage() {
  const router = useRouter()
  const pathname = usePathname()
  const [stocks, setStocks] = useState<StockData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchStocks = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/stocks')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data.stocks) || data.stocks.length === 0) throw new Error('no data')
      setStocks(data.stocks)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStocks()
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

  return (
    <div className="page-home">
      <div className="home-body">

        <div className="home-hero">
          <div className="eyebrow">천원으로 시작하는 투자 감각</div>
          <h1>오늘의 <em>종가</em>,<br />당신이 맞춰보세요</h1>
          <p>실시간 주식 데이터를 바탕으로 종가를 예측하고<br />전국 투자자들과 실력을 겨뤄보세요.</p>
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
            <div className="lb-row">
              <div className="lb-rank rank-1">1</div>
              <div className="lb-avatar" style={{ background: 'linear-gradient(135deg,#FFD700,#FF8C00)', color: '#111' }}>이</div>
              <div className="lb-user-info"><div className="lb-user-name">이재윤</div><div className="lb-user-score">4,820점 · 12연속 🔥</div></div>
              <div className="lb-accuracy"><div className="lb-pct">96.4%</div><div className="lb-streak">정확도</div></div>
            </div>
            <div className="lb-row">
              <div className="lb-rank rank-2">2</div>
              <div className="lb-avatar" style={{ background: 'linear-gradient(135deg,#B0C8DC,#6B9DB5)', color: '#fff' }}>박</div>
              <div className="lb-user-info"><div className="lb-user-name">박수현</div><div className="lb-user-score">4,510점 · 8연속</div></div>
              <div className="lb-accuracy"><div className="lb-pct">94.1%</div><div className="lb-streak">정확도</div></div>
            </div>
            <div className="lb-row">
              <div className="lb-rank rank-3">3</div>
              <div className="lb-avatar" style={{ background: 'linear-gradient(135deg,#D49A6A,#A0622A)', color: '#fff' }}>최</div>
              <div className="lb-user-info"><div className="lb-user-name">최민서</div><div className="lb-user-score">4,380점 · 5연속</div></div>
              <div className="lb-accuracy"><div className="lb-pct">91.8%</div><div className="lb-streak">정확도</div></div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
