# Supabase INSERT 가이드

## 1. Supabase에서 INSERT 하는 방법 (2가지)

| 방법 | 어디서 | 쓰는 경우 |
|------|--------|-----------|
| **SQL Editor** | Supabase 대시보드 | 테스트·관리자·배치(종가/1등 반영) |
| **Client API** | 모바일 웹 앱(JS) | 회원가입, 예측 제출, 앱에서 하는 입력 |

---

## 2. SQL Editor에서 INSERT (대시보드)

Supabase 대시보드 → **SQL Editor** → 새 쿼리에서 아래처럼 실행.

### 2.1 순서 (FK 때문에 지켜야 함)

1. **members** (가장 먼저)
2. **account_master** (members 다음, 또는 트리거로 자동 생성했다면 생략 가능)
3. **closing_price_master**
4. **prediction_master**
5. **account_transactions**
6. **game_rounds** (종가+1등 확정 후)

### 2.2 예시 SQL

```sql
-- 1. 회원 (트리거로 계좌 자동 생성했다면 account_master는 안 넣어도 됨)
INSERT INTO members (name, email, password_hash, role)
VALUES
  ('홍길동', 'hong@example.com', '$2a$10$...해시값...', 0),
  ('김철수', 'kim@example.com', '$2a$10$...해시값...', 1);

-- 2. 종가 (15:30 이후, 해당일 종가 입력)
INSERT INTO closing_price_master (trade_date, kospi_close)
VALUES ('2025-03-11', 2512.50);

-- 3. 예측 (회원이 9:30 전에 제출 – 앱에서 넣는 게 보통)
INSERT INTO prediction_master (member_id, trade_date, predicted_value)
VALUES (1, '2025-03-11', 2510.00);

-- 4. 계좌 거래 (참가비 차감 예시)
INSERT INTO account_transactions (account_id, amount, transaction_type, ref_trade_date)
VALUES (1, -1, 'ENTRY_FEE', '2025-03-11');

-- 그 다음 account_master.balance 를 앱/트리거에서 -1 해줘야 함

-- 5. game_rounds (15:30 이후, 종가 반영 + 1등 확정 후 한 번만)
INSERT INTO game_rounds (game_date, closing_price_master_id, winner_id)
VALUES ('2025-03-11', 1, 1);
```

- **password_hash**: bcrypt 등으로 암호화한 뒤 넣기.
- **account_id**, **member_id** 등은 실제 PK 값에 맞게 숫자 바꿔서 사용.

---

## 3. 클라이언트(JS)에서 INSERT (모바일 웹 앱)

Supabase JS 클라이언트 쓰면 테이블을 **API처럼** 쓸 수 있음.

### 3.1 설치

```bash
npm install @supabase/supabase-js
```

### 3.2 초기화 (한 번만)

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xxxxx.supabase.co',  // Project URL
  'yyyyy'                       // anon public key
);
```

### 3.3 INSERT 예시

```javascript
// 회원가입 (가입 후 계좌는 트리거로 생성되거나, 앱에서 한 번 더 insert)
const { data, error } = await supabase
  .from('members')
  .insert({
    name: '홍길동',
    email: 'hong@example.com',
    password_hash: hashedPassword,  // 서버나 클라이언트에서 bcrypt 등으로 해시 후
    role: 0
  })
  .select('id')  // 삽입된 행의 id 받고 싶을 때
  .single();

// 예측 제출 (9:30 전)
const { error } = await supabase
  .from('prediction_master')
  .insert({
    member_id: userId,
    trade_date: '2025-03-11',  // 오늘 날짜
    predicted_value: 2512.50
  });

// 참가비 차감 + 잔액 업데이트는 트랜잭션처럼: 거래내역 insert 후 account_master update
// (Supabase는 트랜잭션을 직접 안 주니까, 서버/Edge Function에서 하거나, 두 번 호출)
await supabase.from('account_transactions').insert({
  account_id: accountId,
  amount: -1,
  transaction_type: 'ENTRY_FEE',
  ref_trade_date: '2025-03-11'
});
// 그 다음 account_master.balance -= 1 은 RPC 또는 별도 update로
```

### 3.4 RLS (Row Level Security)

Supabase는 기본으로 **RLS**가 켜져 있으면, **정책이 없으면 INSERT/SELECT 다 막힘**.  
테이블별로 정책을 넣어줘야 함.

- **members**: 가입은 누구나(anon) insert, 본인만 select/update 등.
- **prediction_master**: 로그인한 사용자만 insert (본인 member_id로).
- **account_master**, **account_transactions**: 본인 계좌만 조회/변경.
- **closing_price_master**, **game_rounds**: 관리자만 insert (또는 서비스 역할만).

정책은 대시보드 **Authentication → Policies** 또는 SQL로 추가.

---

## 4. 정리

| 하고 싶은 일 | 방법 |
|--------------|------|
| 테스트·관리자가 직접 넣기 | **SQL Editor**에서 INSERT 실행 |
| 회원가입·예측 제출·충전/출금 | **앱에서** `supabase.from('테이블').insert({...})` |
| 15:30 종가·1등·몰빵 | **배치/스케줄** 또는 관리자용 화면에서 SQL/API 호출 |

INSERT 순서만 FK 맞게 (members → account_master → … → game_rounds) 지키면 됨.
