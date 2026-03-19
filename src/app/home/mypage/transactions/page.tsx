'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { ArrowLeft, ArrowDownToLine, Wallet, Trophy, Minus } from 'lucide-react'

interface Transaction {
  거래일시: string
  입출금구분: string   // I=충전, O=출금
  빵갯수: number
  상태: string        // P=대기, Y=승인, N=거절
  메모?: string | null
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  Y: { text: '완료', color: 'var(--up)' },
  P: { text: '대기', color: 'var(--text3)' },
  N: { text: '거절', color: 'var(--down)' },
}

function formatDate(raw: string) {
  if (raw.length === 14) {
    return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)} ${raw.slice(8, 10)}:${raw.slice(10, 12)}`
  }
  return raw
}

export default function TransactionsPage() {
  const router = useRouter()
  const [list, setList] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) { router.replace('/'); return }
    const user = JSON.parse(stored)
    const supabase = getSupabase()

    supabase.from('계좌거래내역')
      .select('거래일시, 입출금구분, 빵갯수, 상태, 메모')
      .eq('아이디', user.아이디)
      .order('거래일시', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setList(data as unknown as Transaction[])
        setLoading(false)
      })
  }, [router])

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 40 }}>
      {/* 헤더 */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', padding: 0 }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>빵 거래 내역</span>
      </div>

      <div style={{ padding: '16px 18px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, paddingTop: 40 }}>불러오는 중...</div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, paddingTop: 40 }}>거래 내역이 없어요</div>
        ) : (
          <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {list.map((tx, i) => {
              const isIn = tx.입출금구분 === 'I'
              const status = STATUS_LABEL[tx.상태] ?? { text: tx.상태, color: 'var(--text3)' }
              return (
                <div key={i} style={{ padding: '14px 18px', borderBottom: i < list.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
                  {/* 아이콘 */}
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: isIn ? 'rgba(255,75,75,0.1)' : 'rgba(59,139,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isIn
                      ? <Wallet size={17} color="var(--up)" />
                      : <ArrowDownToLine size={17} color="var(--down)" />}
                  </div>
                  {/* 내용 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
                      {isIn ? '충전' : '출금'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{formatDate(tx.거래일시)}</div>
                  </div>
                  {/* 금액 + 상태 */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 700, color: isIn ? 'var(--up)' : 'var(--down)' }}>
                      {isIn ? '+' : '-'}{tx.빵갯수}빵
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
