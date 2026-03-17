'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Home, TrendingUp, Trophy, User, Settings, LogOut } from 'lucide-react'

const tabs = [
  { href: '/home',         icon: Home,        label: '홈' },
  { href: '/home/predict', icon: TrendingUp,  label: '예측' },
  { href: '/home/result',  icon: Trophy,      label: '결과' },
  { href: '/home/mypage',  icon: User,        label: '마이' },
]

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('user')
    if (!stored) { router.push('/'); return }
    const user = JSON.parse(stored)
setIsAdmin(user.role === 1)
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

  const menuBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '12px 18px',
    textAlign: 'left', background: 'none', border: 'none',
    fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit',
  }

  return (
    <>
      <nav>
        <div onClick={() => router.push('/home')} style={{ cursor: 'pointer', width: 60, height: 36, background: 'linear-gradient(135deg, #FF3D78, #9B2FC9)', WebkitMaskImage: 'url(/company_logo.png)', WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskImage: 'url(/company_logo.png)', maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center' }} />
        <div ref={menuRef} style={{ position: 'relative' }}>
          <div className="avatar" onClick={() => setMenuOpen(v => !v)}><User size={16} /></div>
          {menuOpen && (
            <div style={{
              position: 'absolute', top: '44px', right: 0,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '12px', overflow: 'hidden',
              minWidth: '160px', zIndex: 200,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              <button onClick={() => { setMenuOpen(false); router.push('/home/mypage') }}
                style={{ ...menuBtnStyle, color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
                <User size={15} /> 마이페이지
              </button>
              {isAdmin && (
                <button onClick={() => { setMenuOpen(false); router.push('/admin') }}
                  style={{ ...menuBtnStyle, color: 'var(--accent)', borderBottom: '1px solid var(--border)' }}>
                  <Settings size={15} /> 관리자 페이지
                </button>
              )}
              <button onClick={logout}
                style={{ ...menuBtnStyle, color: 'var(--down)' }}>
                <LogOut size={15} /> 로그아웃
              </button>
            </div>
          )}
        </div>
      </nav>

      {children}

      <div className="bottom-nav">
        {tabs.map(tab => {
          const Icon = tab.icon
          const active = pathname === tab.href
          return (
            <Link key={tab.href} href={tab.href} className={`bn-tab${active ? ' active' : ''}`}>
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              <span className="bn-label">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </>
  )
}
