'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()
  const [user, setUser] = useState<{ 아이디: string; 이름: string } | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('user')
    if (!stored) {
      router.push('/')
      return
    }
    setUser(JSON.parse(stored))
  }, [router])

  function logout() {
    sessionStorage.removeItem('user')
    router.push('/')
  }

  if (!user) return null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#0A0C0F', color: '#EEF0F4' }}>
      <h1 className="text-4xl mb-2" style={{ color: '#C9A84C', fontFamily: 'serif' }}>천원빵</h1>
      <p className="mb-8" style={{ color: '#8892A0' }}>안녕하세요, {user.이름}님 ({user.아이디})</p>
      <button
        onClick={logout}
        className="px-6 py-2 rounded-lg text-sm font-medium"
        style={{ background: '#111418', border: '1px solid #252D3A', color: '#8892A0' }}
      >
        로그아웃
      </button>
    </div>
  )
}
