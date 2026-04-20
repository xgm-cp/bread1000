'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { Wallet, ArrowDownToLine, Settings, LogOut, TrendingUp, TrendingDown, Minus, Trophy, User, Bell, BellOff, Lock, Upload, Trash2, FileText, Image as ImageIcon, Download, X } from 'lucide-react'
import { subscribePush } from '@/lib/usePushSubscription'
import { getAvatar } from '@/lib/avatar'
import TetrisGame from '@/components/TetrisGame'
import BreadMatch3 from '@/components/BreadMatch3'

type ModalType = 'charge' | 'withdraw' | null

interface TodayPrediction {
  예측종가: number
  종가증감구분: string
  종가증감값: number | null
  순위: number | null
  종가?: number | null
}

interface HistoryItem {
  기준일자: string
  예측종가: number
  종가증감구분: string
  순위: number | null
  종가증감값: number | null
  종가?: number | null
}

export default function MypagePage() {
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [userId, setUserId] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [bread, setBread] = useState<number | null>(null)
  const [todayPred, setTodayPred] = useState<TodayPrediction | null | 'none'>('none')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [modal, setModal] = useState<ModalType>(null)
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')
  const [showTetris, setShowTetris] = useState(false)
  const [showMatch3, setShowMatch3] = useState(false)
  const [visibleCount, setVisibleCount] = useState(5)
  const [isPushSupported, setIsPushSupported] = useState(false)
  const [isPushSubscribed, setIsPushSubscribed] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)

  // 정직원 파일 업로드
  const [isRegular, setIsRegular] = useState(false)
  const [myFiles, setMyFiles] = useState<{ name: string; id: string; created_at: string; 특이사항: string; 원본파일명: string }[]>([])
  const [fileUploading, setFileUploading] = useState(false)
  const [fileError, setFileError] = useState('')
  const [showFilesModal, setShowFilesModal] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploadNote, setUploadNote] = useState('')
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [diskPercent, setDiskPercent] = useState<string | null>(null)

  // 비밀번호 변경
  const [showPwModal, setShowPwModal] = useState(false)
  const [pw0, setPw0] = useState('')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [pw0Valid, setPw0Valid] = useState(false)
  const [pw0Checking, setPw0Checking] = useState(false)
  const [pwSubmitting, setPwSubmitting] = useState(false)
  const [pwError, setPwError] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) return
    const user = JSON.parse(stored)
    setUserName(user.이름 || '')
    setUserId(user.아이디 || '')
    setIsAdmin(user.role === 1)

    const supabase = getSupabase()
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // 정직원 여부
    supabase.from('회원기본').select('정직원여부').eq('아이디', user.아이디).single()
      .then(({ data }) => {
        const regular = (data as { 정직원여부: string } | null)?.정직원여부 === 'Y'
        setIsRegular(regular)
        if (regular) {
          fetch(`/api/files/list?아이디=${encodeURIComponent(user.아이디)}`)
            .then(r => r.json())
            .then(d => setMyFiles(d.files ?? []))
          fetch('/api/files/disk-usage')
            .then(r => r.json())
            .then(d => { if (d.percent != null) setDiskPercent(d.percent) })
        }
      })

    // 빵 잔액
    supabase.from('빵보유기본').select('빵갯수').eq('아이디', user.아이디).single()
      .then(({ data }) => {
        if (data) setBread((data as unknown as { 빵갯수: number }).빵갯수)
      })

    // 오늘 예측 + 실제 종가
    supabase.from('종가예측내역')
      .select('예측종가, 종가증감구분, 종가증감값, 순위')
      .eq('아이디', user.아이디)
      .eq('기준일자', today)
      .single()
      .then(async ({ data }) => {
        if (!data) { setTodayPred(null); return }
        const pred = data as unknown as TodayPrediction
        const { data: closeData } = await supabase
          .from('종가관리내역')
          .select('종가')
          .eq('기준일자', today)
          .eq('종목코드', '0001')
          .maybeSingle()
        pred.종가 = (closeData as unknown as { 종가: number } | null)?.종가 ?? null
        setTodayPred(pred)
      })

    // 히스토리 (오늘 제외 최근 10개) + 종가 합치기
    supabase.from('종가예측내역')
      .select('기준일자, 예측종가, 종가증감구분, 순위, 종가증감값')
      .eq('아이디', user.아이디)
      .lt('기준일자', today)
      .order('기준일자', { ascending: false })
      .limit(30)
      .then(async ({ data }) => {
        if (!data) return
        const preds = data as unknown as HistoryItem[]
        const dates = preds.map(p => p.기준일자)
        const { data: closes } = await supabase
          .from('종가관리내역')
          .select('기준일자, 종가')
          .in('기준일자', dates)
        const closeMap: Record<string, number> = {}
        if (closes) {
          for (const r of (closes as unknown) as { 기준일자: string; 종가: number }[]) {
            closeMap[r.기준일자] = r.종가
          }
        }
        setHistory(preds.map(p => ({ ...p, 종가: closeMap[p.기준일자] ?? null })))
      })
  }, [])

  // Push 알림 지원 여부 및 구독 상태 확인
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setIsPushSupported(true)
    navigator.serviceWorker.register('/sw.js').then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setIsPushSubscribed(!!sub)
      })
    })
  }, [])

  async function togglePushSubscription() {
    const stored = localStorage.getItem('user')
    if (!stored) return
    const user = JSON.parse(stored)
    setPushLoading(true)
    try {
      if (isPushSubscribed) {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await sub.unsubscribe()
          await getSupabase()
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('endpoint', sub.endpoint)
        }
        setIsPushSubscribed(false)
      } else {
        const ok = await subscribePush(user.아이디)
        if (!ok) alert('알림 권한이 거부되었어요.\n브라우저 설정에서 이 사이트의 알림을 \'허용\'으로 변경한 후 다시 시도해주세요.')
        setIsPushSubscribed(ok)
      }
    } catch (e) {
      console.error('Push 구독 오류:', e)
      const msg = e instanceof Error ? e.message : String(e)
      alert(`알림 설정 중 오류가 발생했어요.\n${msg}`)
    } finally {
      setPushLoading(false)
    }
  }


  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setPendingFile(file)
    setUploadNote('')
    setFileError('')
    setShowNoteModal(true)
  }

  async function confirmUpload() {
    if (!pendingFile) return
    setShowNoteModal(false)
    setFileUploading(true)
    setFileError('')
    try {
      // 1. signed upload URL 발급
      const urlRes = await fetch(`/api/files/upload-url?아이디=${encodeURIComponent(userId)}&filename=${encodeURIComponent(pendingFile.name)}`)
      const urlData = await urlRes.json()
      if (!urlRes.ok) { setFileError(urlData.error ?? '업로드 URL 발급 실패'); return }

      // 2. Supabase 클라이언트로 signed URL 업로드
      const { error: uploadErr } = await getSupabase().storage
        .from('member-files')
        .uploadToSignedUrl(urlData.path, urlData.token, pendingFile, {
          contentType: pendingFile.type || 'application/octet-stream',
        })
      if (uploadErr) { setFileError(uploadErr.message.includes('maximum allowed size') ? '파일용량은 10M 이하만 처리됩니다' : '업로드 실패: ' + uploadErr.message); return }

      // 3. 특이사항 저장
      await fetch('/api/files/metadata', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 파일경로: urlData.path, 아이디: userId, 특이사항: uploadNote, 원본파일명: urlData.원본파일명 }),
      })

      // 4. 파일 목록 갱신
      const listRes = await fetch(`/api/files/list?아이디=${encodeURIComponent(userId)}`)
      const listData = await listRes.json()
      setMyFiles(listData.files ?? [])
    } catch (err) {
      setFileError('업로드 중 오류: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setFileUploading(false)
      setPendingFile(null)
    }
  }

  async function downloadFile(name: string) {
    const path = `${userId}/${name}`
    const res = await fetch(`/api/files/signed-url?path=${encodeURIComponent(path)}&아이디=${encodeURIComponent(userId)}`)
    const data = await res.json()
    if (data.url) window.open(data.url, '_blank')
  }

  async function deleteFile(name: string) {
    if (!confirm(`"${name}" 파일을 삭제할까요?`)) return
    const path = `${userId}/${name}`
    await fetch('/api/files/delete', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, 아이디: userId }) })
    setMyFiles(prev => prev.filter(f => f.name !== name))
  }

  function fileIcon(name: string) {
    const ext = name.split('.').pop()?.toLowerCase()
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext ?? '')) return <ImageIcon size={14} />
    return <FileText size={14} />
  }

  async function verifyCurrentPassword() {
    if (!pw0) return
    setPw0Checking(true)
    setPwError('')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 아이디: userId, 패스워드: pw0 }),
    })
    setPw0Checking(false)
    if (res.ok) {
      setPw0Valid(true)
    } else {
      setPwError('현재 비밀번호가 올바르지 않습니다.')
      setPw0Valid(false)
    }
  }

  async function changePassword() {
    if (!pw1) { setPwError('새 비밀번호를 입력해주세요.'); return }
    if (pw1 !== pw2) { setPwError('새 비밀번호가 일치하지 않습니다.'); return }
    setPwSubmitting(true)
    setPwError('')
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 아이디: userId, 현재패스워드: pw0, 새패스워드: pw1 }),
    })
    setPwSubmitting(false)
    if (res.ok) {
      alert('비밀번호가 변경되었습니다.')
      setShowPwModal(false)
      setPw0(''); setPw1(''); setPw2(''); setPw0Valid(false); setPwError('')
    } else {
      const data = await res.json()
      setPwError(data.error)
    }
  }

  function getActualDir(예측종가: number, 종가증감구분: string, 종가증감값: number | null, 종가: number | null | undefined): 'U' | 'D' | null {
    if (종가 == null || 종가증감값 == null) return null
    const delta = 종가증감구분 === 'U' ? 종가증감값 : -종가증감값
    const prevClose = 예측종가 - delta
    return 종가 > prevClose ? 'U' : 'D'
  }

  function openModal(type: ModalType) {
    setModal(type); setAmount(''); setModalError('')
  }

  async function submitRequest() {
    const qty = parseInt(amount)
    if (!qty || qty <= 0) { setModalError('빵 개수를 올바르게 입력해주세요.'); return }
    if (modal === 'withdraw' && bread !== null && qty > bread) {
      setModalError('잔액보다 많이 출금할 수 없어요.'); return
    }
    setSubmitting(true); setModalError('')
    const d = new Date()
    const now = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`
    const { error } = await getSupabase().from('계좌거래내역').insert({
      아이디: userId, 거래일시: now,
      입출금구분: modal === 'charge' ? 'I' : 'O',
      빵갯수: qty, 상태: 'P',
    })
    setSubmitting(false)
    if (error) { setModalError('오류: ' + error.message); return }
    setModal(null)
    alert(modal === 'charge' ? '충전 신청 완료!\n관리자 승인 후 지급됩니다.' : '출금 신청 완료!\n관리자 승인 후 처리됩니다.')
  }

  function logout() {
    localStorage.removeItem('user'); router.push('/')
  }

  const DirIcon = ({ code }: { code: string }) => code === 'U'
    ? <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--up)', justifyContent: 'center' }}><TrendingUp size={18} /> 상승</span>
    : code === 'D'
    ? <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--down)', justifyContent: 'center' }}><TrendingDown size={18} /> 하락</span>
    : <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text3)', justifyContent: 'center' }}><Minus size={18} /> 보합</span>

  return (
    <>
    <div className="page-mypage">
      <div className="mypage-body">

        {/* 프로필 + 빵 잔액 */}
        <div className="profile-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div className="profile-avatar-big" style={{ margin: 0, flexShrink: 0, fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {userId ? getAvatar(userId, 48) : <User size={28} />}
            </div>
            <div style={{ flex: 1 }}>
              <div className="profile-name" style={{ textAlign: 'left', marginBottom: 2 }}>{userName || '-'}</div>
            </div>
          </div>

          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>내 빵 잔액</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {isRegular && (
                  <button onClick={() => setShowFilesModal(true)} style={{ fontSize: 11, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, padding: 0, textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: '#3B82F6' }}>내 파일 목록</button>
                )}
                <button onClick={() => router.push('/home/mypage/transactions')} style={{ fontSize: 11, color: '#FF3D78', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, padding: 0, textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: '#FF3D78' }}>전체 내역</button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 30, color: 'var(--text)' }}>{bread ?? '-'}</span>
              <span style={{ fontSize: 16, color: 'var(--text2)', fontWeight: 600 }}>빵</span>
              {bread !== null && <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 4 }}>= {(bread * 1000).toLocaleString()}원</span>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            <button onClick={() => openModal('charge')} style={{ padding: '13px', borderRadius: 10, border: 'none', background: 'var(--primary-gradient)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(255,61,120,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <Wallet size={15} /> 충전 신청
            </button>
            <button onClick={() => openModal('withdraw')} style={{ padding: '13px', borderRadius: 10, border: '1px solid var(--border2)', background: 'var(--surface2)', color: 'var(--text2)', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <ArrowDownToLine size={15} /> 출금 신청
            </button>
          </div>

          {isAdmin && (
            <button className="btn-edit-profile" style={{ marginBottom: 8, color: 'var(--accent)', borderColor: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }} onClick={() => router.push('/admin')}>
              <Settings size={15} /> 관리자 페이지
            </button>
          )}
          {isPushSupported && (
            <button
              className="btn-edit-profile"
              onClick={togglePushSubscription}
              disabled={pushLoading}
              style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, color: isPushSubscribed ? 'var(--text3)' : '#FF3D78', borderColor: isPushSubscribed ? 'var(--border2)' : '#FF3D78' }}
            >
              {pushLoading
                ? '처리 중...'
                : isPushSubscribed
                ? <><BellOff size={15} /> 알림 구독 중</>
                : <><Bell size={15} /> 알림 받기</>}
            </button>
          )}
          <button className="btn-edit-profile" onClick={() => { setShowPwModal(true); setModal(null) }} style={{ marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Lock size={15} /> 비밀번호 변경
          </button>
          <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginBottom: 8 }}>초기화는 관리자에게 문의</div>
          <button className="btn-edit-profile" onClick={logout} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><LogOut size={15} /> 로그아웃</button>
          <button className="btn-edit-profile" onClick={() => setShowTetris(true)} style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, color: '#A000F0', borderColor: '#A000F0' }}>🎮 테트리스</button>
          <button className="btn-edit-profile" onClick={() => setShowMatch3(true)} style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, color: '#F97316', borderColor: '#F97316' }}>🍞 Bread Match-3</button>
        </div>

        {/* 예측 히스토리 */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            예측 기록
          </div>

          {/* 오늘 행 */}
          {todayPred === 'none' ? (
            <div style={{ padding: '16px 18px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>불러오는 중...</div>
          ) : todayPred === null ? (
            <div style={{ padding: '16px 18px', borderBottom: history.length > 0 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,61,120,0.12)', color: '#FF3D78' }}>오늘</span>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>아직 예측하지 않았어요</div>
              </div>
              <button onClick={() => router.push('/home/predict')} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--primary-gradient)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                예측하기 →
              </button>
            </div>
          ) : (
            <div style={{ padding: '13px 18px', borderBottom: history.length > 0 ? '1px solid var(--border)' : 'none', background: 'rgba(255,61,120,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,61,120,0.12)', color: '#FF3D78' }}>오늘</span>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)}</span>
                </div>
                <DirIcon code={todayPred.종가증감구분} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>내 예측</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{Number(todayPred.예측종가).toLocaleString('ko-KR', { minimumFractionDigits: 2 })}</div>
                      {todayPred.종가증감값 != null && (
                        <div style={{ fontSize: 11, color: todayPred.종가증감구분 === 'U' ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>
                          {todayPred.종가증감구분 === 'U' ? '+' : '-'}{todayPred.종가증감값}
                        </div>
                      )}
                    </div>
                  </div>
                  {todayPred.종가 != null && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>실제 종가</div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{Number(todayPred.종가).toLocaleString('ko-KR', { minimumFractionDigits: 2 })}</div>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {todayPred.순위 === 1 ? (
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 4 }}><Trophy size={13} /> 우승</div>
                  ) : todayPred.순위 ? (
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>{todayPred.순위}위</div>
                  ) : (() => {
                    const actualDir = getActualDir(todayPred.예측종가, todayPred.종가증감구분, todayPred.종가증감값, todayPred.종가)
                    if (actualDir === null) return <div style={{ fontSize: 12, color: 'var(--text3)' }}>집계 중</div>
                    return actualDir === todayPred.종가증감구분
                      ? <div style={{ fontSize: 12, color: 'var(--text2)' }}>방향 맞음</div>
                      : <div style={{ fontSize: 12, color: 'var(--down)' }}>방향 틀림</div>
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* 지난 기록 */}
          {history.slice(0, visibleCount).map((item, i) => (
            <div key={i} style={{ padding: '13px 18px', borderBottom: i < Math.min(visibleCount, history.length) - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{item.기준일자}</span>
                <DirIcon code={item.종가증감구분} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>내 예측</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{Number(item.예측종가).toLocaleString('ko-KR', { minimumFractionDigits: 2 })}</div>
                      {item.종가증감값 != null && (
                        <div style={{ fontSize: 11, color: item.종가증감구분 === 'U' ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>
                          {item.종가증감구분 === 'U' ? '+' : '-'}{item.종가증감값}
                        </div>
                      )}
                    </div>
                  </div>
                  {item.종가 != null && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>실제 종가</div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{Number(item.종가).toLocaleString('ko-KR', { minimumFractionDigits: 2 })}</div>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {item.순위 === 1 ? (
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 4 }}><Trophy size={13} /> 우승</div>
                  ) : item.순위 ? (
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>{item.순위}위</div>
                  ) : (() => {
                    const actualDir = getActualDir(item.예측종가, item.종가증감구분, item.종가증감값, item.종가)
                    if (actualDir === null) return <div style={{ fontSize: 12, color: 'var(--text3)' }}>집계 중</div>
                    return actualDir === item.종가증감구분
                      ? <div style={{ fontSize: 12, color: 'var(--text2)' }}>방향 맞음</div>
                      : <div style={{ fontSize: 12, color: 'var(--down)' }}>방향 틀림</div>
                  })()}
                </div>
              </div>
            </div>
          ))}

          {todayPred !== 'none' && history.length === 0 && todayPred !== null && (
            <div style={{ padding: '12px 18px', textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>아직 지난 기록이 없어요</div>
          )}
          {history.length > visibleCount && (
            <button
              onClick={() => setVisibleCount(v => v + 5)}
              style={{ width: '100%', padding: '13px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text3)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
            >
              더보기 ({history.length - visibleCount}개 남음)
            </button>
          )}
        </div>

      </div>
    </div>

    {showNoteModal && pendingFile && (
      <div onClick={() => { setShowNoteModal(false); setPendingFile(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400, display: 'flex', alignItems: 'flex-end' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '28px 24px 40px' }}>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>파일 업로드</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>{pendingFile.name}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>특이사항 (선택)</div>
          <textarea
            value={uploadNote}
            onChange={e => setUploadNote(e.target.value)}
            placeholder="특이사항을 입력하세요"
            rows={3}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'none', marginBottom: 20, boxSizing: 'border-box' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button onClick={() => { setShowNoteModal(false); setPendingFile(null) }} style={{ padding: '14px', borderRadius: 12, border: '1px solid var(--border2)', background: 'var(--surface2)', color: 'var(--text2)', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
            <button onClick={confirmUpload} style={{ padding: '14px', borderRadius: 12, border: 'none', background: 'var(--primary-gradient)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>업로드</button>
          </div>
        </div>
      </div>
    )}

    {showFilesModal && (
      <div onClick={() => { setShowFilesModal(false); setFileError('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface)', borderRadius: '20px 20px 0 0', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0, background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '24px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={20} /> 내 파일 목록
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ cursor: fileUploading ? 'not-allowed' : 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: fileUploading ? 'var(--text3)' : '#FF3D78', padding: '6px 14px', borderRadius: 9, border: `1.5px solid ${fileUploading ? 'var(--border2)' : '#FF3D78'}` }}>
                <Upload size={13} /> {fileUploading ? '업로드 중...' : '파일 업로드'}
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                disabled={fileUploading}
                onChange={onFileSelected}
              />
            </label>
            <button onClick={() => setShowFilesModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', padding: 4 }}>
              <X size={20} />
            </button>
            </div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 24px' }}>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{diskPercent != null ? `디스크사용량: ${diskPercent}%` : ''}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>(10M이하 파일만 허용)</span>
          </div>
          {fileError && <div style={{ flexShrink: 0, fontSize: 13, color: 'var(--down)', padding: '8px 24px' }}>{fileError}</div>}
          <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', display: 'flex', padding: '8px 20px', background: 'var(--surface2)' }}>
            <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.05em' }}>파일명</span>
            <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.05em' }}>특이사항</span>
            <span style={{ width: 90, fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.05em' }}>업로드일자</span>
            <span style={{ width: 56 }}></span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {myFiles.length === 0 ? (
              <div style={{ padding: '28px', textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>업로드된 파일이 없습니다</div>
            ) : (
              myFiles.map((f, fi) => {
                const uploadDate = new Date(new Date(f.created_at).getTime() + 9 * 60 * 60 * 1000)
                const dateStr = `${uploadDate.getUTCFullYear()}-${String(uploadDate.getUTCMonth()+1).padStart(2,'0')}-${String(uploadDate.getUTCDate()).padStart(2,'0')}`
                return (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', padding: '11px 20px', borderBottom: fi < myFiles.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ color: 'var(--text3)', flexShrink: 0, marginRight: 6 }}>{fileIcon(f.name)}</span>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                      {f.원본파일명 || f.name.replace(/^\d+_/, '')}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{f.특이사항 || '-'}</span>
                    <span style={{ width: 90, fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{dateStr}</span>
                    <button onClick={() => downloadFile(f.name)} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#3B82F6', padding: '2px 6px', display: 'flex' }}>
                      <Download size={14} />
                    </button>
                    <button onClick={() => deleteFile(f.name)} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '2px 6px', display: 'flex' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    )}

    {showPwModal && (
      <div onClick={() => { setShowPwModal(false); setPw0(''); setPw1(''); setPw2(''); setPw0Valid(false); setPwError('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '28px 24px 40px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={20} /> 비밀번호 변경
          </div>

          {/* 현재 비밀번호 */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>현재 비밀번호</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              type="password"
              value={pw0}
              onChange={e => { setPw0(e.target.value); setPw0Valid(false); setPwError('') }}
              placeholder="현재 비밀번호 입력"
              style={{ flex: 1, padding: '13px 16px', borderRadius: 12, border: `1.5px solid ${pw0Valid ? '#2ECC8A' : 'var(--border2)'}`, background: 'var(--bg)', color: 'var(--text)', fontSize: 15, outline: 'none', fontFamily: 'inherit' }}
            />
            <button
              onClick={verifyCurrentPassword}
              disabled={!pw0 || pw0Checking || pw0Valid}
              style={{ padding: '0 18px', borderRadius: 12, border: 'none', background: pw0Valid ? 'rgba(46,204,138,0.15)' : 'var(--primary-gradient)', color: pw0Valid ? '#2ECC8A' : '#fff', fontWeight: 700, fontSize: 14, cursor: pw0Valid ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
            >
              {pw0Checking ? '...' : pw0Valid ? '확인됨' : '확인'}
            </button>
          </div>

          {/* 새 비밀번호 */}
          <div style={{ fontSize: 11, fontWeight: 600, color: pw0Valid ? 'var(--text3)' : 'var(--border2)', marginBottom: 6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>새 비밀번호</div>
          <input
            type="password"
            value={pw1}
            onChange={e => { setPw1(e.target.value); setPwError('') }}
            disabled={!pw0Valid}
            placeholder="새 비밀번호 입력"
            style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: '1.5px solid var(--border2)', background: pw0Valid ? 'var(--bg)' : 'var(--surface2)', color: 'var(--text)', fontSize: 15, outline: 'none', fontFamily: 'inherit', opacity: pw0Valid ? 1 : 0.4, marginBottom: 12, boxSizing: 'border-box' }}
          />

          {/* 새 비밀번호 확인 */}
          <div style={{ fontSize: 11, fontWeight: 600, color: pw0Valid ? 'var(--text3)' : 'var(--border2)', marginBottom: 6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>새 비밀번호 확인</div>
          <input
            type="password"
            value={pw2}
            onChange={e => { setPw2(e.target.value); setPwError('') }}
            disabled={!pw0Valid}
            placeholder="새 비밀번호 재입력"
            style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: `1.5px solid ${pw0Valid && pw2 && pw1 === pw2 ? '#2ECC8A' : 'var(--border2)'}`, background: pw0Valid ? 'var(--bg)' : 'var(--surface2)', color: 'var(--text)', fontSize: 15, outline: 'none', fontFamily: 'inherit', opacity: pw0Valid ? 1 : 0.4, marginBottom: 16, boxSizing: 'border-box' }}
          />

          {pwError && <div style={{ fontSize: 13, color: 'var(--down)', marginBottom: 12 }}>{pwError}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button onClick={() => { setShowPwModal(false); setPw0(''); setPw1(''); setPw2(''); setPw0Valid(false); setPwError('') }} style={{ padding: '14px', borderRadius: 12, border: '1px solid var(--border2)', background: 'var(--surface2)', color: 'var(--text2)', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
            <button onClick={changePassword} disabled={!pw0Valid || !pw1 || pw1 !== pw2 || pwSubmitting} style={{ padding: '14px', borderRadius: 12, border: 'none', background: (!pw0Valid || !pw1 || pw1 !== pw2) ? '#333' : 'var(--primary-gradient)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: (!pw0Valid || !pw1 || pw1 !== pw2 || pwSubmitting) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {pwSubmitting ? '변경 중...' : '변경하기'}
            </button>
          </div>
        </div>
      </div>
    )}

    {showTetris && <TetrisGame onClose={() => setShowTetris(false)} />}
    {showMatch3 && <BreadMatch3 onClose={() => setShowMatch3(false)} />}

    {modal && (
      <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '28px 24px 40px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            {modal === 'charge' ? <><Wallet size={20} /> 충전 신청</> : <><ArrowDownToLine size={20} /> 출금 신청</>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>
            {modal === 'charge' ? '충전할 빵 개수를 입력하세요. (1빵 = 1,000원)' : `출금할 빵 개수를 입력하세요. (잔액: ${bread ?? 0}빵)`}
          </div>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="빵 개수 입력" autoFocus
              style={{ width: '100%', padding: '14px 60px 14px 16px', borderRadius: 12, border: '1.5px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontSize: 18, outline: 'none', fontFamily: 'inherit' }}
              onFocus={e => (e.target.style.borderColor = '#FF3D78')}
              onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
            <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text3)', fontWeight: 600 }}>빵</span>
          </div>
          {amount && <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>= {(parseInt(amount) * 1000).toLocaleString()}원</div>}
          {modalError && <div style={{ fontSize: 13, color: 'var(--down)', marginBottom: 12 }}>{modalError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button onClick={() => setModal(null)} style={{ padding: '14px', borderRadius: 12, border: '1px solid var(--border2)', background: 'var(--surface2)', color: 'var(--text2)', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
            <button onClick={submitRequest} disabled={submitting} style={{ padding: '14px', borderRadius: 12, border: 'none', background: submitting ? '#6B1F4A' : 'var(--primary-gradient)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {submitting ? '처리 중...' : '신청하기'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
