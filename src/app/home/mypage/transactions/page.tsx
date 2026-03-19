'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { ArrowLeft, ArrowDownToLine, Wallet, Trophy, Minus } from 'lucide-react'

interface Transaction {
  거래일시: string
  입출금구분: string
  빵갯수: number
  상태: string
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  Y: { text: '완료', color: 'var(--up)' },
  P: { text: '대기', color: 'var(--text3)' },
  N: { text: '거절', color: 'var(--down)' },
}

const TYPE_LABEL: Record<string, string> = {
  I: '충전', O: '출금', B: '예측 베팅', W: '우승 보상',
}

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'I',   label: '충전' },
  { key: 'O',   label: '출금' },
  { key: 'B',   label: '베팅' },
  { key: 'W',   label: '우승' },
]

function formatDate(raw: string) {
  if (raw.length === 14) {
    return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)} ${raw.slice(8, 10)}:${raw.slice(10, 12)}`
  }
  return raw
}

function isPlus(type: string) { return type === 'I' || type === 'W' }

export default function TransactionsPage() {
  const router = useRouter()
  const [list, setList] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) { router.replace('/'); return }
    const user = JSON.parse(stored)
    const supabase = getSupabase()

    const since = new Date(Date.now() + 9 * 60 * 60 * 1000)
    since.setDate(since.getDate() - 30)
    const sinceTs = `${since.getFullYear()}${String(since.getMonth()+1).padStart(2,'0')}${String(since.getDate()).padStart(2,'0')}000000`

    supabase.from('계좌거래내역')
      .select('거래일시, 입출금구분, 빵갯수, 상태')
      .eq('아이디', user.아이디)
      .gte('거래일시', sinceTs)
      .order('거래일시', { ascending: false })
      .then(({ data }) => {
        if (data) setList(data as unknown as Transaction[])
        setLoading(false)
      })
  }, [router])

  const filtered = filter === 'all' ? list : list.filter(tx => tx.입출금구분 === filter)

  return (
    <div style={{ minHeight: 'calc(100dvh - var(--nav-h))', background: 'var(--bg)', paddingBottom: 24 }}>
      {/* 헤더 */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', padding: 0 }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>빵 거래 내역</span>
        <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>최근 30일</span>
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 6, padding: '12px 18px', overflowX: 'auto' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: filter === f.key ? 'none' : '1px solid var(--border2)', background: filter === f.key ? 'var(--primary-gradient)' : 'transparent', color: filter === f.key ? '#fff' : 'var(--text3)', transition: 'all 0.15s' }}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 18px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, paddingTop: 40 }}>불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, paddingTop: 40 }}>내역이 없어요</div>
        ) : (
          <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {filtered.map((tx, i) => {
              const status = STATUS_LABEL[tx.상태] ?? { text: tx.상태, color: 'var(--text3)' }
              const plus = isPlus(tx.입출금구분)
              return (
                <div key={i} style={{ padding: '14px 18px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: plus ? 'rgba(255,75,75,0.1)' : 'rgba(59,139,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {tx.입출금구분 === 'I' && <Wallet size={17} color="var(--up)" />}
                    {tx.입출금구분 === 'O' && <ArrowDownToLine size={17} color="var(--down)" />}
                    {tx.입출금구분 === 'B' && <Minus size={17} color="var(--down)" />}
                    {tx.입출금구분 === 'W' && <Trophy size={17} color="var(--gold)" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{TYPE_LABEL[tx.입출금구분] ?? tx.입출금구분}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{formatDate(tx.거래일시)}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 700, color: plus ? 'var(--up)' : 'var(--down)' }}>
                      {plus ? '+' : '-'}{tx.빵갯수} 빵
                    </div>
                    <div style={{ fontSize: 11, color: status.color, marginTop: 2, fontWeight: 600 }}>{status.text}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
