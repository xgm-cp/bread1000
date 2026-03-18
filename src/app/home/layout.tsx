'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Home, TrendingUp, Trophy, User, Settings, LogOut, Smartphone } from 'lucide-react'
import { getAvatar } from '@/lib/avatar'

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
  const [userId, setUserId] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null)
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    const mobile = /Android|iPhone|iPad|iPod/i.test(ua)
    const ios = /iPhone|iPad|iPod/i.test(ua)
    setIsMobile(mobile)
    setIsIOS(ios)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (isIOS) {
      setShowIOSGuide(true)
      return
    }
    if (deferredPrompt) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prompt = deferredPrompt as any
      prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') setDeferredPrompt(null)
    } else {
      setShowIOSGuide(true)
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) {
      router.replace('/')
      return
    }
    const user = JSON.parse(stored)
    setIsAdmin(user.role === 1)
    setUserId(user.아이디 || '')
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
    localStorage.removeItem('user')
    document.cookie = 'auth_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div onClick={() => router.push('/home')} style={{ cursor: 'pointer', width: 60, height: 36, background: 'linear-gradient(135deg, #FF3D78, #9B2FC9)', WebkitMaskImage: 'url(/company_logo.png)', WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskImage: 'url(/company_logo.png)', maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center' }} />
          {isMobile && !isInstalled && (
            <button
              onClick={handleInstall}
              title="홈 화면에 추가"
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(255,61,120,0.4)', background: 'rgba(255,61,120,0.1)', color: '#FF3D78', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.05em' }}
            >
              <Smartphone size={13} />
              APP
            </button>
          )}
        </div>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <div className="avatar" onClick={() => setMenuOpen(v => !v)} style={{ fontSize: 18 }}>
            {userId ? getAvatar(userId) : <User size={16} />}
          </div>
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

      {showIOSGuide && (
        <div onClick={() => setShowIOSGuide(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '28px 24px 40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Smartphone size={22} color="#FF3D78" />
              <span style={{ fontSize: 17, fontWeight: 700 }}>홈 화면에 추가</span>
            </div>
            {isIOS ? (
              <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.8, marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ background: 'var(--bg)', borderRadius: 8, padding: '4px 10px', fontWeight: 600, color: 'var(--text)' }}>1</span>
                  Safari 하단 중앙의 <strong style={{ color: 'var(--text)' }}>⬆ 공유 아이콘</strong>을 탭하세요
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ background: 'var(--bg)', borderRadius: 8, padding: '4px 10px', fontWeight: 600, color: 'var(--text)' }}>2</span>
                  <strong style={{ color: 'var(--text)' }}>홈 화면에 추가</strong>를 선택하세요
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.8, marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ background: 'var(--bg)', borderRadius: 8, padding: '4px 10px', fontWeight: 600, color: 'var(--text)' }}>1</span>
                  Chrome 우측 상단의 <strong style={{ color: 'var(--text)' }}>⋮ 메뉴</strong>를 탭하세요
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ background: 'var(--bg)', borderRadius: 8, padding: '4px 10px', fontWeight: 600, color: 'var(--text)' }}>2</span>
                  <strong style={{ color: 'var(--text)' }}>홈 화면에 추가</strong>를 선택하세요
                </div>
              </div>
            )}
            <button onClick={() => setShowIOSGuide(false)} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'var(--primary-gradient)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
              확인
            </button>
          </div>
        </div>
      )}

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
