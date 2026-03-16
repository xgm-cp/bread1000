import Head from 'next/head'
import { useRouter } from 'next/router'

export default function Home() {
  const router = useRouter()

  return (
    <>
      <Head>
        <title>천원빵 — 종가 예측 게임</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="page-home">
        <div className="home-body">

          {/* 히어로 */}
          <div className="home-hero">
            <div className="eyebrow">천원으로 시작하는 투자 감각</div>
            <h1>오늘의 <em>종가</em>,<br />당신이 맞춰보세요</h1>
            <p>실시간 주식 데이터를 바탕으로 종가를 예측하고<br />전국 투자자들과 실력을 겨뤄보세요.</p>
            <div className="home-cta">
              <button className="btn-gold" onClick={() => router.push('/predict')}>지금 예측하기</button>
              <button className="btn-ghost" onClick={() => router.push('/result')}>오늘의 결과 보기</button>
            </div>
          </div>

          <div className="home-grid">
            {/* 오늘의 종목 */}
            <div>
              <div className="section-header">
                <div className="section-title">오늘의 종목</div>
                <div className="section-sub">마감까지 2시간 18분</div>
              </div>
              <div className="stock-grid">
                <div className="stock-card" onClick={() => router.push('/predict')}>
                  <div className="stock-card-left">
                    <div className="stock-card-top">
                      <div className="stock-ticker">005930</div>
                      <div className="stock-badge badge-up">+1.24%</div>
                    </div>
                    <div className="stock-name">삼성전자</div>
                    <div className="stock-participants">
                      <span className="participants-label">참여자</span>
                      <span className="participants-count">1,248명</span>
                    </div>
                  </div>
                  <div className="stock-card-right">
                    <div className="stock-price">74,800</div>
                    <div className="stock-change change-up">▲ 920원</div>
                  </div>
                </div>

                <div className="stock-card" onClick={() => router.push('/predict')}>
                  <div className="stock-card-left">
                    <div className="stock-card-top">
                      <div className="stock-ticker">000660</div>
                      <div className="stock-badge badge-down">-0.87%</div>
                    </div>
                    <div className="stock-name">SK하이닉스</div>
                    <div className="stock-participants">
                      <span className="participants-label">참여자</span>
                      <span className="participants-count">934명</span>
                    </div>
                  </div>
                  <div className="stock-card-right">
                    <div className="stock-price">186,500</div>
                    <div className="stock-change change-down">▼ 1,600원</div>
                  </div>
                </div>

                <div className="stock-card" onClick={() => router.push('/predict')}>
                  <div className="stock-card-left">
                    <div className="stock-card-top">
                      <div className="stock-ticker">035420</div>
                      <div className="stock-badge badge-neutral">예측중</div>
                    </div>
                    <div className="stock-name">NAVER</div>
                    <div className="stock-participants">
                      <span className="participants-label">참여자</span>
                      <span className="participants-count">712명</span>
                    </div>
                  </div>
                  <div className="stock-card-right">
                    <div className="stock-price">198,000</div>
                    <div className="stock-change change-up">▲ 500원</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 리더보드 */}
            <div className="leaderboard-card">
              <div className="lb-header">
                <span className="lb-title">실시간 리더보드</span>
                <span className="lb-see-all" onClick={() => router.push('/result')}>전체 보기 →</span>
              </div>
              <div className="lb-row">
                <div className="lb-rank rank-1">1</div>
                <div className="lb-avatar" style={{ background: 'linear-gradient(135deg,#FFD700,#FF8C00)', color: '#111' }}>이</div>
                <div className="lb-user-info">
                  <div className="lb-user-name">이재윤</div>
                  <div className="lb-user-score">4,820점 · 12연속 🔥</div>
                </div>
                <div className="lb-accuracy">
                  <div className="lb-pct">96.4%</div>
                  <div className="lb-streak">정확도</div>
                </div>
              </div>
              <div className="lb-row">
                <div className="lb-rank rank-2">2</div>
                <div className="lb-avatar" style={{ background: 'linear-gradient(135deg,#B0C8DC,#6B9DB5)', color: '#fff' }}>박</div>
                <div className="lb-user-info">
                  <div className="lb-user-name">박수현</div>
                  <div className="lb-user-score">4,510점 · 8연속</div>
                </div>
                <div className="lb-accuracy">
                  <div className="lb-pct">94.1%</div>
                  <div className="lb-streak">정확도</div>
                </div>
              </div>
              <div className="lb-row">
                <div className="lb-rank rank-3">3</div>
                <div className="lb-avatar" style={{ background: 'linear-gradient(135deg,#D49A6A,#A0622A)', color: '#fff' }}>최</div>
                <div className="lb-user-info">
                  <div className="lb-user-name">최민서</div>
                  <div className="lb-user-score">4,380점 · 5연속</div>
                </div>
                <div className="lb-accuracy">
                  <div className="lb-pct">91.8%</div>
                  <div className="lb-streak">정확도</div>
                </div>
              </div>
              <div className="lb-row">
                <div className="lb-rank rank-other">4</div>
                <div className="lb-avatar" style={{ background: 'linear-gradient(135deg,#5A8A6A,#3A6A4A)', color: '#fff' }}>정</div>
                <div className="lb-user-info">
                  <div className="lb-user-name">정도현</div>
                  <div className="lb-user-score">4,150점 · 3연속</div>
                </div>
                <div className="lb-accuracy">
                  <div className="lb-pct">89.3%</div>
                  <div className="lb-streak">정확도</div>
                </div>
              </div>
              <div className="lb-row" style={{ background: 'rgba(201,168,76,0.04)' }}>
                <div className="lb-rank rank-other" style={{ color: 'var(--gold)' }}>18</div>
                <div className="lb-avatar" style={{ background: 'linear-gradient(135deg,var(--gold),#8B5E1A)', color: 'var(--bg)' }}>김</div>
                <div className="lb-user-info">
                  <div className="lb-user-name" style={{ color: 'var(--gold)' }}>나 (김민준)</div>
                  <div className="lb-user-score">2,840점 · 2연속</div>
                </div>
                <div className="lb-accuracy">
                  <div className="lb-pct" style={{ color: 'var(--gold)' }}>78.2%</div>
                  <div className="lb-streak">정확도</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
