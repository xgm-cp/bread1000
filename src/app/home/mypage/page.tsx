'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const FILTERS = ['전체', '삼성전자', 'SK하이닉스', 'NAVER', '이번 주']
const HISTORY = [
  { ticker: '005930', date: '2025.03.12 (화)', myPrice: '75,000원', actualPrice: '75,200원', actualClass: 'change-up', score: '+140', scoreClass: 'good', diff: '오차 ±0.27%', rank: '18위' },
  { ticker: '000660', date: '2025.03.12 (화)', myPrice: '185,000원', actualPrice: '183,500원', actualClass: 'change-down', score: '+110', scoreClass: 'good', diff: '오차 ±0.82%', rank: '22위' },
  { ticker: '035420', date: '2025.03.11 (월)', myPrice: '202,000원', actualPrice: '196,000원', actualClass: 'change-down', score: '+42', scoreClass: 'bad', diff: '오차 ±3.06%', rank: '54위' },
  { ticker: '005930', date: '2025.03.11 (월)', myPrice: '73,500원', actualPrice: '73,880원', actualClass: 'change-up', score: '+128', scoreClass: 'good', diff: '오차 ±0.51%', rank: '31위' },
]

export default function MypagePage() {
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState('전체')

  function logout() {
    sessionStorage.removeItem('user')
    router.push('/')
  }

  return (
    <div className="page-mypage">
      <div className="mypage-body">
        <div className="profile-card">
          <div className="profile-avatar-big">김</div>
          <div className="profile-name">김민준</div>
          <div className="profile-handle">@minjun_kim · 2024.11 가입</div>
          <div className="profile-tier">⭐ 골드 티어</div>
          <div className="profile-stats">
            <div className="profile-stat"><div className="ps-value gold">2,840</div><div className="ps-label">총 점수</div></div>
            <div className="profile-stat"><div className="ps-value up">78%</div><div className="ps-label">정확도</div></div>
            <div className="profile-stat"><div className="ps-value">18위</div><div className="ps-label">순위</div></div>
            <div className="profile-stat"><div className="ps-value">42일</div><div className="ps-label">참여일수</div></div>
          </div>
          <button className="btn-edit-profile" onClick={logout}>로그아웃</button>
        </div>

        <div>
          <div className="streak-card">
            <div className="streak-icon">🔥</div>
            <div className="streak-text"><h4>2일 연속 예측 중!</h4><p>최고 기록 8일 연속 · 이번 주 5/5 참여</p></div>
          </div>
          <div className="history-filter" style={{ marginTop: 14 }}>
            {FILTERS.map(f => (
              <button key={f} className={`filter-chip${activeFilter === f ? ' active' : ''}`} onClick={() => setActiveFilter(f)}>{f}</button>
            ))}
          </div>
          <div className="history-list">
            {HISTORY.map((item, i) => (
              <div className="history-item" key={i}>
                <div>
                  <div className="hi-top"><span className="hi-ticker-badge">{item.ticker}</span><span className="hi-date">{item.date}</span></div>
                  <div className="hi-prices"><span className="hi-my-price">내 예측: {item.myPrice}</span><span className="hi-arrow">→</span><span className={`hi-actual-price ${item.actualClass}`}>실제: {item.actualPrice}</span></div>
                </div>
                <div className="hi-result">
                  <div className={`hi-score ${item.scoreClass}`}>{item.score}</div>
                  <div className="hi-diff">{item.diff}</div>
                  <div className="hi-rank">{item.rank}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
