import { useRouter } from 'next/router'

export default function Nav() {
  const router = useRouter()

  return (
    <nav>
      <div className="logo" onClick={() => router.push('/')}>
        천원빵<sub>종가 예측 게임</sub>
      </div>
      <div className="avatar" onClick={() => router.push('/mypage')}>김</div>
    </nav>
  )
}
