# Supabase 처음 써보기 – 천원빵용 프로젝트 세팅

Organization은 이미 있으니까, **프로젝트 하나만 새로 만들고** DB 스키마 넣으면 됩니다.

---

## 1단계: 프로젝트 만들기

1. **https://supabase.com** 접속 → 로그인
2. 왼쪽 상단 또는 대시보드에서 **"New project"** (새 프로젝트) 클릭
3. 아래만 채우고 **Create new project** 누르기
   - **Name**: `cheonwon-bread` (아무 이름이나 OK)
   - **Database Password**: 나중에 DB 직접 접속할 때 쓰니까 **꼭 저장해 두기** (복사해 두거나 비밀번호 관리자에 저장)
   - **Region**: `Northeast Asia (Seoul)` 있으면 서울 선택, 없으면 가까운 거 (Tokyo 등)
4. 1~2분 기다리면 프로젝트 생성 완료

---

## 2단계: DB 스키마 넣기

1. 왼쪽 메뉴에서 **"SQL Editor"** 클릭
2. **"New query"** 로 새 쿼리 창 열기
3. **`sql/001_schema.sql`** 파일 내용 **전부 복사**해서 붙여넣기
4. **Run** (또는 Ctrl+Enter) 실행
   - 에러 없이 끝나면 members, closing_price_master, account_master, prediction_master, account_transactions, (001에 game_rounds 있으면) game_rounds 테이블 생성됨
5. **game_rounds**를 따로 쓰는 경우: **`sql/002_game_rounds.sql`** 내용 복사 → 새 쿼리 → Run

끝나면 왼쪽 **"Table Editor"**에서 테이블 목록 보임.

---

## 3단계: 연결 정보 확인 (앱에서 쓸 때)

1. 왼쪽 메뉴 **"Project Settings"** (톱니바퀴) 클릭
2. **"API"** 메뉴 들어가기
3. 여기 있는 값 두 개만 나중에 앱에 넣으면 됨
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public** 키: `eyJhbG...` 긴 문자열

앱(모바일 웹)에서는 이 URL + anon key로 Supabase 클라이언트 만들면 됨.

---

## 4단계: 테스트로 데이터 하나 넣어보기

1. **SQL Editor** → New query
2. 아래 실행 (비밀번호는 아무 문자열이나 OK, 나중에 로그인 구현할 때 bcrypt 씀)

```sql
-- 회원 1명
INSERT INTO members (name, email, password_hash, role)
VALUES ('테스트', 'test@test.com', 'temp', 0);

-- 트리거 없었다면 계좌 수동 생성 (트리거 있으면 자동 생성됨)
-- INSERT INTO account_master (member_id, balance) VALUES (1, 0);
```

3. **Table Editor** → **members** 테이블 클릭 → 행 하나 보이면 성공

---

## 5단계: 자주 쓰는 메뉴만 알아두기

| 메뉴 | 용도 |
|------|------|
| **Table Editor** | 테이블 데이터 보기·수동 수정 |
| **SQL Editor** | INSERT/UPDATE 등 SQL 직접 실행 |
| **Project Settings → API** | URL, anon key 확인 |
| **Authentication** | 나중에 로그인(이메일/비밀번호) 켜면 여기서 사용자 보임 |

---

## 정리

- Organization 있으면 **New project** 한 번만 만들면 됨.
- **001_schema.sql** (필요하면 **002_game_rounds.sql**) SQL Editor에서 실행해서 테이블 만들기.
- 앱 만들 때는 **Project URL** + **anon key** 로 연결하면 됨.

여기까지 하면 Supabase 세팅은 끝이고, 그 다음은 앱에서 로그인·예측 제출·INSERT 연결만 하면 됩니다.
