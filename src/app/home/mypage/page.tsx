'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { Wallet, ArrowDownToLine, Settings, LogOut, TrendingUp, TrendingDown, Minus, Trophy, User, Bell, BellOff } from 'lucide-react'
import { subscribePush } from '@/lib/usePushSubscription'
import { getAvatar } from '@/lib/avatar'

type ModalType = 'charge' | 'withdraw' | null

interface TodayPrediction {
  예측종가: number
  종가증감구분: string
  종가증감값: number | null
}

interface HistoryItem {
  기준일자: string
  예측종가: number
  종가증감구분: string
  순위: number | null
  종가증감값: number | null
  종가?: number | null
}

interface KospiData {
  price: string
  change: string
  changeSign: string
  changePct: string
}

export default function MypagePage() {
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [userId, setUserId] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [bread, setBread] = useState<number | null>(null)
  const [todayPred, setTodayPred] = useState<TodayPrediction | null | 'none'>('none')
  const [kospi, setKospi] = useState<KospiData | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [modal, setModal] = useState<ModalType>(null)
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')
  const [visibleCount, setVisibleCount] = useState(5)
  const [isPushSupported, setIsPushSupported] = useState(false)
  const [isPushSubscribed, setIsPushSubscribed] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) return
    const user = JSON.parse(stored)
    setUserName(user.이름 || '')
    setUserId(user.아이디 || '')
    setIsAdmin(user.role === 1)

    const supabase = getSupabase()
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // 빵 잔액
    supabase.from('빵보유기본').select('빵갯수').eq('아이디', user.아이디).single()
      .then(({ data }) => {
        if (data) setBread((data as unknown as { 빵갯수: number }).빵갯수)
      })

    // 오늘 예측
    supabase.from('종가예측내역')
      .select('예측종가, 종가증감구분, 종가증감값')
      .eq('아이디', user.아이디)
      .eq('기준일자', today)
      .single()
      .then(({ data }) => {
        if (data) setTodayPred(data as unknown as TodayPrediction)
        else setTodayPred(null)
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

  // 오늘 배팅한 경우에만 KOSPI API 호출
  useEffect(() => {
    if (!todayPred || todayPred === 'none') return
    const KOSPI_CACHE_TTL = 2 * 60 * 1000 // 2분
    try {
      const cached = sessionStorage.getItem('kospiCache')
      if (cached) {
        const { data, at } = JSON.parse(cached)
        if (Date.now() - at < KOSPI_CACHE_TTL) {
          setKospi({
            price: Number(data.bstp_nmix_prpr).toLocaleString('ko-KR', { minimumFractionDigits: 2 }),
            change: data.bstp_nmix_prdy_vrss,
            changeSign: data.prdy_vrss_sign,
            changePct: data.bstp_nmix_prdy_ctrt,
          })
          return
        }
      }
    } catch { /* 파싱 실패 시 무시 */ }
    fetch('/api/kospi').then(r => r.json()).then(k => {
      const price = Number(k.bstp_nmix_prpr)
      if (isNaN(price) || price === 0) return
      setKospi({
        price: price.toLocaleString('ko-KR', { minimumFractionDigits: 2 }),
        change: k.bstp_nmix_prdy_vrss,
        changeSign: k.prdy_vrss_sign,
        changePct: k.bstp_nmix_prdy_ctrt,
      })
      sessionStorage.setItem('kospiCache', JSON.stringify({ data: k, at: Date.now() }))
    })
  }, [todayPred])

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

  const isUp = (sign: string) => sign === '1' || sign === '2'
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div className="profile-avatar-big" style={{ margin: 0, flexShrink: 0, fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {userId ? getAvatar(userId) : <User size={28} />}
            </div>
            <div style={{ flex: 1 }}>
              <div className="profile-name" style={{ textAlign: 'left', marginBottom: 2 }}>{userName || '-'}</div>
            </div>
          </div>

          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>내 빵 잔액</div>
              <button onClick={() => router.push('/home/mypage/transactions')} style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, padding: 0, textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: 'var(--border2)' }}>전체 내역</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 36, color: 'var(--text)' }}>{bread ?? '-'}</span>
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
          <button className="btn-edit-profile" onClick={logout} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><LogOut size={15} /> 로그아웃</button>
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
            <div style={{ padding: '14px 18px', borderBottom: history.length > 0 ? '1px solid var(--border)' : 'none', background: 'rgba(255,61,120,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,61,120,0.12)', color: '#FF3D78' }}>오늘</span>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)}</span>
                </div>
                <DirIcon code={todayPred.종가증감구분} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: kospi ? 10 : 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>예측 지수</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18 }}>{Number(todayPred.예측종가).toLocaleString('ko-KR', { minimumFractionDigits: 2 })}</div>
                  {todayPred.종가증감값 != null && (
                    <div style={{ fontSize: 12, color: todayPred.종가증감구분 === 'U' ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>
                      {todayPred.종가증감구분 === 'U' ? '+' : '-'}{todayPred.종가증감값}
                    </div>
                  )}
                </div>
              </div>
              {kospi && (
                <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>현재 코스피</div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18 }}>{kospi.price}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isUp(kospi.changeSign) ? 'var(--up)' : 'var(--down)' }}>
                      {isUp(kospi.changeSign) ? '▲' : '▼'} {Math.abs(Number(kospi.change)).toFixed(2)}
                    </div>
                  </div>
                </div>
              )}
              {!kospi && (
                <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>실시간 지수 불러오는 중...</div>
              )}
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
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15 }}>{Number(item.예측종가).toLocaleString('ko-KR', { minimumFractionDigits: 2 })}</div>
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
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15 }}>{Number(item.종가).toLocaleString('ko-KR', { minimumFractionDigits: 2 })}</div>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {item.순위 === 1 ? (
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 4 }}><Trophy size={13} /> 우승</div>
                  ) : item.순위 ? (
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>{item.순위}위</div>
                  ) : item.종가 !== null ? (
                    <div style={{ fontSize: 12, color: 'var(--down)' }}>방향 틀림</div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>집계 중</div>
                  )}
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
