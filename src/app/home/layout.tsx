'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const tabs = [
  { href: '/home',         icon: '🏠', label: '홈' },
  { href: '/home/predict', icon: '📈', label: '예측' },
  { href: '/home/result',  icon: '🏆', label: '결과' },
  { href: '/home/mypage',  icon: '👤', label: '마이' },
]

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [userInitial, setUserInitial] = useState('?')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('user')
    if (!stored) { router.push('/'); return }
    const user = JSON.parse(stored)
    setUserInitial((user.이름 || user.아이디 || '?')[0])
  }, [router])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function logout() {
    sessionStorage.removeItem('user')
    router.push('/')
  }

  return (
    <>
      <nav>
        <div className="logo" onClick={() => router.push('/home')}>
          천원빵<sub>종가 예측 게임</sub>
        </div>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <div className="avatar" onClick={() => setMenuOpen(v => !v)}>{userInitial}</div>
          {menuOpen && (
            <div style={{
              position: 'absolute', top: '44px', right: 0,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '12px', overflow: 'hidden',
              minWidth: '140px', zIndex: 200,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              <button onClick={() => { setMenuOpen(false); router.push('/home/mypage') }} style={{
                display: 'block', width: '100%', padding: '13px 18px',
                textAlign: 'left', background: 'none', border: 'none',
                color: 'var(--text)', fontSize: '14px', cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
              }}>👤 마이페이지</button>
              <button onClick={logout} style={{
                display: 'block', width: '100%', padding: '13px 18px',
                textAlign: 'left', background: 'none', border: 'none',
                color: 'var(--down)', fontSize: '14px', cursor: 'pointer',
              }}>🚪 로그아웃</button>
            </div>
          )}
        </div>
      </nav>

      {children}

      <div className="bottom-nav">
        {tabs.map(tab => (
          <Link key={tab.href} href={tab.href} className={`bn-tab${pathname === tab.href ? ' active' : ''}`}>
            <span className="bn-icon">{tab.icon}</span>
            <span className="bn-label">{tab.label}</span>
          </Link>
        ))}
      </div>
    </>
  )
}
