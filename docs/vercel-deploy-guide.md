# 사이트 껍데기 먼저 + Vercel 배포 (처음 쓸 때)

DB INSERT 붙이기 전에 **화면 껍데기**만 만들어서 Vercel에 올려두면, "우선 뭔가 보이는 것"부터 갖출 수 있어요. 그다음 Supabase 연결하면 됩니다.

---

## 순서 추천

1. **로컬에서 껍데기 만들기** (HTML 한 페이지든, React/Next 한 화면이든)
2. **Vercel에 배포** → URL 받기
3. 나중에 **Supabase 연결**해서 로그인·예측·INSERT 붙이기

---

## 1. Vercel 쓸 준비

- **계정**: https://vercel.com 가서 **Sign Up** (GitHub로 가입하면 연동 편함)
- **로컬에 프로젝트 폴더** 하나 준비 (지금 `cheonwon-bread` 폴더 그대로 써도 됨)

---

## 2. 껍데기 프로젝트 종류별로 한 가지만 고르기

아래 셋 중 **하나만** 골라서 하면 됩니다.

### A) 그냥 HTML 한 페이지 (가장 단순)

- `cheonwon-bread` 안에 `index.html` 하나만 만들고, "천원빵" 타이틀 + 로그인/예측 버튼 같은 거만 넣기
- Vercel은 정적 파일 그대로 배포 가능

### B) React (Vite) – 모바일 웹에 적당

- 터미널에서: `npm create vite@latest . -- --template react` (현재 폴더에 생성)
- 화면 몇 개만 만들고 (로그인, 오늘 예측, 1등 결과) 나중에 Supabase 붙이기

### C) Next.js – 나중에 API까지 넣을 때 유리

- `npx create-next-app@latest .` (현재 폴더에 생성)
- 페이지 라우팅 자동, 나중에 API Route로 15:30 배치 대체 가능

**처음이면 A(HTML) 또는 B(Vite React)** 가 부담이 적어요.

---

## 3. Vercel로 배포하는 방법 (2가지)

### 방법 1: GitHub 연동 (추천)

1. **GitHub**에 저장소 만들기 (예: `cheonwon-bread`)
2. 로컬 프로젝트를 `git init` → `git add .` → `git commit` → `git remote add origin ...` → `git push`
3. **vercel.com** 로그인 → **Add New... → Project**
4. **Import Git Repository**에서 방금 만든 저장소 선택
5. **Root Directory**는 비우거나 `./` (프로젝트 루트)
6. **Framework Preset**:  
   - HTML만 있으면 **Other**  
   - Vite면 **Vite**  
   - Next면 **Next.js**
7. **Deploy** 클릭
8. 끝나면 `https://xxxx.vercel.app` 주소 줌 → 이게 "사이트 껍데기" 주소

이후 코드 수정하고 `git push` 하면 자동으로 다시 배포됨.

### 방법 2: Vercel CLI (폴더에서 바로)

1. 터미널에서 프로젝트 폴더로 이동
2. `npm i -g vercel` (한 번만)
3. `vercel` 입력 → 로그인 유도됨 → 프로젝트 이름 등 물어보면 엔터만 쳐도 됨
4. 나오는 URL이 배포 주소

---

## 4. 폴더 구조 예시 (HTML 껍데기만 할 때)

```
cheonwon-bread/
├── index.html      ← 메인 (타이틀 + 간단 버튼)
├── docs/           ← 지금 문서들
├── sql/            ← 스키마
└── (나중에) src/   ← React 쓰면
```

`index.html` 안에는 예를 들어:

- "천원빵" 제목
- "로그인" / "오늘 예측" / "결과 보기" 같은 버튼(일단 링크만)
- 나중에 Supabase 붙이면 그 버튼에 기능 연결

---

## 5. 정리

| 하고 싶은 것 | 할 일 |
|--------------|--------|
| 사이트 껍데기 먼저 | HTML 한 장 또는 Vite/Next 한 화면 만들기 |
| Vercel에 올리기 | GitHub 연동해서 Import 하거나, `vercel` CLI로 배포 |
| DB는 나중에 | Supabase 스키마 돌려두고, 껍데기 올린 뒤 로그인/INSERT 붙이기 |

**순서**: 껍데기 만들기 → Vercel 배포(URL 확인) → 그다음 Supabase INSERT/연결 하면 됩니다.  
원하면 다음 단계로 "지금 폴더에 HTML 껍데기 하나 만들어줘"라고 하면 그걸로 `index.html` 예시 만들어 줄 수 있어요.
