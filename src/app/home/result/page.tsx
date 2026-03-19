'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import * as XLSX from 'xlsx-js-style'

function getPrevBusinessDayOf(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`)
  d.setDate(d.getDate() - 1)
  if (d.getDay() === 0) d.setDate(d.getDate() - 2)
  else if (d.getDay() === 6) d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function toYYYYMMDD(isoDate: string): string {
  return isoDate.replace(/-/g, '')
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

type MemberRow = Record<string, unknown>
type PredEntry = { 아이디: string; 기준일자: string; 순위: number }
type TxEntry = { 아이디: string; 입출금구분: string; 빵갯수: number; 상태: string }

export default function ResultPage() {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [userId, setUserId] = useState('')
  const [myRank1Count, setMyRank1Count] = useState<number | null>(null)

  // grid data
  const [gridMembers, setGridMembers] = useState<MemberRow[]>([])
  const [gridPredMap, setGridPredMap] = useState<Record<string, Record<string, number>>>({})
  const [gridDayCounts, setGridDayCounts] = useState<Record<string, number>>({})
  const [breadMap, setBreadMap] = useState<Record<string, number>>({})
  const [deductMap, setDeductMap] = useState<Record<string, number>>({})
  const [increaseMap, setIncreaseMap] = useState<Record<string, number>>({})

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) return
    const user = JSON.parse(stored)
    setUserId(user.아이디)

    const [sy, sm] = selectedDate.split('-')
    const firstDay = `${sy}${sm}01`
    const lastDayNum = new Date(Number(sy), Number(sm), 0).getDate()
    const lastDay = `${sy}${sm}${String(lastDayNum).padStart(2, '0')}`
    const todayStr = getToday()

    // 이달 나의 1위 횟수
    setMyRank1Count(null)
    getSupabase()
      .from('종가예측내역')
      .select('기준일자', { count: 'exact', head: true })
      .eq('아이디', user.아이디)
      .eq('종목코드', '0001')
      .eq('순위', 1)
      .gte('기준일자', firstDay)
      .lte('기준일자', lastDay)
      .neq('기준일자', todayStr)
      .then(({ count }) => setMyRank1Count(count ?? 0))

    // 전체 회원 + 해당월 예측 데이터 + 빵보유기본 + 계좌거래내역
    Promise.all([
      getSupabase().from('회원기본').select('*'),
      getSupabase()
        .from('종가예측내역')
        .select('아이디, 기준일자, 순위')
        .eq('종목코드', '0001')
        .gte('기준일자', firstDay)
        .lte('기준일자', lastDay),
      getSupabase().from('빵보유기본').select('*'),
      getSupabase()
        .from('계좌거래내역')
        .select('아이디, 입출금구분, 빵갯수, 상태')
        .eq('상태', 'Y')
        .gte('거래일시', `${sy}${sm}01000000`)
        .lte('거래일시', `${sy}${sm}${String(lastDayNum).padStart(2,'0')}235959`),
    ]).then(([{ data: members }, { data: preds }, { data: breads }, { data: txs }]) => {
      setGridMembers((members ?? []) as MemberRow[])

      // 아이디 -> 빵갯수
      const bMap: Record<string, number> = {}
      if (breads) {
        (breads as unknown as Record<string, unknown>[]).forEach(b => {
          const id = String(b['아이디'] ?? '')
          const qty = Number(b['빵갯수'] ?? b['갯수'] ?? b['수량'] ?? b['잔액'] ?? 0)
          bMap[id] = qty
        })
      }
      setBreadMap(bMap)

      // 아이디 -> 차감/증가 합계
      const dMap: Record<string, number> = {}
      const iMap: Record<string, number> = {}
      if (txs) {
        (txs as unknown as TxEntry[]).forEach(tx => {
          const id = tx.아이디
          const qty = Number(tx.빵갯수 ?? 0)
          if (tx.입출금구분 === 'I') {
            iMap[id] = (iMap[id] ?? 0) + qty
          } else {
            dMap[id] = (dMap[id] ?? 0) + qty
          }
        })
      }
      setDeductMap(dMap)
      setIncreaseMap(iMap)

      const predRows = (preds ?? []) as unknown as PredEntry[]

      // 아이디 -> 기준일자(YYYYMMDD) -> 순위
      const predMap: Record<string, Record<string, number>> = {}
      const dayCounts: Record<string, number> = {}
      predRows.forEach(r => {
        const dateKey = String(r.기준일자).replace(/-/g, '') // YYYY-MM-DD or YYYYMMDD 모두 처리
        if (!predMap[r.아이디]) predMap[r.아이디] = {}
        predMap[r.아이디][dateKey] = r.순위
        dayCounts[dateKey] = (dayCounts[dateKey] ?? 0) + 1
      })
      setGridPredMap(predMap)
      setGridDayCounts(dayCounts)
    })
  }, [selectedDate])

  // 선택 월의 모든 날짜 생성
  const [sy, sm] = selectedDate.split('-')
  const year = Number(sy), month = Number(sm)
  const daysInMonth = new Date(year, month, 0).getDate()
  const allDays: string[] = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    return `${sy}${sm}${String(d).padStart(2, '0')}`
  })

  const isWeekend = (yyyymmdd: string) => {
    const d = new Date(`${yyyymmdd.slice(0,4)}-${yyyymmdd.slice(4,6)}-${yyyymmdd.slice(6,8)}`)
    return d.getDay() === 0 || d.getDay() === 6
  }

  const selectStyle: React.CSSProperties = {
    background: 'transparent', border: 'none', borderBottom: '1px solid var(--text3)',
    color: 'inherit', fontSize: 'inherit', fontFamily: 'inherit', outline: 'none', cursor: 'pointer'
  }

  const today = new Date()
  const currentYear = today.getFullYear()
  const [y, m] = selectedDate.split('-').map(Number)

  const handleDownload = () => {
    const todayStr = getToday()
    const fixedCols = 5

    // 헤더 행
    const header = ['성명', 'ID', '빵잔액', '차감', '증가', ...allDays.map(d => `${Number(d.slice(4,6))}/${Number(d.slice(6,8))}`)]

    // 데이터 행
    const rows = gridMembers.map(member => {
      const id = String(member['아이디'] ?? '')
      const name = String(member['이름'] ?? '')
      const bread = breadMap[id] ?? 0
      const deduct = deductMap[id] ?? 0
      const increase = increaseMap[id] ?? 0
      const dayCells = allDays.map(d => {
        const isToday = d === todayStr
        const beforeCutoff = isToday && new Date().getHours() < 16
        const rank = beforeCutoff ? undefined : gridPredMap[id]?.[d]
        if (rank === 1) return 'O'
        if (rank !== undefined) return 'X'
        return '-'
      })
      return [name, id, bread, deduct, increase, ...dayCells]
    })

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])

    const borderStyle = {
      top:    { style: 'thin', color: { rgb: 'CCCCCC' } },
      bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
      left:   { style: 'thin', color: { rgb: 'CCCCCC' } },
      right:  { style: 'thin', color: { rgb: 'CCCCCC' } },
    }
    const grayFill = { patternType: 'solid', fgColor: { rgb: 'D9D9D9' } }
    const headerFill = { patternType: 'solid', fgColor: { rgb: '2D2D2D' } }

    const totalRows = rows.length + 1 // +1 for header
    const totalCols = header.length

    for (let r = 0; r < totalRows; r++) {
      for (let c = 0; c < totalCols; c++) {
        const cellAddr = XLSX.utils.encode_cell({ r, c })
        if (!ws[cellAddr]) continue

        const isHeader = r === 0
        const dayIdx = c - fixedCols
        const isWeekendCol = dayIdx >= 0 && isWeekend(allDays[dayIdx])

        ws[cellAddr].s = {
          border: borderStyle,
          fill: isHeader ? headerFill : isWeekendCol ? grayFill : { patternType: 'none' },
          font: isHeader
            ? { bold: true, color: { rgb: 'FFFFFF' } }
            : { color: { rgb: '222222' } },
          alignment: { horizontal: c >= fixedCols ? 'center' : 'left', vertical: 'center' },
        }
      }
    }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${sy}-${sm}`)
    XLSX.writeFile(wb, `bread1000_${sy}${sm}.xlsx`)
  }

  return (
    <div className="page-result">
      <div className="result-body">
        {/* 날짜 선택 */}
        <div className="result-hero">
          <div className="result-badge" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span>🎉 결과 조회</span>
            <select value={y} onChange={e => {
              const lastDay = new Date(Number(e.target.value), m, 0).getDate()
              setSelectedDate(`${e.target.value}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`)
            }} style={selectStyle}>
              {Array.from({ length: currentYear - 2025 + 1 }, (_, i) => 2025 + i).map(yr => (
                <option key={yr} value={yr}>{yr}년</option>
              ))}
            </select>
            <select value={m} onChange={e => {
              const lastDay = new Date(y, Number(e.target.value), 0).getDate()
              setSelectedDate(`${y}-${String(e.target.value).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`)
            }} style={selectStyle}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(mo => (
                <option key={mo} value={mo}>{mo}월</option>
              ))}
            </select>
            <button onClick={handleDownload} title="엑셀 다운로드" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A9EFF', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>
              ⬇️
            </button>
          </div>
        </div>

        {/* 나의 결과 카드 */}
        <div className="comparison-card">
          <div className="comparison-row">
            <div>
              <div className="comp-stock">나의 결과</div>
              <div className="comp-ticker">{String(month).padStart(2,'0')}월 기준</div>
            </div>
            <div className="comp-values">
              <div style={{ fontSize: 15, color: 'var(--text2)' }}>
                해당월 1위 : {myRank1Count !== null ? `${myRank1Count}회` : '-'}
              </div>
            </div>
            <div className="comp-diff-col"></div>
          </div>
        </div>

        {/* 그리드 테이블 */}
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap', width: '100%' }}>
            <thead>
              {/* 날짜 헤더 */}
              <tr>
                <th style={thFixed}>성명</th>
                <th style={thNotFixed}>ID</th>
                <th style={thNotFixed}>빵잔액</th>
                <th style={{ ...thNotFixed, textAlign: 'right' }}>차감</th>
                <th style={{ ...thNotFixed, textAlign: 'right' }}>증가</th>
                {allDays.map(d => (
                  <th key={d} style={{
                    ...thDay,
                    color: isWeekend(d) ? '#555' : 'var(--text2)',
                    background: isWeekend(d) ? 'rgba(255,255,255,0.08)' : 'var(--bg2, #111)',
                  }}>
                    {Number(d.slice(6, 8))}
                  </th>
                ))}
              </tr>
              {/* 날짜별 참여자 수 */}
              <tr>
                <td style={{ ...thFixed, color: 'var(--text3)', fontSize: 10 }} colSpan={1}></td>
                <td style={{ ...thNotFixed, color: 'var(--text3)', fontSize: 10 }} colSpan={4}></td>
                {allDays.map(d => (
                  <td key={d} style={{
                    ...thDay,
                    color: '#888',
                    fontSize: 10,
                    background: isWeekend(d) ? 'rgba(255,255,255,0.08)' : 'var(--bg2, #111)',
                  }}>
                    {gridDayCounts[d] ?? 0}
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {gridMembers.map((member, idx) => {
                const id = String(member['아이디'] ?? '')
                const name = String(member['이름'] ?? '')
                const bread = breadMap[id] ?? 0
                const isMe = id === userId
                return (
                  <tr key={id} style={{ background: isMe ? 'rgba(123,245,160,0.08)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <td style={{ ...tdFixed, color: isMe ? '#7BF5A0' : 'var(--text)', fontWeight: isMe ? 700 : 400 }}>
                      {isMe ? `★${name}` : name}
                    </td>
                    <td style={{ ...tdNotFixed, color: '#4A9EFF' }}>{id}</td>
                    <td style={{ ...tdNotFixed, color: bread > 0 ? '#FFA500' : 'var(--text3)', textAlign: 'right' as const }}>{bread.toLocaleString()}</td>
                    <td style={{ ...tdNotFixed, color: deductMap[id] ? '#FF5C5C' : 'var(--text3)', textAlign: 'right' as const }}>{deductMap[id] ? `-${(deductMap[id]).toLocaleString()}` : '-'}</td>
                    <td style={{ ...tdNotFixed, color: increaseMap[id] ? '#2ECC8A' : 'var(--text3)', textAlign: 'right' as const }}>{increaseMap[id] ? `+${(increaseMap[id]).toLocaleString()}` : '-'}</td>
                    {allDays.map(d => {
                      const isToday = d === getToday()
                      const beforeCutoff = isToday && new Date().getHours() < 16
                      const rank = beforeCutoff ? undefined : gridPredMap[id]?.[d]
                      const isFirst = rank === 1
                      const participated = rank !== undefined
                      return (
                        <td key={d} style={{
                          ...tdDay,
                          background: isFirst ? 'rgba(255,140,0,0.25)' : isWeekend(d) ? 'rgba(255,255,255,0.08)' : 'transparent',
                          color: isFirst ? '#FFA500' : participated ? 'var(--text2)' : '#444',
                          fontWeight: isFirst ? 700 : 400,
                        }}>
                          {isFirst ? 'O' : participated ? 'X' : '-'}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const thFixed: React.CSSProperties = {
  padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #333',
  background: 'var(--bg2, #111)', color: 'var(--text2)', fontWeight: 600,
  position: 'sticky', left: 0, zIndex: 2,
}
const thNotFixed: React.CSSProperties = {
  padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #333',
  background: 'var(--bg2, #111)', color: 'var(--text2)', fontWeight: 600,
}
const thDay: React.CSSProperties = {
  padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #333',
  minWidth: 28,
}
const tdFixed: React.CSSProperties = {
  padding: '5px 8px', borderBottom: '1px solid #222',
  position: 'sticky', left: 0, zIndex: 1,
  background: 'var(--bg, #0d0d0d)',
}
const tdNotFixed: React.CSSProperties = {
  padding: '5px 8px', borderBottom: '1px solid #222',
}
const tdDay: React.CSSProperties = {
  padding: '4px 4px', textAlign: 'center', borderBottom: '1px solid #222',
  fontSize: 12,
}
