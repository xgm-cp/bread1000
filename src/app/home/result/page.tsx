'use client'

import { useState } from 'react'

const TABS = ['오늘 순위', '주간 순위', '전체 순위']

export default function ResultPage() {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <div className="page-result">
      <div className="result-body">
        <div className="result-hero">
          <div className="result-badge">🎉 오늘의 결과 · 03.12</div>
          <h2>수고하셨어요,<br /><em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>김민준</em>님</h2>
          <p style={{ color: 'var(--text2)', marginTop: 10 }}>어제 예측에서 <strong style={{ color: 'var(--up)' }}>+340점</strong> 획득</p>
        </div>

        <div className="score-cards">
          <div className="score-card"><div className="score-card-label">오늘 점수</div><div className="score-card-value up">+340</div><div className="score-card-sub">3개 종목</div></div>
          <div className="score-card"><div className="score-card-label">평균 오차</div><div className="score-card-value gold">±1.2%</div><div className="score-card-sub">0.3% 향상</div></div>
          <div className="score-card"><div className="score-card-label">오늘 순위</div><div className="score-card-value" style={{ color: 'var(--accent)' }}>18위</div><div className="score-card-sub">2,894명 중</div></div>
        </div>

        <div className="comparison-card">
          <div className="comparison-row">
            <div><div className="comp-stock">삼성전자</div><div className="comp-ticker">005930</div></div>
            <div className="comp-values"><div className="comp-prediction">75,000원</div><div className="comp-actual">실제: 75,200원</div></div>
            <div className="comp-diff-col"><div className="comp-diff change-up">+0.27%</div><div className="comp-points" style={{ color: 'var(--up)' }}>+140점</div></div>
          </div>
          <div className="comparison-row">
            <div><div className="comp-stock">SK하이닉스</div><div className="comp-ticker">000660</div></div>
            <div className="comp-values"><div className="comp-prediction">185,000원</div><div className="comp-actual">실제: 183,500원</div></div>
            <div className="comp-diff-col"><div className="comp-diff change-down">-0.82%</div><div className="comp-points" style={{ color: 'var(--up)' }}>+110점</div></div>
          </div>
          <div className="comparison-row">
            <div><div className="comp-stock">NAVER</div><div className="comp-ticker">035420</div></div>
            <div className="comp-values"><div className="comp-prediction">200,000원</div><div className="comp-actual">실제: 196,500원</div></div>
            <div className="comp-diff-col"><div className="comp-diff change-down">-1.78%</div><div className="comp-points" style={{ color: 'var(--up)' }}>+90점</div></div>
          </div>
        </div>

        <div className="ranking-section">
          <div className="ranking-tabs">
            {TABS.map((tab, i) => (
              <button key={tab} className={`ranking-tab${activeTab === i ? ' active' : ''}`} onClick={() => setActiveTab(i)}>{tab}</button>
            ))}
          </div>
          <div className="ranking-row"><div className="rank-num rank-1">1</div><div><div className="rank-name">이재윤</div><div className="rank-detail">오차 ±0.12% · 3종목 만점</div></div><div className="rank-score"><div className="rank-score-val" style={{ color: 'var(--up)' }}>+498점</div><div className="rank-score-label">오늘 점수</div></div></div>
          <div className="ranking-row"><div className="rank-num rank-2">2</div><div><div className="rank-name">박수현</div><div className="rank-detail">오차 ±0.34%</div></div><div className="rank-score"><div className="rank-score-val" style={{ color: 'var(--up)' }}>+476점</div><div className="rank-score-label">오늘 점수</div></div></div>
          <div className="ranking-row"><div className="rank-num rank-3">3</div><div><div className="rank-name">최민서</div><div className="rank-detail">오차 ±0.61%</div></div><div className="rank-score"><div className="rank-score-val" style={{ color: 'var(--up)' }}>+452점</div><div className="rank-score-label">오늘 점수</div></div></div>
          <div className="ranking-row highlight"><div className="rank-num" style={{ fontFamily: 'inherit', fontSize: 14, color: 'var(--gold)' }}>18</div><div><div className="rank-name" style={{ color: 'var(--gold)' }}>나 (김민준)</div><div className="rank-detail">오차 ±1.2% · 어제보다 3계단 상승 ▲</div></div><div className="rank-score"><div className="rank-score-val" style={{ color: 'var(--gold)' }}>+340점</div><div className="rank-score-label">오늘 점수</div></div></div>
        </div>
      </div>
    </div>
  )
}
