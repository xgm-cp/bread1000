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

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0C0F' }}>
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif" style={{ color: '#C9A84C', fontFamily: 'DM Serif Display, serif' }}>
            천원빵
          </h1>
          <p className="text-xs tracking-widest uppercase mt-1" style={{ color: '#4A5568' }}>
            종가 예측 게임
          </p>
        </div>

        <div className="flex rounded-xl overflow-hidden mb-6" style={{ background: '#111418', border: '1px solid #1E2430' }}>
          {(['login', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError('') }}
              className="flex-1 py-3 text-sm font-medium transition-all"
              style={{
                background: mode === m ? 'rgba(201,168,76,0.12)' : 'transparent',
                color: mode === m ? '#C9A84C' : '#4A5568',
              }}
            >
              {m === 'login' ? '로그인' : '회원가입'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: '#8892A0' }}>
              아이디
            </label>
            <input
              type="text"
              value={아이디}
              onChange={(e) => set아이디(e.target.value)}
              maxLength={10}
              required
              placeholder="최대 10자"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
              style={{ background: '#0A0C0F', border: '1.5px solid #252D3A', color: '#EEF0F4' }}
              onFocus={(e) => (e.target.style.borderColor = '#C9A84C')}
              onBlur={(e) => (e.target.style.borderColor = '#252D3A')}
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: '#8892A0' }}>
                이름
              </label>
              <input
                type="text"
                value={이름}
                onChange={(e) => set이름(e.target.value)}
                maxLength={50}
                required
                placeholder="이름 입력"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{ background: '#0A0C0F', border: '1.5px solid #252D3A', color: '#EEF0F4' }}
                onFocus={(e) => (e.target.style.borderColor = '#C9A84C')}
                onBlur={(e) => (e.target.style.borderColor = '#252D3A')}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: '#8892A0' }}>
              패스워드
            </label>
            <input
              type="password"
              value={패스워드}
              onChange={(e) => set패스워드(e.target.value)}
              required
              placeholder="패스워드 입력"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
              style={{ background: '#0A0C0F', border: '1.5px solid #252D3A', color: '#EEF0F4' }}
              onFocus={(e) => (e.target.style.borderColor = '#C9A84C')}
              onBlur={(e) => (e.target.style.borderColor = '#252D3A')}
            />
          </div>

          {error && (
            <p className="text-sm px-1" style={{ color: '#FF5C5C' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-bold text-sm transition-all mt-2"
            style={{
              background: loading ? '#8B6A2A' : '#C9A84C',
              color: '#0A0C0F',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>
      </div>
    </div>
  )
}
