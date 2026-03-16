import Link from 'next/link'
import { useRouter } from 'next/router'

const tabs = [
  { href: '/',        icon: '🏠', label: '홈' },
  { href: '/predict', icon: '📈', label: '예측' },
  { href: '/result',  icon: '🏆', label: '결과' },
  { href: '/mypage',  icon: '👤', label: '마이' },
]

export default function BottomNav() {
  const { pathname } = useRouter()

  return (
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
  )
}
