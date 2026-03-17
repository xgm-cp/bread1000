'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

type Mode = 'login' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [아이디, set아이디] = useState('')
  const [이름, set이름] = useState('')
  const [패스워드, set패스워드] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = getSupabase()

    try {
      if (mode === 'signup') {
        const { error } = await supabase
          .from('회원기본')
          .insert({ 아이디, 이름, 패스워드 })

        if (error) {
          if (error.code === '23505') setError('이미 사용 중인 아이디입니다.')
          else setError(error.message)
          return
        }
        alert('회원가입 완료! 로그인해주세요.')
        setMode('login')
        set이름('')
        set패스워드('')
      } else {
        const { data, error } = await supabase
          .from('회원기본')
          .select('*')
          .eq('아이디', 아이디)
          .eq('패스워드', 패스워드)
          .single()

        const row = data as { 아이디: string; 이름: string; 사용여부: string } | null

        if (error || !row) {
          setError('아이디 또는 패스워드가 올바르지 않습니다.')
          return
        }
        if (row.사용여부 === 'N') {
          setError('!!!사용이 중지된 계정입니다. 관리자에게 문의하세요!!!!')
          return
        }

        sessionStorage.setItem('user', JSON.stringify({ 아이디: row.아이디, 이름: row.이름 }))
        router.push('/home')
      }
    } finally {
      setLoading(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '14px 16px', borderRadius: '12px',
    background: '#111418', border: '1.5px solid #252D3A',
    color: '#EEF0F4', fontSize: '15px', outline: 'none',
    fontFamily: 'inherit',
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#0A0C0F', display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 영역 */}
      <div style={{ padding: '60px 24px 40px', textAlign: 'center' }}>
        <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: '36px', color: '#C9A84C', marginBottom: '6px' }}>
          천원빵
        </div>
        <div style={{ fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4A5568' }}>
          종가 예측 게임
        </div>
      </div>

      {/* 폼 영역 */}
      <div style={{ flex: 1, padding: '0 24px 40px' }}>
        {/* 탭 */}
        <div style={{ display: 'flex', background: '#111418', border: '1px solid #1E2430', borderRadius: '12px', marginBottom: '24px', overflow: 'hidden' }}>
          {(['login', 'signup'] as Mode[]).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError('') }} style={{
              flex: 1, padding: '13px', fontSize: '14px', fontWeight: 600,
              background: mode === m ? 'rgba(201,168,76,0.12)' : 'transparent',
              color: mode === m ? '#C9A84C' : '#4A5568',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {m === 'login' ? '로그인' : '회원가입'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8892A0', marginBottom: '8px' }}>아이디</label>
            <input style={inp} type="text" value={아이디} onChange={e => set아이디(e.target.value)} maxLength={10} required placeholder="최대 10자"
              onFocus={e => (e.target.style.borderColor = '#C9A84C')}
              onBlur={e => (e.target.style.borderColor = '#252D3A')} />
          </div>

          {mode === 'signup' && (
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8892A0', marginBottom: '8px' }}>이름</label>
              <input style={inp} type="text" value={이름} onChange={e => set이름(e.target.value)} maxLength={50} required placeholder="이름 입력"
                onFocus={e => (e.target.style.borderColor = '#C9A84C')}
                onBlur={e => (e.target.style.borderColor = '#252D3A')} />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8892A0', marginBottom: '8px' }}>패스워드</label>
            <input style={inp} type="password" value={패스워드} onChange={e => set패스워드(e.target.value)} required placeholder="패스워드 입력"
              onFocus={e => (e.target.style.borderColor = '#C9A84C')}
              onBlur={e => (e.target.style.borderColor = '#252D3A')} />
          </div>

          {error && <p style={{ fontSize: '13px', color: '#FF5C5C' }}>{error}</p>}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '15px', borderRadius: '12px',
            fontWeight: 700, fontSize: '15px', border: 'none',
            background: loading ? '#8B6A2A' : '#C9A84C',
            color: '#0A0C0F', cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: '4px', fontFamily: 'inherit',
          }}>
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>
      </div>
    </div>
  )
}
