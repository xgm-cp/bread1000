'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { RefreshCw, Check, X, ArrowLeft, Users, CreditCard, User } from 'lucide-react'

interface Request {
  아이디: string
  거래일시: string
  입출금구분: string
  빵갯수: number
  상태: string
}

interface Member {
  아이디: string
  이름: string
  사용여부: string
  role: number
}

const btnBase: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 8, border: 'none',
  fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
}

export default function AdminPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'requests' | 'members'>('requests')

  // 충전/출금
  const [requests, setRequests] = useState<Request[]>([])
  const [loadingReq, setLoadingReq] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  // 회원 관리
  const [members, setMembers] = useState<Member[]>([])
  const [loadingMem, setLoadingMem] = useState(true)
  const [processingMem, setProcessingMem] = useState<string | null>(null)
  const [memberFilter, setMemberFilter] = useState<'all' | 'P' | 'Y' | 'N'>('all')
  const [requestFilter, setRequestFilter] = useState<'all' | 'P' | 'Y' | 'N'>('all')

  useEffect(() => {
    const stored = sessionStorage.getItem('user')
    if (!stored || JSON.parse(stored).role !== 1) {
      router.push('/home')
      return
    }
    fetchRequests()
    fetchMembers()
  }, [router])

  async function fetchRequests() {
    setLoadingReq(true)
    const { data } = await getSupabase().from('계좌거래내역').select('*').order('등록일시', { ascending: false })
    setRequests((data as unknown as Request[]) || [])
    setLoadingReq(false)
  }

  async function fetchMembers() {
    setLoadingMem(true)
    const { data } = await getSupabase().from('회원기본').select('아이디, 이름, 사용여부, role').order('아이디')
    setMembers((data as unknown as Member[]) || [])
    setLoadingMem(false)
  }

  async function approveRequest(req: Request) {
    const key = req.아이디 + req.거래일시
    setProcessing(key)
    const supabase = getSupabase()

    await supabase.from('계좌거래내역')
      .update({ 상태: 'Y' })
      .eq('아이디', req.아이디)
      .eq('거래일시', req.거래일시)

    const { data: balance } = await supabase.from('빵보유기본').select('빵갯수').eq('아이디', req.아이디).single()
    const current = (balance as unknown as { 빵갯수: number } | null)?.빵갯수 ?? 0
    const next = req.입출금구분 === 'I' ? current + req.빵갯수 : current - req.빵갯수
    await supabase.from('빵보유기본').upsert({ 아이디: req.아이디, 빵갯수: Math.max(0, next) })

    setProcessing(null)
    fetchRequests()
  }

  async function rejectRequest(req: Request) {
    const key = req.아이디 + req.거래일시
    setProcessing(key)
    await getSupabase().from('계좌거래내역').update({ 상태: 'N' }).eq('아이디', req.아이디).eq('거래일시', req.거래일시)
    setProcessing(null)
    fetchRequests()
  }

  async function setMemberStatus(아이디: string, 사용여부: string) {
    setProcessingMem(아이디)
    await getSupabase().from('회원기본').update({ 사용여부 }).eq('아이디', 아이디)
    setProcessingMem(null)
    fetchMembers()
  }

  const reqStatusLabel: Record<string, string> = { P: '대기', Y: '승인', N: '거절' }
  const reqStatusColor: Record<string, string> = { P: '#E8C96A', Y: '#2ECC8A', N: '#FF5C5C' }
  const memStatusLabel: Record<string, string> = { P: '대기', Y: '활성', N: '정지' }
  const memStatusColor: Record<string, string> = { P: '#E8C96A', Y: '#2ECC8A', N: '#FF5C5C' }

  const pendingCount = members.filter(m => m.사용여부 === 'P').length

  return (
    <div style={{ minHeight: '100dvh', background: '#0A0C0F', color: '#EEF0F4' }}>
      {/* 헤더 */}
      <nav style={{ height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid #1E2430', background: 'rgba(10,12,15,0.95)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ width: '60px', height: '60px', background: 'linear-gradient(135deg, #FF3D78, #9B2FC9)', WebkitMaskImage: 'url(/company_logo.png)', WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskImage: 'url(/company_logo.png)', maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center', filter: 'drop-shadow(0 0 20px rgba(232,61,120,0.4))' }} />
        <button onClick={() => router.push('/home')} style={{ background: 'none', border: '1px solid #252D3A', color: '#8892A0', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={14} /> 홈으로
        </button>
      </nav>

      {/* 탭 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1E2430', background: '#0A0C0F', position: 'sticky', top: 54, zIndex: 40 }}>
        <button onClick={() => setTab('requests')} style={{ flex: 1, padding: '14px', fontSize: 13, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: tab === 'requests' ? '#FF3D78' : '#4A5568', borderBottom: tab === 'requests' ? '2px solid #FF3D78' : '2px solid transparent' }}>
          <CreditCard size={15} /> 충전 / 출금
        </button>
        <button onClick={() => setTab('members')} style={{ flex: 1, padding: '14px', fontSize: 13, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: tab === 'members' ? '#FF3D78' : '#4A5568', borderBottom: tab === 'members' ? '2px solid #FF3D78' : '2px solid transparent', position: 'relative' }}>
          <Users size={15} /> 회원 관리
          {pendingCount > 0 && (
            <span style={{ position: 'absolute', top: 8, right: 24, background: '#FF3D78', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 6px' }}>
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      <div style={{ padding: '20px 20px 40px' }}>

        {/* 충전/출금 탭 */}
        {tab === 'requests' && (() => {
          const reqCounts = { all: requests.length, P: requests.filter(r => r.상태 === 'P').length, Y: requests.filter(r => r.상태 === 'Y').length, N: requests.filter(r => r.상태 === 'N').length }
          const filteredReqs = requests.filter(r => requestFilter === 'all' || r.상태 === requestFilter)
          return (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>충전 / 출금 신청 내역</div>
              <button onClick={fetchRequests} style={{ background: '#181C22', border: '1px solid #252D3A', color: '#8892A0', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><RefreshCw size={14} /></button>
            </div>

            {/* 필터 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {([['all', '전체'], ['P', '대기'], ['Y', '승인'], ['N', '거절']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setRequestFilter(key)} style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: requestFilter === key ? 'linear-gradient(135deg,#FF3D78,#9B2FC9)' : '#181C22', color: requestFilter === key ? '#fff' : '#4A5568' }}>
                  {label} {reqCounts[key] > 0 && <span style={{ opacity: 0.8 }}>{reqCounts[key]}</span>}
                </button>
              ))}
            </div>

            {loadingReq ? (
              <div style={{ textAlign: 'center', color: '#4A5568', padding: '40px 0' }}>불러오는 중...</div>
            ) : filteredReqs.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#4A5568', padding: '40px 0' }}>신청 내역이 없어요.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredReqs.map(req => {
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
                        <span style={{ fontSize: 12, fontWeight: 700, color: reqStatusColor[req.상태] }}>
                          {reqStatusLabel[req.상태]}
                        </span>
                      </div>
                      {isPending && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <button onClick={() => rejectRequest(req)} disabled={busy} style={{ ...btnBase, background: 'rgba(255,92,92,0.12)', color: '#FF5C5C', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                            {busy ? '...' : <><X size={13} /> 거절</>}
                          </button>
                          <button onClick={() => approveRequest(req)} disabled={busy} style={{ ...btnBase, background: 'linear-gradient(135deg,#FF3D78,#9B2FC9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                            {busy ? '...' : <><Check size={13} /> 승인</>}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
          )
        })()}

        {/* 회원 관리 탭 */}
        {tab === 'members' && (() => {
          const statusOrder: Record<string, number> = { P: 0, Y: 1, N: 2 }
          const filtered = members
            .filter(m => memberFilter === 'all' || m.사용여부 === memberFilter)
            .sort((a, b) => statusOrder[a.사용여부] - statusOrder[b.사용여부])
          const counts = { all: members.length, P: members.filter(m => m.사용여부 === 'P').length, Y: members.filter(m => m.사용여부 === 'Y').length, N: members.filter(m => m.사용여부 === 'N').length }
          return (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>회원 목록</div>
                <button onClick={fetchMembers} style={{ background: '#181C22', border: '1px solid #252D3A', color: '#8892A0', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><RefreshCw size={14} /></button>
              </div>

              {/* 필터 */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                {([['all', '전체'], ['P', '대기'], ['Y', '활성'], ['N', '정지']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setMemberFilter(key)} style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: memberFilter === key ? 'linear-gradient(135deg,#FF3D78,#9B2FC9)' : '#181C22', color: memberFilter === key ? '#fff' : '#4A5568' }}>
                    {label} {counts[key] > 0 && <span style={{ opacity: 0.8 }}>{counts[key]}</span>}
                  </button>
                ))}
              </div>

              {loadingMem ? (
                <div style={{ textAlign: 'center', color: '#4A5568', padding: '40px 0' }}>불러오는 중...</div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#4A5568', padding: '40px 0' }}>해당 회원이 없어요.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {filtered.map(mem => {
                    const busy = processingMem === mem.아이디
                    const isPending = mem.사용여부 === 'P'
                    const isActive = mem.사용여부 === 'Y'
                    return (
                      <div key={mem.아이디} style={{ background: '#111418', border: `1px solid ${isPending ? '#2D2820' : '#1E2430'}`, borderRadius: 12, padding: '12px' }}>
                        {/* 상단: 아바타 + 정보 + 상태 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#FF3D78,#9B2FC9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                            <User size={14} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mem.아이디}</div>
                            <div style={{ fontSize: 11, color: '#4A5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mem.이름}</div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: memStatusColor[mem.사용여부], flexShrink: 0 }}>{memStatusLabel[mem.사용여부]}</span>
                        </div>

                        {/* 버튼 */}
                        {mem.role !== 1 && (
                          <div style={{ display: 'grid', gridTemplateColumns: isPending ? '1fr 1fr' : '1fr', gap: 6 }}>
                            {isPending && (
                              <button onClick={() => setMemberStatus(mem.아이디, 'N')} disabled={busy} style={{ ...btnBase, padding: '5px 0', fontSize: 12, background: 'rgba(255,92,92,0.12)', color: '#FF5C5C', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                {busy ? '...' : <><X size={12} /> 거절</>}
                              </button>
                            )}
                            {isPending && (
                              <button onClick={() => setMemberStatus(mem.아이디, 'Y')} disabled={busy} style={{ ...btnBase, padding: '5px 0', fontSize: 12, background: 'linear-gradient(135deg,#FF3D78,#9B2FC9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                {busy ? '...' : <><Check size={12} /> 승인</>}
                              </button>
                            )}
                            {isActive && (
                              <button onClick={() => setMemberStatus(mem.아이디, 'N')} disabled={busy} style={{ ...btnBase, padding: '5px 0', fontSize: 12, background: 'rgba(255,92,92,0.08)', color: '#FF5C5C', border: '1px solid rgba(255,92,92,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                {busy ? '...' : <><X size={12} /> 정지</>}
                              </button>
                            )}
                            {!isPending && !isActive && (
                              <button onClick={() => setMemberStatus(mem.아이디, 'Y')} disabled={busy} style={{ ...btnBase, padding: '5px 0', fontSize: 12, background: 'rgba(46,204,138,0.08)', color: '#2ECC8A', border: '1px solid rgba(46,204,138,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                {busy ? '...' : <><Check size={12} /> 활성화</>}
                              </button>
                            )}
                          </div>
                        )}
                        {mem.role === 1 && (
                          <div style={{ fontSize: 10, fontWeight: 700, padding: '4px 0', textAlign: 'center', color: '#9B2FC9' }}>관리자</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}
