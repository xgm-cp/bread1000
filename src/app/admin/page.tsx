'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { RefreshCw, Check, X, ArrowLeft, Users, CreditCard, User, List, Calendar, FolderOpen, Trash2, FileText, Image as ImageIcon, ArrowDownToLine as DownloadIcon } from 'lucide-react'

interface Request {
  아이디: string
  거래일시: string
  입출금구분: string
  빵갯수: number
  상태: string
}

interface TxLog {
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
  정직원여부: string
}

const btnBase: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 8, border: 'none',
  fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
}

export default function AdminPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'requests' | 'members' | 'txlog' | 'files'>('requests')

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

  // 계좌거래내역
  const [txLogs, setTxLogs] = useState<TxLog[]>([])
  const [loadingTx, setLoadingTx] = useState(false)
  const [txDateFilter, setTxDateFilter] = useState('')
  const [txPeriodFilter, setTxPeriodFilter] = useState<'2' | 'all' | ''>('2')
  const [txIdFilter, setTxIdFilter] = useState('')
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'I' | 'O' | 'B' | 'W'>('all')

  // 업로드 파일 목록
  interface UploadedFile { name: string; id: string; created_at: string; memberId: string; memberName: string }
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [fileDeleteProcessing, setFileDeleteProcessing] = useState<string | null>(null)

  // 정직원여부 선택 (대기 회원 승인 시)
  const [regularMap, setRegularMap] = useState<Record<string, 'Y' | 'N'>>({})
  const [editRegularMap, setEditRegularMap] = useState<Record<string, 'Y' | 'N'>>({})

  // 비밀번호 초기화
  const [resetTarget, setResetTarget] = useState<string | null>(null)
  const [resetPw, setResetPw] = useState('')
  const [resetProcessing, setResetProcessing] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored || JSON.parse(stored).role !== 1) {
      router.push('/home')
      return
    }
    fetchRequests()
    fetchMembers()
    fetchTxLogs()
  }, [router])

  async function fetchRequests() {
    setLoadingReq(true)
    const { data } = await getSupabase().from('계좌거래내역').select('*').order('등록일시', { ascending: false })
    setRequests((data as unknown as Request[]) || [])
    setLoadingReq(false)
  }

  async function fetchTxLogs() {
    setLoadingTx(true)
    const { data } = await getSupabase().from('계좌거래내역').select('*').order('거래일시', { ascending: false })
    setTxLogs((data as unknown as TxLog[]) || [])
    setLoadingTx(false)
  }

  async function fetchMembers() {
    setLoadingMem(true)
    const { data, error } = await getSupabase().from('회원기본').select('아이디, 이름, 사용여부, role, 정직원여부').order('아이디')
    if (error) console.error('fetchMembers error:', error)
    setMembers((data as unknown as Member[]) || [])
    setLoadingMem(false)
  }

  async function fetchUploadedFiles() {
    setLoadingFiles(true)
    const res = await fetch('/api/files/admin/list')
    const data = await res.json()
    setUploadedFiles(data.files ?? [])
    setLoadingFiles(false)
  }

  async function adminDownloadFile(path: string) {
    const stored = localStorage.getItem('user')
    const 아이디 = stored ? JSON.parse(stored).아이디 : ''
    const res = await fetch(`/api/files/signed-url?path=${encodeURIComponent(path)}&아이디=${encodeURIComponent(아이디)}`)
    const data = await res.json()
    if (data.url) window.open(data.url, '_blank')
  }

  async function adminDeleteFile(path: string) {
    if (!confirm(`"${path.split('/').pop()?.replace(/^\d+_/, '')}" 파일을 삭제할까요?`)) return
    setFileDeleteProcessing(path)
    const stored = localStorage.getItem('user')
    const 아이디 = stored ? JSON.parse(stored).아이디 : ''
    await fetch('/api/files/delete', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, 아이디 }),
    })
    setFileDeleteProcessing(null)
    fetchUploadedFiles()
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

  async function resetPassword(아이디: string) {
    if (!/^\d{4}$/.test(resetPw)) { alert('4자리 숫자를 입력해주세요.'); return }
    setResetProcessing(true)
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 아이디, 패스워드: resetPw }),
    })
    setResetProcessing(false)
    if (res.ok) {
      alert(`${아이디} 비밀번호가 초기화되었습니다.`)
      setResetTarget(null)
      setResetPw('')
    } else {
      const data = await res.json()
      alert('초기화 실패: ' + data.error)
    }
  }

  async function setMemberStatus(아이디: string, 사용여부: string, 정직원여부?: string) {
    setProcessingMem(아이디)
    const update: Record<string, string> = { 사용여부 }
    if (정직원여부 !== undefined) update['정직원여부'] = 정직원여부
    await getSupabase().from('회원기본').update(update).eq('아이디', 아이디)
    setProcessingMem(null)
    fetchMembers()
  }

  async function setRegularStatus(아이디: string, 정직원여부: 'Y' | 'N') {
    setProcessingMem(아이디)
    await getSupabase().from('회원기본').update({ 정직원여부 }).eq('아이디', 아이디)
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
        <button onClick={() => setTab('txlog')} style={{ flex: 1, padding: '14px', fontSize: 13, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: tab === 'txlog' ? '#FF3D78' : '#4A5568', borderBottom: tab === 'txlog' ? '2px solid #FF3D78' : '2px solid transparent' }}>
          <List size={15} /> 거래내역
        </button>
        <button onClick={() => { setTab('files'); fetchUploadedFiles() }} style={{ flex: 1, padding: '14px', fontSize: 13, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: tab === 'files' ? '#FF3D78' : '#4A5568', borderBottom: tab === 'files' ? '2px solid #FF3D78' : '2px solid transparent' }}>
          <FolderOpen size={15} /> 업로드파일목록
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
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {/* 정직원여부 선택 */}
                            {(() => {
                              const curVal = isPending
                                ? (regularMap[mem.아이디] ?? 'N')
                                : (editRegularMap[mem.아이디] ?? mem.정직원여부 ?? 'N')
                              const isChanged = !isPending && editRegularMap[mem.아이디] !== undefined && editRegularMap[mem.아이디] !== mem.정직원여부
                              return (
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button
                                    onClick={() => isPending
                                      ? setRegularMap(p => ({ ...p, [mem.아이디]: 'Y' }))
                                      : setEditRegularMap(p => ({ ...p, [mem.아이디]: 'Y' }))
                                    }
                                    disabled={busy}
                                    style={{ ...btnBase, flex: 1, padding: '4px 0', fontSize: 11, background: curVal === 'Y' ? 'rgba(46,204,138,0.2)' : '#181C22', color: curVal === 'Y' ? '#2ECC8A' : '#4A5568', border: `1px solid ${curVal === 'Y' ? 'rgba(46,204,138,0.4)' : '#252D3A'}` }}>
                                    정규직
                                  </button>
                                  <button
                                    onClick={() => isPending
                                      ? setRegularMap(p => ({ ...p, [mem.아이디]: 'N' }))
                                      : setEditRegularMap(p => ({ ...p, [mem.아이디]: 'N' }))
                                    }
                                    disabled={busy}
                                    style={{ ...btnBase, flex: 1, padding: '4px 0', fontSize: 11, background: curVal === 'N' ? 'rgba(232,201,106,0.2)' : '#181C22', color: curVal === 'N' ? '#E8C96A' : '#4A5568', border: `1px solid ${curVal === 'N' ? 'rgba(232,201,106,0.4)' : '#252D3A'}` }}>
                                    비정규직
                                  </button>
                                  {isChanged && (
                                    <button
                                      onClick={() => { setRegularStatus(mem.아이디, editRegularMap[mem.아이디]!); setEditRegularMap(p => { const n = { ...p }; delete n[mem.아이디]; return n }) }}
                                      disabled={busy}
                                      style={{ ...btnBase, padding: '4px 10px', fontSize: 11, background: 'linear-gradient(135deg,#FF3D78,#9B2FC9)', color: '#fff' }}>
                                      변경
                                    </button>
                                  )}
                                </div>
                              )
                            })()}

                            {/* 승인/거절/정지/활성화 버튼 */}
                            <div style={{ display: 'grid', gridTemplateColumns: isPending ? '1fr 1fr' : '1fr', gap: 6 }}>
                              {isPending && (
                                <button onClick={() => setMemberStatus(mem.아이디, 'N')} disabled={busy} style={{ ...btnBase, padding: '5px 0', fontSize: 12, background: 'rgba(255,92,92,0.12)', color: '#FF5C5C', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                  {busy ? '...' : <><X size={12} /> 거절</>}
                                </button>
                              )}
                              {isPending && (
                                <button onClick={() => setMemberStatus(mem.아이디, 'Y', regularMap[mem.아이디] ?? 'N')} disabled={busy} style={{ ...btnBase, padding: '5px 0', fontSize: 12, background: 'linear-gradient(135deg,#FF3D78,#9B2FC9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
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
                          </div>
                        )}
                        {mem.role !== 1 && (
                          <div style={{ marginTop: 6 }}>
                            {resetTarget === mem.아이디 ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <input
                                  type="number"
                                  placeholder="4자리"
                                  maxLength={4}
                                  value={resetPw}
                                  onChange={e => setResetPw(e.target.value.slice(0, 4))}
                                  style={{ flex: 1, padding: '4px 8px', borderRadius: 6, background: '#0A0C0F', border: '1px solid #252D3A', color: '#EEF0F4', fontSize: 13, fontFamily: 'inherit', width: 0 }}
                                />
                                <button onClick={() => resetPassword(mem.아이디)} disabled={resetProcessing} style={{ ...btnBase, padding: '4px 8px', fontSize: 11, background: 'linear-gradient(135deg,#FF3D78,#9B2FC9)', color: '#fff' }}>
                                  {resetProcessing ? '...' : '확인'}
                                </button>
                                <button onClick={() => { setResetTarget(null); setResetPw('') }} style={{ ...btnBase, padding: '4px 8px', fontSize: 11, background: '#181C22', color: '#8892A0' }}>
                                  취소
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => { setResetTarget(mem.아이디); setResetPw('') }} style={{ ...btnBase, width: '100%', padding: '5px 0', fontSize: 12, background: 'rgba(155,47,201,0.08)', color: '#9B2FC9', border: '1px solid rgba(155,47,201,0.2)' }}>
                                비밀번호 초기화
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

        {/* 계좌거래내역 탭 */}
        {tab === 'txlog' && (() => {
          const txTypeLabel: Record<string, string> = { I: '충전', O: '출금', B: '차감', W: '지급' }
          const txTypeColor: Record<string, string> = { I: '#2ECC8A', O: '#FF5C5C', B: '#FF5C5C', W: '#4A9EFF' }

          const twoDaysAgo = (() => {
            const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
            d.setUTCDate(d.getUTCDate() - 2)
            return d.toISOString().slice(0, 10).replace(/-/g, '')
          })()

          const filtered = txLogs.filter(tx => {
            const dateMatch =
              txPeriodFilter === '2' ? tx.거래일시.slice(0, 8) >= twoDaysAgo :
              txPeriodFilter === 'all' ? true :
              txDateFilter ? tx.거래일시.slice(0, 8) === txDateFilter.replace(/-/g, '') : true
            const idMatch = txIdFilter ? tx.아이디.includes(txIdFilter) : true
            const typeMatch = txTypeFilter === 'all' || tx.입출금구분 === txTypeFilter
            return dateMatch && idMatch && typeMatch
          })

          return (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>계좌거래내역</div>
                <button onClick={fetchTxLogs} style={{ background: '#181C22', border: '1px solid #252D3A', color: '#8892A0', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><RefreshCw size={14} /></button>
              </div>

              {/* 필터 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Calendar size={14} color="#4A5568" style={{ position: 'absolute', left: 10, pointerEvents: 'none' }} />
                    <input
                      type="date"
                      value={txDateFilter}
                      onChange={e => { setTxDateFilter(e.target.value); setTxPeriodFilter('') }}
                      style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: 8, background: '#181C22', border: '1px solid #252D3A', color: txDateFilter ? '#EEF0F4' : '#4A5568', fontSize: 13, fontFamily: 'inherit', colorScheme: 'dark' }}
                    />
                    {txDateFilter && (
                      <button onClick={() => { setTxDateFilter(''); setTxPeriodFilter('2') }} style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#4A5568', padding: 0, display: 'flex', alignItems: 'center' }}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="아이디 검색"
                    value={txIdFilter}
                    onChange={e => setTxIdFilter(e.target.value)}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 8, background: '#181C22', border: '1px solid #252D3A', color: '#EEF0F4', fontSize: 13, fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => { setTxPeriodFilter('2'); setTxDateFilter(''); setTxTypeFilter('all') }} style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: txPeriodFilter === '2' ? 'linear-gradient(135deg,#4A9EFF,#2ECC8A)' : '#181C22', color: txPeriodFilter === '2' ? '#fff' : '#4A5568' }}>
                    최근2일
                  </button>
                  {([['I', '충전'], ['O', '출금'], ['B', '차감'], ['W', '지급']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setTxTypeFilter(key)} style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: txTypeFilter === key ? 'linear-gradient(135deg,#FF3D78,#9B2FC9)' : '#181C22', color: txTypeFilter === key ? '#fff' : '#4A5568' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {loadingTx ? (
                <div style={{ textAlign: 'center', color: '#4A5568', padding: '40px 0' }}>불러오는 중...</div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#4A5568', padding: '40px 0' }}>거래내역이 없어요.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1E2430' }}>
                        <th style={thStyle}>날짜</th>
                        <th style={thStyle}>아이디</th>
                        <th style={thStyle}>구분</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>빵</th>
                        <th style={thStyle}>거래일시</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((tx, idx) => {
                        const dateStr = tx.거래일시.slice(0, 8)
                        const formatted = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`
                        const timeStr = `${tx.거래일시.slice(8,10)}:${tx.거래일시.slice(10,12)}:${tx.거래일시.slice(12,14)}`
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #1A1F28', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                            <td style={tdStyle}>{formatted}</td>
                            <td style={{ ...tdStyle, color: '#4A9EFF' }}>{tx.아이디}</td>
                            <td style={{ ...tdStyle, color: txTypeColor[tx.입출금구분] ?? '#8892A0', fontWeight: 700 }}>{txTypeLabel[tx.입출금구분] ?? tx.입출금구분}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{tx.빵갯수}</td>
                            <td style={{ ...tdStyle, color: '#4A5568' }}>{formatted} {timeStr}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )
        })()}
        {tab === 'files' && (
          <>
            <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg, #0F1117)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', marginBottom: 8, borderBottom: '1px solid #252D3A' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>업로드 파일 목록</div>
              <button onClick={fetchUploadedFiles} style={{ background: '#181C22', border: '1px solid #252D3A', color: '#8892A0', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><RefreshCw size={14} /></button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #252D3A' }}>
                    <th style={thStyle}>아이디</th>
                    <th style={thStyle}>성명</th>
                    <th style={thStyle}>파일명</th>
                    <th style={thStyle}>특이사항</th>
                    <th style={thStyle}>업로드일자</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingFiles ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#8892A0', padding: 32 }}>불러오는 중...</td></tr>
                  ) : uploadedFiles.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#8892A0', padding: 32 }}>업로드된 파일이 없습니다</td></tr>
                  ) : (
                    (uploadedFiles as (typeof uploadedFiles[0] & { 특이사항?: string })[]).map(f => {
                      const displayName = f.name.replace(/^\d+_/, '')
                      const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
                      const isImage = ['jpg', 'jpeg', 'png', 'gif'].includes(ext)
                      const uploadDate = new Date(new Date(f.created_at).getTime() + 9 * 60 * 60 * 1000)
                      const dateStr = `${uploadDate.getUTCFullYear()}-${String(uploadDate.getUTCMonth()+1).padStart(2,'0')}-${String(uploadDate.getUTCDate()).padStart(2,'0')} ${String(uploadDate.getUTCHours()).padStart(2,'0')}:${String(uploadDate.getUTCMinutes()).padStart(2,'0')}`
                      return (
                        <tr key={f.id} style={{ borderBottom: '1px solid #1A1F2E' }}>
                          <td style={{ ...tdStyle, color: '#8892A0' }}>{f.memberId}</td>
                          <td style={tdStyle}>{f.memberName}</td>
                          <td style={tdStyle}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {isImage ? <ImageIcon size={13} color="#8892A0" /> : <FileText size={13} color="#8892A0" />}
                              {displayName}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, color: '#8892A0' }}>{f.특이사항 || '-'}</td>
                          <td style={{ ...tdStyle, color: '#8892A0' }}>{dateStr}</td>
                          <td style={{ ...tdStyle, display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => adminDownloadFile(`${f.memberId}/${f.name}`)}
                              style={{ ...btnBase, background: 'rgba(59,130,246,0.15)', color: '#3B82F6', padding: '4px 10px', fontSize: 12 }}
                            >
                              <DownloadIcon size={12} style={{ display: 'inline', marginRight: 4 }} />다운로드
                            </button>
                            <button
                              onClick={() => adminDeleteFile(`${f.memberId}/${f.name}`)}
                              disabled={fileDeleteProcessing === `${f.memberId}/${f.name}`}
                              style={{ ...btnBase, background: 'rgba(255,92,92,0.15)', color: '#FF5C5C', padding: '4px 10px', fontSize: 12 }}
                            >
                              <Trash2 size={12} style={{ display: 'inline', marginRight: 4 }} />삭제
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', color: '#8892A0', fontWeight: 600, whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  padding: '8px 10px', whiteSpace: 'nowrap',
}
