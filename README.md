# bread1000 — 종가 예측 게임

XGM 사내 주식 종가 예측 게임 서비스 입니다.

---

## 서비스 개요

- 매일 오전 장 시작 전 종목별 종가를 예측
- 예측 정확도에 따라 빵 부여
- 실시간 리더보드로 순위 확인
- 모바일 전용 UI (iOS / Android 브라우저)

---

## 기술 스택

### Frontend
| 항목 | 내용 |
|------|------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + Custom CSS |
| Font | Noto Sans KR · DM Serif Display (next/font) |

### Backend / Infrastructure
| 항목 | 내용 |
|------|------|
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (세션 기반) |
| Deployment | Vercel |

### 디자인 시스템
- 다크 모드 전용 (`#0A0C0F` 베이스)
- 포인트 컬러: Red → Purple 그라데이션 (`#FF3D78` → `#9B2FC9`)
- 주가 상승/하락: `#2ECC8A` / `#FF5C5C`
- 모바일 퍼스트 (하단 탭 네비게이션)

---

## 프로젝트 구조

```
src/
└── app/
    ├── page.tsx          # 로그인 / 회원가입
    ├── layout.tsx        # 루트 레이아웃 (폰트, 메타데이터)
    ├── globals.css       # 디자인 시스템 CSS 변수 + 컴포넌트
    └── home/
        ├── layout.tsx    # 로그인 후 공통 레이아웃 (Nav + BottomNav)
        ├── page.tsx      # 홈 (종목 목록, 리더보드)
        ├── predict/      # 예측 입력
        ├── result/       # 결과 / 순위
        └── mypage/       # 마이페이지
sql/
├── 001_schema.sql        # Supabase 테이블 스키마
└── 002_game_rounds.sql   # 게임 라운드 데이터
```

---

## 로컬 실행

```bash
npm install
npm run dev
```

`.env.local` 파일 필요:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

---

## 배포

Vercel + GitHub 연동으로 `main` 브랜치 push 시 자동 배포
EOF
