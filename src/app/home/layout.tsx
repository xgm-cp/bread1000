'use client'

import { useEffect, useState } from 'react'
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

  useEffect(() => {
    const stored = sessionStorage.getItem('user')
    if (!stored) {
      router.push('/')
      return
    }
    const user = JSON.parse(stored)
    setUserInitial((user.이름 || user.아이디 || '?')[0])
  }, [router])

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
        <div className="avatar" onClick={logout}>{userInitial}</div>
      </nav>

      {children}

      <div className="bottom-nav">
        {tabs.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`bn-tab${pathname === tab.href ? ' active' : ''}`}
          >
            <span className="bn-icon">{tab.icon}</span>
            <span className="bn-label">{tab.label}</span>
          </Link>
        ))}
      </div>
    </>
  )
}
