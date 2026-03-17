'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { RefreshCw, Check, X, ArrowLeft } from 'lucide-react'

interface Request {
  아이디: string
  거래일시: string
  입출금구분: string
  빵갯수: number
  상태: string
}

const btnBase: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 8, border: 'none',
  fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
}

export default function AdminPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('user')
    if (!stored || JSON.parse(stored).role !== 1) {
      router.push('/home')
      return
    }
    fetchRequests()
  }, [router])

  async function fetchRequests() {
    setLoading(true)
    const supabase = getSupabase()
    const { data } = await supabase
      .from('계좌거래내역')
      .select('*')
      .order('등록일시', { ascending: false })
    setRequests((data as unknown as Request[]) || [])
    setLoading(false)
  }

  async function approve(req: Request) {
    const key = req.아이디 + req.거래일시
    setProcessing(key)
    const supabase = getSupabase()

    await supabase.from('계좌거래내역')
      .update({ 상태: 'Y' })
      .eq('아이디', req.아이디)
      .eq('거래일시', req.거래일시)

    const { data: balance } = await supabase
      .from('빵보유기본')
      .select('빵갯수')
      .eq('아이디', req.아이디)
      .single()

    const current = (balance as unknown as { 빵갯수: number } | null)?.빵갯수 ?? 0
    const next = req.입출금구분 === 'I' ? current + req.빵갯수 : current - req.빵갯수

    await supabase.from('빵보유기본')
      .upsert({ 아이디: req.아이디, 빵갯수: Math.max(0, next) })

    setProcessing(null)
    fetchRequests()
  }

  async function reject(req: Request) {
    const key = req.아이디 + req.거래일시
    setProcessing(key)
    const supabase = getSupabase()
    await supabase.from('계좌거래내역')
      .update({ 상태: 'N' })
      .eq('아이디', req.아이디)
      .eq('거래일시', req.거래일시)
    setProcessing(null)
    fetchRequests()
  }

  const statusLabel: Record<string, string> = { P: '대기', Y: '승인', N: '거절' }
  const statusColor: Record<string, string> = { P: '#E8C96A', Y: '#2ECC8A', N: '#FF5C5C' }

  return (
    <div style={{ minHeight: '100dvh', background: '#0A0C0F', color: '#EEF0F4' }}>
      {/* 헤더 */}
      <nav style={{ height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid #1E2430', background: 'rgba(10,12,15,0.95)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, background: 'linear-gradient(135deg,#FF3D78,#9B2FC9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          ADMIN
        </div>
        <button onClick={() => router.push('/home')} style={{ background: 'none', border: '1px solid #252D3A', color: '#8892A0', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={14} /> 홈으로
        </button>
      </nav>

      <div style={{ padding: '20px 20px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>충전 / 출금 신청 내역</div>
          <button onClick={fetchRequests} style={{ ...btnBase, background: '#181C22', border: '1px solid #252D3A', color: '#8892A0', display: 'flex', alignItems: 'center', gap: 6 }}><RefreshCw size={13} /> 새로고침</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: '#4A5568', padding: '40px 0' }}>불러오는 중...</div>
        ) : requests.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#4A5568', padding: '40px 0' }}>신청 내역이 없어요.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.map(req => {
              const key = req.아이디 + req.거래일시
              const isCharge = req.입출금구분 === 'I'
              const isPending = req.상태 === 'P'
              const busy = processing === key
              const date = `${req.거래일시.slice(0,4)}-${req.거래일시.slice(4,6)}-${req.거래일시.slice(6,8)} ${req.거래일시.slice(8,10)}:${req.거래일시.slice(10,12)}`
              return (
                <div key={key} style={{ background: '#111418', border: `1px solid ${isPending ? '#252D3A' : '#1E2430'}`, borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{req.아이디}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: isCharge ? 'rgba(46,204,138,0.1)' : 'rgba(255,92,92,0.1)', color: isCharge ? '#2ECC8A' : '#FF5C5C' }}>
                          {isCharge ? '충전' : '출금'}
                        </span>
                      </div>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22 }}>
                        {req.빵갯수}빵 <span style={{ fontSize: 14, color: '#8892A0', fontFamily: 'inherit' }}>= {(req.빵갯수 * 1000).toLocaleString()}원</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#4A5568', marginTop: 4 }}>{date}</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: statusColor[req.상태] }}>
                      {statusLabel[req.상태]}
                    </span>
                  </div>

                  {isPending && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button onClick={() => reject(req)} disabled={busy} style={{ ...btnBase, background: 'rgba(255,92,92,0.12)', color: '#FF5C5C', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        {busy ? '...' : <><X size={13} /> 거절</>}
                      </button>
                      <button onClick={() => approve(req)} disabled={busy} style={{ ...btnBase, background: 'linear-gradient(135deg,#FF3D78,#9B2FC9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        {busy ? '...' : <><Check size={13} /> 승인</>}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
