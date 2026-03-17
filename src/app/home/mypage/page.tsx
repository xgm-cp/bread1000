'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

type Tab = 'kospi' | 'samsung'
type ModalType = 'charge' | 'withdraw' | null

interface MarketData {
  price: string
  change: string
  changeSign: string
  changePct: string
  prevClose: string
  daily: { date: string; close: string }[]
  mock?: boolean
}

function MiniChart({ daily, color }: { daily: { date: string; close: string }[], color: string }) {
  if (!daily.length) return null
  const closes = daily.map(d => Number(d.close))
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = max - min || 1
  const w = 720, h = 80
  const pts = closes.map((c, i) => `${(i / (closes.length - 1)) * w},${h - ((c - min) / range) * (h - 10) - 5}`)
  const line = 'M' + pts.join(' L')
  const area = line + ` L${w},${h} L0,${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 60, display: 'block' }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#chartGrad)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  )
}

export default function MypagePage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('kospi')
  const [kospi, setKospi] = useState<MarketData | null>(null)
  const [samsung, setSamsung] = useState<MarketData | null>(null)
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [bread, setBread] = useState<number | null>(null)
  const [modal, setModal] = useState<ModalType>(null)
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')
  const [userId, setUserId] = useState('')

  useEffect(() => {
    const stored = sessionStorage.getItem('user')
    if (!stored) return
    const user = JSON.parse(stored)
    setUserName(user.이름 || '')
    setUserId(user.아이디 || '')

    const supabase = getSupabase()
    supabase
      .from('빵보유기본')
      .select('빵갯수')
      .eq('아이디', user.아이디)
      .single()
      .then(({ data }) => {
        if (data) setBread((data as unknown as { 빵갯수: number }).빵갯수)
      })
  }, [])

  function openModal(type: ModalType) {
    setModal(type)
    setAmount('')
    setModalError('')
  }

  async function submitRequest() {
    const qty = parseInt(amount)
    if (!qty || qty <= 0) { setModalError('빵 개수를 올바르게 입력해주세요.'); return }
    if (modal === 'withdraw' && bread !== null && qty > bread) {
      setModalError('잔액보다 많이 출금할 수 없어요.'); return
    }
    setSubmitting(true)
    setModalError('')
    const supabase = getSupabase()
    const d = new Date()
    const now = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`
    const { error } = await supabase.from('계좌거래내역').insert({
      아이디: userId,
      거래일시: now,
      입출금구분: modal === 'charge' ? 'I' : 'O',
      빵갯수: qty,
      상태: 'P',
    })
    setSubmitting(false)
    if (error) { setModalError('오류가 발생했어요: ' + error.message); return }
    setModal(null)
    alert(modal === 'charge' ? '충전 신청이 완료됐어요!\n관리자 승인 후 빵이 지급됩니다.' : '출금 신청이 완료됐어요!\n관리자 승인 후 처리됩니다.')
  }

  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      try {
        const [k, s] = await Promise.all([
          fetch('/api/kospi').then(r => r.json()),
          fetch('/api/samsung').then(r => r.json()),
        ])
        setKospi({
          price: Number(k.bstp_nmix_prpr).toLocaleString('ko-KR', { minimumFractionDigits: 2 }),
          change: k.bstp_nmix_prdy_vrss,
          changeSign: k.prdy_vrss_sign,
          changePct: k.bstp_nmix_prdy_ctrt,
          prevClose: Number(k.prdy_clpr).toLocaleString('ko-KR', { minimumFractionDigits: 2 }),
          daily: k.daily || [],
          mock: k.mock,
        })
        setSamsung({
          price: Number(s.stck_prpr).toLocaleString('ko-KR'),
          change: s.prdy_vrss,
          changeSign: s.prdy_vrss_sign,
          changePct: s.prdy_ctrt,
          prevClose: Number(s.prdy_clpr).toLocaleString('ko-KR'),
          daily: s.daily || [],
          mock: s.mock,
        })
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
    const timer = setInterval(fetchAll, 60000)
    return () => clearInterval(timer)
  }, [])

  function logout() {
    sessionStorage.removeItem('user')
    router.push('/')
  }

  const isUp = (sign: string) => sign === '1' || sign === '2'
  const data = tab === 'kospi' ? kospi : samsung
  const upColor = '#2ECC8A'
  const downColor = '#FF5C5C'
  const changeColor = data ? (isUp(data.changeSign) ? upColor : downColor) : '#8892A0'
  const changePrefix = data ? (isUp(data.changeSign) ? '▲' : '▼') : ''

  return (
    <>
    <div className="page-mypage">
      <div className="mypage-body">

        {/* 프로필 + 빵 잔액 */}
        <div className="profile-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
            <div className="profile-avatar-big" style={{ margin: 0, flexShrink: 0 }}>
              {userName ? userName[0] : '?'}
            </div>
            <div style={{ flex: 1 }}>
              <div className="profile-name" style={{ textAlign: 'left', marginBottom: 2 }}>{userName || '-'}</div>
              {/* <div className="profile-handle" style={{ textAlign: 'left', marginBottom: 0 }}>오늘도 빵 벌어가세요 🍞</div> */}
            </div>
          </div>

          {/* 빵 잔액 */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '5px 18px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>내 빵 잔액</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 36, color: 'var(--text)' }}>{bread ?? '-'}</span>
              <span style={{ fontSize: 16, color: 'var(--text2)', fontWeight: 600 }}>빵</span>
              {bread !== null && <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 4 }}>= {(bread * 1000).toLocaleString()}원</span>}
            </div>
          </div>

          {/* 충전 / 출금 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            <button onClick={() => openModal('charge')} style={{ padding: '13px', borderRadius: 10, border: 'none', background: 'var(--primary-gradient)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(255,61,120,0.3)' }}>
              🍞 충전 신청
            </button>
            <button onClick={() => openModal('withdraw')} style={{ padding: '13px', borderRadius: 10, border: '1px solid var(--border2)', background: 'var(--surface2)', color: 'var(--text2)', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              💸 출금 신청
            </button>
          </div>

          <button className="btn-edit-profile" onClick={logout}>로그아웃</button>
        </div>

        {/* 오늘 내 예측 */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>오늘 내 예측</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
            {[['방향', '-'], ['예측 지수', '-'], ['결과', '-']].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 22, fontFamily: 'var(--font-serif)', color: 'var(--text3)' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 시세 탭 */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {([['kospi', '코스피 지수'], ['samsung', '삼성전자']] as [Tab, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                flex: 1, padding: '13px 8px', fontSize: 13, fontWeight: 600,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                color: tab === key ? 'var(--gold)' : 'var(--text3)',
                borderBottom: tab === key ? '2px solid var(--gold)' : '2px solid transparent',
                background: tab === key ? 'var(--gold-dim)' : 'transparent',
              } as React.CSSProperties}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ padding: '16px 18px' }}>
            {loading || !data ? (
              <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>불러오는 중...</div>
            ) : (
              <>
                {data.mock && <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 8, textAlign: 'right' }}>📡 목업 데이터</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: 'var(--text)' }}>{data.price}</div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: changeColor }}>
                      {changePrefix} {Math.abs(Number(data.change)).toFixed(tab === 'kospi' ? 2 : 0)}
                    </div>
                    <div style={{ fontSize: 12, color: changeColor }}>
                      {Math.abs(Number(data.changePct)).toFixed(2)}%
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14 }}>
                  전일 종가 {data.prevClose}{tab === 'samsung' ? '원' : ''}
                </div>
                <MiniChart daily={data.daily} color={isUp(data.changeSign) ? upColor : downColor} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  {data.daily.map(d => (
                    <div key={d.date} style={{ fontSize: 9, color: 'var(--text3)', textAlign: 'center' }}>
                      {d.date.slice(4, 6)}/{d.date.slice(6, 8)}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </div>

    {/* 모달 */}
    {modal && (
      <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '28px 24px 40px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
            {modal === 'charge' ? '🍞 충전 신청' : '💸 출금 신청'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24 }}>
            {modal === 'charge'
              ? '충전할 빵 개수를 입력하세요. (1빵 = 1,000원)'
              : `출금할 빵 개수를 입력하세요. (잔액: ${bread ?? 0}빵)`}
          </div>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="빵 개수 입력"
              autoFocus
              style={{ width: '100%', padding: '14px 60px 14px 16px', borderRadius: 12, border: '1.5px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', fontSize: 18, outline: 'none', fontFamily: 'inherit' }}
              onFocus={e => (e.target.style.borderColor = '#FF3D78')}
              onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
            />
            <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text3)', fontWeight: 600 }}>빵</span>
          </div>
          {amount && (
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
              = {(parseInt(amount) * 1000).toLocaleString()}원
            </div>
          )}
          {modalError && <div style={{ fontSize: 13, color: 'var(--down)', marginBottom: 12 }}>{modalError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button onClick={() => setModal(null)} style={{ padding: '14px', borderRadius: 12, border: '1px solid var(--border2)', background: 'var(--surface2)', color: 'var(--text2)', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
              취소
            </button>
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
