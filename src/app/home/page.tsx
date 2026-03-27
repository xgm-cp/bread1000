'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { getAvatar } from '@/lib/avatar'
import { RefreshCw, Croissant } from 'lucide-react'

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
  등록일시: string
  회원기본: { 이름: string } | null
  displayTime?: string
}


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
  if (direction === 'up') return `▲ ${Math.abs(Number(change)).toLocaleString('ko-KR')}`
  if (direction === 'down') return `▼ ${Math.abs(Number(change)).toLocaleString('ko-KR')}`
  return Math.abs(Number(change)).toLocaleString('ko-KR')
}

function formatRate(rate: string, sign: string) {
  const direction = getSign(sign)
  const prefix = direction === 'up' ? '+' : direction === 'down' ? '-' : ''
  return `${prefix}${Math.abs(Number(rate)).toFixed(2)}%`
}

function formatPrediction(entry: LeaderboardEntry, kospiPrice: number) {
  const dir = entry.종가증감구분 === 'U' ? '▲' : '▼'
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

export default function HomePage() {
  const router = useRouter()
  const pathname = usePathname()
  const [stocks, setStocks] = useState<StockData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [hasPrediction, setHasPrediction] = useState<boolean | null>(null)
  const [rawLeaderboard, setRawLeaderboard] = useState<LeaderboardEntry[]>([])
  const [kospiPrice, setKospiPrice] = useState(0)
  const [kospiDir, setKospiDir] = useState('')
  const [myId, setMyId] = useState<string | null>(null)
  const [isTradingDay, setIsTradingDay] = useState<boolean | null>(null)
  const [supabaseFallback, setSupabaseFallback] = useState(false)
  const isMounted = useRef(true)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const fetchStocks = useCallback(async (retryCount = 0) => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/stocks')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data.stocks) || data.stocks.length === 0) throw new Error('no data')
      if (!isMounted.current) return

      // 코스피 없으면 재시도 (코스피는 종목 표시 + 리더보드 순위 산정의 기준)
      const kospi = data.stocks.find((s: StockData) => s.ticker === '0001')
      if (!kospi) {
        if (retryCount < 3 && isMounted.current) {
          timers.current.push(setTimeout(() => fetchStocks(retryCount + 1), 2000))
        } else if (isMounted.current) {
          setStocks(data.stocks)
          setLoading(false)
        }
        return
      }

      setStocks(data.stocks)
      // 성공 시 클라이언트 캐시 갱신 (API 실패 시 최후 폴백용)
      try {
        sessionStorage.setItem('stocksCache', JSON.stringify({ stocks: data.stocks }))
        sessionStorage.setItem('kospiPrice', kospi.price)
        const dir = (kospi.sign === '2' || kospi.sign === '1') ? 'U' : 'D'
        sessionStorage.setItem('kospiDir', dir)
      } catch { }
      const price = Number(kospi.price)
      setKospiPrice(price)
      const dir = (kospi.sign === '2' || kospi.sign === '1') ? 'U' : 'D'
      setKospiDir(dir)

      // 코스닥/KODEX 200이 빠진 경우 백그라운드에서 1회 재시도 (코스피 표시에 영향 없음)
      if (data.partial) {
        timers.current.push(setTimeout(async () => {
          if (!isMounted.current) return
          try {
            const res2 = await fetch('/api/stocks')
            if (!res2.ok) return
            const data2 = await res2.json()
            if (!Array.isArray(data2.stocks) || !isMounted.current) return
            setStocks(prev => {
              const map = new Map(prev.map((s: StockData) => [s.ticker, s]))
              for (const s of data2.stocks) map.set(s.ticker, s)
              return [...map.values()]
            })
          } catch { }
        }, 3000))
      }
    } catch {
      if (retryCount < 3 && isMounted.current) {
        timers.current.push(setTimeout(() => fetchStocks(retryCount + 1), 2000))
        return
      }
      // 모든 재시도 소진 → 클라이언트 캐시 폴백
      if (isMounted.current) {
        try {
          const cached = sessionStorage.getItem('stocksCache')
          if (cached) {
            const { stocks: cachedStocks } = JSON.parse(cached)
            if (Array.isArray(cachedStocks) && cachedStocks.length > 0) {
              setStocks(cachedStocks)
              const cachedKospiPrice = Number(sessionStorage.getItem('kospiPrice') ?? '0')
              if (cachedKospiPrice > 0) setKospiPrice(cachedKospiPrice)
              const cachedKospiDir = sessionStorage.getItem('kospiDir') ?? ''
              if (cachedKospiDir) setKospiDir(cachedKospiDir)
              setLoading(false)
              return
            }
          }
        } catch { }
        // sessionStorage 캐시도 없으면 → Supabase 종가관리내역 폴백
        try {
          const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
          const { data: rawSupaData } = await getSupabase()
            .from('종가관리내역')
            .select('종가')
            .eq('기준일자', today)
            .eq('종목코드', '0001')
            .maybeSingle()
          const supaData = rawSupaData as unknown as { 종가: number } | null
          if (supaData && isMounted.current) {
            const fallbackStock: StockData = {
              ticker: '0001',
              name: '코스피',
              price: String(supaData.종가),
              change: '0',
              changeRate: '0.00',
              sign: '3',
            }
            setStocks([fallbackStock])
            setKospiPrice(Number(supaData.종가))
            setSupabaseFallback(true)
            setLoading(false)
            return
          }
        } catch { }
        setError(true)
        setLoading(false)
      }
      return
    }
    if (isMounted.current) setLoading(false)
  }, [])

  useEffect(() => {
    // 거래일 여부 확인 (하루 1회 캐시)
    const checkTradingDay = async () => {
      const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
      const dateStr = kst.toISOString().slice(0, 10)
      const dateKey = dateStr.replace(/-/g, '')
      try {
        const cached = sessionStorage.getItem('tradingDayCache')
        if (cached) {
          const { date, isTradingDay: cached_result } = JSON.parse(cached)
          if (date === dateStr) { setIsTradingDay(cached_result); return }
        }
        const res = await fetch(`/api/trading-day?date=${dateKey}`)
        const data = await res.json()
        setIsTradingDay(data.isTradingDay)
        sessionStorage.setItem('tradingDayCache', JSON.stringify({ date: dateStr, isTradingDay: data.isTradingDay }))
      } catch {
        setIsTradingDay(true) // API 실패 시 영업일로 간주
      }
    }
    checkTradingDay()
  }, [])

  useEffect(() => {
    isMounted.current = true
    const run = async () => {
      await fetchStocks()

      const stored = localStorage.getItem('user')
      if (!stored) return
      let user: { 아이디: string }
      try {
        user = JSON.parse(stored)
      } catch {
        return
      }
      setMyId(user.아이디)
      const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

      // 로그인 유저 예측 여부 확인 (최대 3회 재시도)
      const fetchPrediction = async (retryCount = 0) => {
        const { count, error } = await getSupabase()
          .from('종가예측내역')
          .select('아이디', { count: 'exact', head: true })
          .eq('기준일자', today)
          .eq('아이디', user.아이디)
        if (error) {
          if (retryCount < 3 && isMounted.current) {
            timers.current.push(setTimeout(() => fetchPrediction(retryCount + 1), 2000))
          }
          return
        }
        if (!isMounted.current) return
        const predicted = (count ?? 0) > 0
        setHasPrediction(predicted)

        const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
        const after930 = kstNow.getUTCHours() > 9 || (kstNow.getUTCHours() === 9 && kstNow.getUTCMinutes() >= 30)

        // 예측한 경우 또는 09:30 이후면 리더보드 조회 (최대 3회 재시도)
        if (predicted || after930) {
          const fetchLeaderboard = async (retryCount = 0) => {
            const { data, error } = await getSupabase()
              .from('종가예측내역')
              .select('아이디, 예측종가, 종가증감구분, 종가증감값, 순위, 등록일시, 회원기본(이름)')
              .eq('기준일자', today)
              .eq('종목코드', '0001')
              .limit(50)
            if (error) {
              if (retryCount < 3 && isMounted.current) {
                timers.current.push(setTimeout(() => fetchLeaderboard(retryCount + 1), 2000))
              }
              return
            }
            if (!data || !isMounted.current) return
            const entries = (data as unknown as LeaderboardEntry[]).map(e => ({
              ...e,
              displayTime: new Date(e.등록일시).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
            }))
            setRawLeaderboard(entries)
          }
          fetchLeaderboard()
        }
      }
      fetchPrediction()
    }
    run()
    return () => { isMounted.current = false; timers.current.forEach(clearTimeout); timers.current = [] }
  }, [fetchStocks, pathname])

  const leaderboard = useMemo(() => {
    const tsMap = new Map(rawLeaderboard.map(e => [e.아이디, new Date(e.등록일시).getTime()]))
    return [...rawLeaderboard].sort((a, b) => {
      // 1순위: 방향 일치 여부
      const aDir = kospiDir ? (a.종가증감구분 === kospiDir ? 0 : 1) : 0
      const bDir = kospiDir ? (b.종가증감구분 === kospiDir ? 0 : 1) : 0
      if (aDir !== bDir) return aDir - bDir

      // 2순위: 현재 코스피와의 오차 오름차순
      if (kospiPrice > 0) {
        const aDiff = Math.abs(a.예측종가 - kospiPrice)
        const bDiff = Math.abs(b.예측종가 - kospiPrice)
        if (aDiff !== bDiff) return aDiff - bDiff
      }

      // 3순위: 등록일시 오름차순
      return (tsMap.get(a.아이디) ?? 0) - (tsMap.get(b.아이디) ?? 0)
    }).slice(0, 10)
  }, [rawLeaderboard, kospiPrice, kospiDir])

  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const isAfter930 = kstNow.getUTCHours() > 9 || (kstNow.getUTCHours() === 9 && kstNow.getUTCMinutes() >= 30)
  const isAfter16 = kstNow.getUTCHours() >= 16

  return (
    <div className="page-home">
      <div className="home-body">

        <div className="home-hero">
          <div className="hero-floaters">
            <Croissant className="hero-float" size={28} />
            <Croissant className="hero-float" size={20} />
          </div>
          <div className="eyebrow">하루 1빵 · 오늘의 배팅</div>
          <h1>종가를 맞히면<br /><em>빵이 쌓인다</em></h1>
          <p>
            가장 근접한 한 명이<br />
            오늘 모인 <strong style={{ color: 'var(--gold)' }}>빵을 전부</strong> 획득
          </p>
          <div className="home-cta">
            {isTradingDay === true ? (
              <button className="btn-gold" onClick={() => router.push('/home/predict')}>
                <span className="btn-gold-inner"><Croissant size={16} /> 지금 예측하기</span>
              </button>
            ) : isTradingDay === false ? (
              <div style={{ fontSize: '13px', color: 'var(--text2)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 20px' }}>
                🏖️ 오늘은 휴장일입니다
              </div>
            ) : null}
          </div>
        </div>

        {isTradingDay && <div className="home-grid">
          <div>
            <div className="section-header">
              <div className="section-title">오늘의 종목</div>
              <button
                className={`section-sub${refreshing ? ' loading' : ''}`}
                onClick={async () => {
                  if (refreshing) return
                  setRefreshing(true)
                  await Promise.all([
                    fetchStocks(),
                    new Promise<void>(r => setTimeout(r, 700)),
                  ])
                  setRefreshing(false)
                }}
              >
                <RefreshCw size={14} className={refreshing ? 'icon-spin' : ''} />
              </button>
            </div>
            {error && stocks.length > 0 && (
              <div style={{ fontSize: '11px', color: '#FF5C5C', padding: '4px 0 6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                ⚠ 갱신 실패 · 이전 데이터를 표시 중입니다
              </div>
            )}
            <div className="stock-grid">
              {loading && stocks.length === 0
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
                : error && stocks.length === 0
                ? (
                    <div className="stock-card" style={{ gridColumn: '1 / -1', justifyContent: 'center', flexDirection: 'column', gap: '8px', textAlign: 'center' }}>
                      <div className="stock-name" style={{ color: '#ff6b6b' }}>데이터를 불러오지 못했습니다</div>
                      <button className="btn-ghost" onClick={() => fetchStocks()} style={{ fontSize: '0.85em' }}>다시 시도</button>
                    </div>
                  )
                : stocks.map(stock => {
                    const direction = getSign(stock.sign)
                    const isKospi = stock.ticker === '0001'
                    return (
                      <div key={stock.ticker} className={`stock-card${isKospi ? ' stock-card-main' : ''}`}>
                        <div className="stock-card-left">
                          <div className="stock-card-top">
                            <div className="stock-ticker">{stock.ticker}</div>
                            {isKospi && (
                              <span className="stock-card-main-badge">예측 대상</span>
                            )}
                            {!(isKospi && supabaseFallback) && (
                              <div className={`stock-badge badge-${direction}`}>
                                {formatRate(stock.changeRate, stock.sign)}
                              </div>
                            )}
                          </div>
                          <div className="stock-name">{stock.name}</div>
                        </div>
                        <div className="stock-card-right">
                          <div className="stock-price" style={isKospi ? { fontSize: '26px' } : undefined}>{formatPrice(stock.price)}</div>
                          {!(isKospi && supabaseFallback) && (
                            <div className={`stock-change change-${direction}`}>
                              {formatChange(stock.change, stock.sign)}
                            </div>
                          )}
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
            </div>
            {hasPrediction === false && !isAfter930 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '32px 0' }}>
                <div style={{ fontSize: '2em' }}>🎯</div>
                <div style={{ color: 'var(--text2)', fontSize: '14px', textAlign: 'center' }}>오늘 아직 예측하지 않으셨어요!</div>
                <button className="btn-gold" style={{ fontSize: '13px', padding: '8px 20px' }} onClick={() => router.push('/home/predict')}>
                  지금 예측해주세요
                </button>
              </div>
            ) : loading || leaderboard.length === 0 || kospiPrice === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text2)', fontSize: '14px' }}>
                데이터를 불러오는 중...
              </div>
            ) : (
              <>
                {isAfter16 && leaderboard.length > 0 && (() => {
                  const winner = leaderboard[0]
                  return (
                    <div className="lb-winner-banner">
                      <span className="lb-winner-badge">WINNER</span>
                      <div className="lb-winner-avatar">
                        {getAvatar(winner.아이디)}
                      </div>
                      <div className="lb-winner-info">
                        <div className="lb-winner-name">
                          {winner.회원기본?.이름 ? `${winner.회원기본.이름}(${winner.아이디})` : winner.아이디}
                        </div>
                        <div className="lb-winner-score" style={{ color: winner.종가증감구분 === 'U' ? '#FF5C5C' : '#4A90E2' }}>
                          {formatPrediction(winner, kospiPrice)}
                        </div>
                      </div>
                      <div style={{ fontSize: '1.5em' }}>🏆</div>
                    </div>
                  )
                })()}
              {leaderboard.map((entry, idx) => {
                const isMe = myId === entry.아이디
                return (
                  <div key={entry.아이디} className={`lb-row${idx === 0 ? ' lb-row-first' : ''}`} style={isMe ? { borderLeft: '2px solid var(--gold)' } : undefined}>
                    <div className={`lb-rank${idx === 0 ? ' rank-1' : ''}`}>{idx === 0 ? '👑' : idx + 1}</div>
                    <div className="lb-avatar">
                      {getAvatar(entry.아이디)}
                    </div>
                    <div className="lb-user-info">
                      <div className="lb-user-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {entry.회원기본?.이름 ? `${entry.회원기본.이름}(${entry.아이디})` : entry.아이디}
                        {isMe && (
                          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gold)', background: 'rgba(255, 200, 0, 0.15)', padding: '1px 5px', borderRadius: '4px' }}>나</span>
                        )}
                        <span style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 400 }}>
                          {entry.displayTime}
                        </span>
                      </div>
                      <div className="lb-user-score" style={{ color: entry.종가증감구분 === 'U' ? '#FF5C5C' : '#4A90E2', fontWeight: 700 }}>
                        {formatPrediction(entry, kospiPrice)}
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
              })}
              </>
            )}
          </div>
        </div>}

      </div>
    </div>
  )
}
