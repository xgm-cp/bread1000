'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'

const TABS = ['오늘 순위', '월간 순위']

function getPrevBusinessDay(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  // 일요일(0) → 금요일(-2), 토요일(6) → 금요일(-1)
  if (d.getDay() === 0) d.setDate(d.getDate() - 2)
  else if (d.getDay() === 6) d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

type PredictionRow = { 아이디: string; 예측종가: number; 등록일시: string; 종가증감구분: string; 종가증감값: number }
type WeeklyRankRow = { rank: number; 이름: string; count: number; 아이디: string; score: number }

function getToday(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function getFirstBusinessDayOfMonth(year: number, month: number): Date {
  const d = new Date(year, month, 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d
}

function getNthPrevBusinessDay(n: number): string {
  const d = new Date()
  let count = 0
  while (count < n) {
    d.setDate(d.getDate() - 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) count++
  }
  return d.toISOString().slice(0, 10) // YYYY-MM-DD 형식
}

export default function ResultPage() {
  const [activeTab, setActiveTab] = useState(0)
  const [displayName, setDisplayName] = useState('')
  const [predictionText, setPredictionText] = useState<string | null>(null)
  const [prevClose, setPrevClose] = useState<string | null>(null)
  const [prevCloseNum, setPrevCloseNum] = useState<number | null>(null)
  const [예측종가Num, set예측종가Num] = useState<number | null>(null)
  const [myDir, setMyDir] = useState<string>('')
  const [myDeltaVal, setMyDeltaVal] = useState<number | null>(null)
  const [myRank, setMyRank] = useState<number | null>(null)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [userId, setUserId] = useState('')
  const [currentKospi, setCurrentKospi] = useState<number | null>(null)
  const [top4, setTop3] = useState<{ rank: number; 이름: string; 예측종가: number; 종가증감구분: string; 종가증감값: number }[]>([])
  const [monthlyRanking, setMonthlyRanking] = useState<WeeklyRankRow[]>([])

  const fetchRankingByRange = (startDate: string, endDate: string, setter: (rows: WeeklyRankRow[]) => void) => {
    const supabase = getSupabase()
    Promise.all([
      // 순위=1 인 행 (기준일자 포함)
      supabase.from('종가예측내역').select('아이디, 기준일자').eq('종목코드', '0001').eq('순위', 1).gte('기준일자', startDate).lte('기준일자', endDate),
      // 해당 기간 전체 참여자 (날짜별 COUNT용)
      supabase.from('종가예측내역').select('아이디, 기준일자').eq('종목코드', '0001').gte('기준일자', startDate).lte('기준일자', endDate),
    ]).then(([{ data: rank1Data }, { data: allData }]) => {
      if (!rank1Data || rank1Data.length === 0) { setter([]); return }
      const rank1Rows = rank1Data as unknown as { 아이디: string; 기준일자: string }[]

      // 날짜별 전체 참여자 수
      const dateCountMap: Record<string, number> = {}
      if (allData) (allData as unknown as { 기준일자: string }[]).forEach(r => {
        dateCountMap[r.기준일자] = (dateCountMap[r.기준일자] ?? 0) + 1
      })

      // 유저별 count(1순위 횟수)와 score(각 날 참여자-1 합산)
      const countMap: Record<string, number> = {}
      const scoreMap: Record<string, number> = {}
      rank1Rows.forEach(r => {
        countMap[r.아이디] = (countMap[r.아이디] ?? 0) + 1
        scoreMap[r.아이디] = (scoreMap[r.아이디] ?? 0) + ((dateCountMap[r.기준일자] ?? 1) - 1)
      })

      const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1])
      const ranked: { 아이디: string; count: number; score: number; rank: number }[] = []
      let currentRank = 1
      sorted.forEach((entry, i) => {
        if (i > 0 && entry[1] < sorted[i - 1][1]) currentRank = i + 1
        ranked.push({ 아이디: entry[0], count: entry[1], score: scoreMap[entry[0]] ?? 0, rank: currentRank })
      })

      const top5 = ranked.slice(0, 5)
      const ids = top5.map(r => r.아이디)
      supabase.from('회원기본').select('아이디, 이름').in('아이디', ids).then(({ data: members }) => {
        const nameMap: Record<string, string> = {}
        if (members) (members as unknown as { 아이디: string; 이름: string }[]).forEach(m => { nameMap[m.아이디] = m.이름 })
        setter(top5.map(r => ({ ...r, 이름: nameMap[r.아이디] || r.아이디 })))
      })
    })
  }

  const fetchMonthlyRanking = () => {
    const today = new Date()
    const firstBizDay = getFirstBusinessDayOfMonth(today.getFullYear(), today.getMonth())
    const isFirstBizDay = today.toDateString() === firstBizDay.toDateString()
    let startDate: string
    if (isFirstBizDay) {
      // 당월 초영업일이면 → 전월 초일부터
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 10)
    } else {
      // 그 외 → 당월 초일부터
      startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
    }
    const endDate = getNthPrevBusinessDay(1)
    fetchRankingByRange(startDate, endDate, setMonthlyRanking)
  }

  const fetchRank = (myId: string) => {
    const today = getToday()
    Promise.all([
      fetch('/api/kospi').then(r => r.json()),
      getSupabase()
        .from('종가예측내역')
        .select('아이디, 예측종가, 등록일시, 종가증감구분, 종가증감값')
        .eq('기준일자', today)
        .eq('종목코드', '0001')
        .then(({ data }) => data ?? []),
    ]).then(([kospi, rows]) => {
      const val = Number(kospi.bstp_nmix_prpr)
      const currentKospi = isNaN(val) ? 0 : val
      if (!isNaN(val) && val > 0) setCurrentKospi(val)
      const all = rows as unknown as PredictionRow[]
      setTotalCount(all.length)

      // 전영업일 종가 대비 시장 방향 (API의 prdy_clpr 사용)
      const prevCloseVal = Number(kospi.prdy_clpr)
      const marketDir = (!isNaN(prevCloseVal) && prevCloseVal > 0)
        ? (currentKospi >= prevCloseVal ? 'U' : 'D')
        : null

      // 규칙4: 모든 회원이 반대 방향인지 확인
      const allOpposite = marketDir !== null && all.length > 0 && all.every(r => r.종가증감구분 !== marketDir)

      const sorted = [...all].sort((a, b) => {
        // 규칙1: 시장 방향 일치 우선 (전원 반대 방향이면 무시)
        if (marketDir && !allOpposite) {
          const aCorrect = a.종가증감구분 === marketDir
          const bCorrect = b.종가증감구분 === marketDir
          if (aCorrect !== bCorrect) return aCorrect ? -1 : 1
        }
        // 규칙2: 예측종가 근사치 (절대값 GAP 오름차순)
        const diffA = Math.abs(a.예측종가 - currentKospi)
        const diffB = Math.abs(b.예측종가 - currentKospi)
        if (diffA !== diffB) return diffA - diffB
        // 규칙3: 등록일시 오름차순
        return a.등록일시.localeCompare(b.등록일시)
      })
      const idx = sorted.findIndex(r => r.아이디 === myId)
      setMyRank(idx >= 0 ? idx + 1 : null)

      // top4 이름 조회
      const top4Rows = sorted.slice(0, 4)
      const top4Ids = top4Rows.map(r => r.아이디)
      if (top4Ids.length > 0) {
        getSupabase()
          .from('회원기본')
          .select('아이디, 이름')
          .in('아이디', top4Ids)
          .then(({ data }) => {
            const nameMap: Record<string, string> = {}
            if (data) (data as unknown as { 아이디: string; 이름: string }[]).forEach(m => { nameMap[m.아이디] = m.이름 })
            setTop3(top4Rows.map((r, i) => ({
              rank: i + 1,
              이름: nameMap[r.아이디] || r.아이디,
              예측종가: r.예측종가,
              종가증감구분: r.종가증감구분,
              종가증감값: r.종가증감값,
            })))
          })
      } else {
        setTop3([])
      }
    })
  }

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) return
    const user = JSON.parse(stored)
    setDisplayName(user.이름 || user.아이디 || '')
    setUserId(user.아이디)

    const prevBizDay = getPrevBusinessDay()

    // 당일 예측 데이터
    getSupabase()
      .from('종가예측내역')
      .select('종가증감구분, 종가증감값, 예측종가')
      .eq('아이디', user.아이디)
      .eq('기준일자', getToday())
      .eq('종목코드', '0001')
      .single()
      .then(({ data }) => {
        if (data) {
          const d = data as unknown as { 종가증감구분: string; 종가증감값: number; 예측종가: number }
          const isUp = d.종가증감구분 === 'U'
          setPredictionText(`${isUp ? '+' : '-'}${Number(d.종가증감값).toLocaleString()}`)
          set예측종가Num(Number(d.예측종가))
          setMyDir(d.종가증감구분)
          setMyDeltaVal(Number(d.종가증감값))
        }
      })

    // 전영업일 종가
    getSupabase()
      .from('종가관리내역')
      .select('*')
      .eq('기준일자', prevBizDay)
      .eq('종목코드', '0001')
      .single()
      .then(({ data }) => {
        if (data) {
          const row = data as Record<string, unknown>
          const val = row['종가'] ?? row['종가금액'] ?? row['종가지수'] ?? row['kospi_close'] ?? null
          if (val !== null) {
            const num = Number(val)
            setPrevCloseNum(num)
            setPrevClose(num.toLocaleString('ko-KR', { minimumFractionDigits: 2 }))
          }
        }
      })

    // 페이지 진입 시 순위 계산
    fetchRank(user.아이디)
    fetchMonthlyRanking()
  }, [])

  return (
    <div className="page-result">
      <div className="result-body">
        <div className="result-hero">
          <div className="result-badge">🎉 오늘의 결과 · {String(new Date().getMonth() + 1).padStart(2, '0')}.{String(new Date().getDate()).padStart(2, '0')}</div>
          <h2><em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>{displayName}</em>님</h2>
          <p style={{ color: 'var(--text2)', marginTop: 10 }}>
            어제종가에서{' '}
            {predictionText ? (
              <strong style={{ color: predictionText.startsWith('-') ? '#4A9EFF' : '#FF5C5C' }}>{predictionText}</strong>
            ) : '-'}{' '}
            점 예측
          </p>
        </div>

        {(() => {
          const resultColor = 예측종가Num !== null && prevCloseNum !== null
            ? 예측종가Num > prevCloseNum ? '#FF5C5C' : '#4A9EFF'
            : 'var(--text)'
          return (
            <div className="score-cards">
              <div className="score-card"><div className="score-card-label">전영업일 종가</div><div className="score-card-value up">{prevClose ?? '—'}</div><div className="score-card-sub">종목코드 0001</div></div>
              <div className="score-card">
                <div className="score-card-label">예측결과값</div>
                <div className="score-card-value" style={{ color: resultColor }}>
                  {예측종가Num !== null ? 예측종가Num.toLocaleString('ko-KR', { minimumFractionDigits: 2 }) : '-'}
                </div>
              </div>
              <div className="score-card">
                <div className="score-card-label">오늘 순위</div>
                <div className="score-card-value" style={{ color: 'var(--accent)' }}>
                  {myRank !== null ? `${myRank}위` : '-'}
                </div>
                <div className="score-card-sub">
                  {totalCount !== null ? `${totalCount}명 중` : '-'}
                </div>
              </div>
            </div>
          )
        })()}

        {(() => {
          const diff = currentKospi !== null && prevCloseNum !== null ? currentKospi - prevCloseNum : null
          const pct = diff !== null && prevCloseNum ? (diff / prevCloseNum) * 100 : null
          const isUp = diff !== null && diff >= 0
          const diffColor = diff === null ? 'var(--text)' : isUp ? '#FF5C5C' : '#4A9EFF'
          const sign = diff === null ? '' : isUp ? '+' : ''
          return (
            <div className="comparison-card">
              <div className="comparison-row">
                <div>
                  <div className="comp-stock">코스피</div>
                  <div className="comp-ticker">0001</div>
                </div>
                <div className="comp-values">
                  <div className="comp-prediction" style={{ fontSize: '1.8em' }}>
                    {currentKospi !== null && !isNaN(currentKospi) ? currentKospi.toLocaleString('ko-KR', { minimumFractionDigits: 2 }) : '-'}
                  </div>
                </div>
                <div className="comp-diff-col">
                  <div className="comp-diff" style={{ color: diffColor }}>
                    {diff !== null ? `${sign}${diff.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}` : '-'}
                  </div>
                  <div className="comp-points" style={{ color: diffColor }}>
                    {pct !== null ? `${sign}${pct.toFixed(2)}%` : '-'}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        <div className="ranking-section">
          <div className="ranking-tabs">
            {TABS.map((tab, i) => (
              <button key={tab} className={`ranking-tab${activeTab === i ? ' active' : ''}`} onClick={() => setActiveTab(i)}>{tab}</button>
            ))}
          </div>
          {activeTab === 0 && (
            <>
              <div className="ranking-row highlight" style={{ gridTemplateColumns: '38px 1fr 1fr 1fr', gap: 8 }}>
                <div className="rank-num" style={{ fontFamily: 'inherit', fontSize: 14, color: '#FFFFFF' }}>{myRank ?? '-'}</div>
                <div className="rank-name" style={{ color: '#FFFFFF' }}>나 ({displayName})</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {(() => {
                    if (!myDir || myDeltaVal === null || 예측종가Num === null || currentKospi === null) return '-'
                    const gap = 예측종가Num - currentKospi
                    const gapStr = `${gap >= 0 ? '+' : ''}${gap.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}`
                    const dirStr = myDir === 'U' ? '상승' : myDir === 'D' ? '하락' : myDir
                    return `${dirStr} / ${myDeltaVal.toLocaleString()} / ${gapStr}`
                  })()}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', textAlign: 'right', minWidth: 80 }}>
                  {예측종가Num !== null ? 예측종가Num.toLocaleString('ko-KR', { minimumFractionDigits: 2 }) : '-'}
                </div>
              </div>
              {[1, 2, 3, 4].map(rank => {
                const r = top4.find(x => x.rank === rank)
                const gap = r && currentKospi !== null ? r.예측종가 - currentKospi : null
                const gapStr = gap !== null ? `${gap >= 0 ? '+' : ''}${gap.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}` : '-'
                const dirStr = r ? (r.종가증감구분 === 'U' ? '상승' : r.종가증감구분 === 'D' ? '하락' : r.종가증감구분) : ''
                const midStr = r ? `${dirStr} / ${Number(r.종가증감값).toLocaleString()} / ${gapStr}` : '-'
                const rowColor = rank === 1 ? '#7BF5A0' : 'var(--text)'
                const midColor = rank === 1 ? '#7BF5A0' : 'var(--text2)'
                return (
                  <div key={rank} className="ranking-row" style={{ gridTemplateColumns: '38px 1fr 1fr 1fr', gap: 8 }}>
                    <div className={`rank-num rank-${rank}`} style={rank === 1 ? { color: '#7BF5A0' } : {}}>{rank}</div>
                    <div className="rank-name" style={{ color: rowColor }}>{r ? r.이름 : '-'}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: midColor, textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>{midStr}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: rowColor, textAlign: 'right', minWidth: 80 }}>
                      {r ? r.예측종가.toLocaleString('ko-KR', { minimumFractionDigits: 2 }) : '-'}
                    </div>
                  </div>
                )
              })}
            </>
          )}
          {activeTab === 1 && (
            <>
              {monthlyRanking.length === 0 ? (
                <div style={{ padding: '24px 16px', color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>월간 데이터가 없습니다</div>
              ) : (
                [1, 2, 3, 4, 5].map(rank => {
                  const rows = monthlyRanking.filter(r => r.rank === rank)
                  if (rows.length === 0) return (
                    <div key={rank} className="ranking-row" style={{ gridTemplateColumns: '38px 1fr auto', gap: 8 }}>
                      <div className={`rank-num rank-${Math.min(rank, 3)}`}>{rank}</div>
                      <div className="rank-name" style={{ color: 'var(--text3)' }}>-</div>
                      <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'right' }}>-</div>
                    </div>
                  )
                  return rows.map((r, i) => (
                    <div key={`${rank}-${i}`} className={`ranking-row${r.아이디 === userId ? ' highlight' : ''}`} style={{ gridTemplateColumns: '38px 1fr auto', gap: 8 }}>
                      <div className={`rank-num rank-${Math.min(rank, 3)}`} style={r.아이디 === userId ? { color: '#7BF5A0' } : {}}>{rank}</div>
                      <div className="rank-name" style={r.아이디 === userId ? { color: '#7BF5A0' } : {}}>{r.아이디 === userId ? `나 (${r.이름})` : r.이름}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: r.아이디 === userId ? '#7BF5A0' : 'var(--text2)', textAlign: 'right' }}>{r.count}회 ({r.score}개)</div>
                    </div>
                  ))
                })
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
