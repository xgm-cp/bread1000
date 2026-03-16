import Head from 'next/head'
import { useState } from 'react'
import { useRouter } from 'next/router'

const CONF_LABELS = ['매우 낮음', '낮음', '보통', '높음', '매우 높음']

export default function Predict() {
  const router = useRouter()
  const [price, setPrice] = useState('')
  const [confidence, setConfidence] = useState(50)

  const confLabel = CONF_LABELS[Math.min(Math.floor(confidence / 25), 4)]

  return (
    <>
      <Head>
        <title>오늘의 예측 — 천원빵</title>
      </Head>

      <div className="page-predict">
        <div className="predict-body">

          {/* 스텝 인디케이터 */}
          <div className="predict-step">
            <div className="step-dot done" />
            <div className="step-line" />
            <div className="step-dot current" />
            <div className="step-line" />
            <div className="step-dot" />
            <div className="step-label" style={{ marginLeft: 8 }}>
              종목 선택 → <strong style={{ color: 'var(--gold)' }}>가격 입력</strong> → 제출
            </div>
          </div>

          {/* 종목 정보 */}
          <div className="predict-stock-info">
            <div>
              <div className="psi-ticker">005930 · KOSPI</div>
              <div className="psi-name">삼성전자</div>
              <div className="psi-market">Samsung Electronics Co., Ltd.</div>
            </div>
            <div className="psi-right">
              <div className="psi-current-label">현재가 (10:42 기준)</div>
              <div className="psi-price">74,800</div>
              <div className="psi-prev">
                전일 종가 73,880 · <span className="change-up">+920 (+1.24%)</span>
              </div>
            </div>
          </div>

          {/* 차트 */}
          <div className="chart-area">
            <div className="chart-label">
              <span>5일 주가 흐름</span>
              <span>03.07 — 03.13</span>
            </div>
            <svg className="mini-chart" viewBox="0 0 720 80" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2ECC8A" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#2ECC8A" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path className="chart-area-fill" d="M0,62 L90,58 L180,50 L270,54 L360,45 L450,40 L540,32 L630,28 L720,22 L720,80 L0,80 Z" />
              <path className="chart-line" d="M0,62 L90,58 L180,50 L270,54 L360,45 L450,40 L540,32 L630,28 L720,22" />
              <circle cx="720" cy="22" r="4" fill="#2ECC8A" />
            </svg>
          </div>

          {/* 예측 입력 */}
          <div className="prediction-panel">
            <h3>오늘의 종가를 예측하세요</h3>
            <p>
              장 마감(오후 3:30) 시 삼성전자의 최종 거래 가격을 입력하세요.<br />
              정확할수록 높은 점수를 받습니다.
            </p>

            <div className="input-group">
              <label className="input-label">예측 종가 (원)</label>
              <div className="price-input-wrapper">
                <span className="price-currency">₩</span>
                <input
                  className="price-input"
                  type="number"
                  placeholder="75000"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                />
              </div>
              <div className="quick-buttons">
                {[73000, 74500, 75000, 76000].map(v => (
                  <button key={v} className="quick-btn" onClick={() => setPrice(v)}>
                    {v.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            <div className="confidence-group">
              <div className="confidence-label-row">
                <label className="input-label" style={{ margin: 0 }}>자신감 레벨</label>
                <span className="confidence-value">{confLabel} ({confidence}%)</span>
              </div>
              <input
                type="range"
                className="confidence-slider"
                min="0"
                max="100"
                value={confidence}
                onChange={e => setConfidence(Number(e.target.value))}
              />
            </div>

            <div className="submit-row">
              <button className="btn-cancel" onClick={() => router.push('/')}>취소</button>
              <button className="btn-submit" onClick={() => router.push('/result')}>
                예측 제출하기 →
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
