# 천원빵 앱 – DB 상세 설계

> **제품 스펙 요약**: 1빵=1,000원, **실제 입출금은 수기(관리자), PG 없음**. 9:30 전 예측(00.00), 실시간 순위, 15:30 종가로 1등 확정 → 1등에게 당일 참가비(빵) 몰빵. 상세는 [product-spec.md](./product-spec.md) 참고.

## 1. 요구사항 정리

| 구분 | 내용 |
|------|------|
| 참여자 | 회사 멤버 (회원) |
| 단위 | 1빵 = 1,000원 (앱 내에서는 빵 단위만 사용, 입출금 수기) |
| 게임 단위 | 매일 1회 (날짜별 1라운드) |
| 예측 | KOSPI 지수 00.00 단위, 오전 9시 30분 전까지 입력 |
| 순위 | 실시간(또는 주기) 시세와 비교해 차이 적은 순 집계 |
| 1등 | 15:30 장 마감 종가 기준, 예측과 차이 최소인 1명 |
| 몰빵 | 당일 참가비(빵) 전액을 1등에게 지급 (앱 잔액 적립) |
| 계좌 | 회원별 빵 잔액·거래 내역 (참가비 차감, 몰빵 입금, 수기 충전/출금) |

---

## 2. 설계 원칙

- **종가 단일 소스**: 날짜별 종가는 `closing_price_master` 한 곳에서만 관리.
- **예측 = 회원 + 대상일 1건**: `(member_id, trade_date)` 유니크로 중복 방지.
- **계좌 = 회원당 1개**: 잔액은 `account_master`, 모든 변동은 `account_transactions`에만 기록 후 잔액 반영(감사 추적).
- **테이블 수**: 핵심 5개로 충분. 선택적으로 **게임 라운드**·**거래유형 코드** 테이블 추가 가능.

---

## 3. 테이블 구성

| No | 테이블 (한글) | 테이블 (영문) | 설명 |
|----|----------------|---------------|------|
| 1 | 회원 | members | 참여자, 로그인 |
| 2 | 종가관리 마스터 | closing_price_master | 날짜별 KOSPI 종가 |
| 3 | 예측 마스터 | prediction_master | 회원별·날짜별 예측 1건 |
| 4 | 계좌 마스터 | account_master | 회원당 1계좌, 현재 잔액 |
| 5 | 계좌 거래내역 | account_transactions | 잔액 변동 내역 (승리/참가/조정 등) |
| (선택) | 게임 라운드 | game_rounds | 날짜별 게임 상태·승자 캐시 |
| (선택) | 거래유형 코드 | transaction_type_codes | 거래 구분 코드 관리 |

---

## 4. ER 다이어그램

```
                    ┌─────────────────────────┐
                    │ closing_price_master    │
                    │ (종가관리 마스터)        │
                    ├─────────────────────────┤
                    │ PK id                   │
                    │ UK trade_date           │
                    │    kospi_close          │
                    └───────────┬─────────────┘
                                │ 날짜로 연결
                                │ (FK 없이 trade_date 매칭)
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       │
┌───────────────┐     ┌─────────────────────┐          │
│   members     │     │  prediction_master  │          │
│   (회원)      │────▶│  (예측 마스터)       │──────────┘
├───────────────┤     ├─────────────────────┤
│ PK id         │     │ PK id               │
│    name       │     │ FK member_id        │
│ UK email      │     │    trade_date       │  UK(member_id, trade_date)
│    ...        │     │    predicted_value  │
└───────┬───────┘     └─────────────────────┘
        │
        │ 1:1
        ▼
┌───────────────┐     ┌─────────────────────┐
│account_master │────▶│account_transactions │
│ (계좌 마스터)  │ 1:N │ (계좌 거래내역)      │
├───────────────┤     ├─────────────────────┤
│ PK id         │     │ PK id               │
│ FK member_id  │     │ FK account_id       │
│ UK member_id  │     │    amount           │
│    balance    │     │    transaction_type │
└───────────────┘     │    ref_trade_date   │
                      └─────────────────────┘
```

---

## 5. 테이블 상세 정의

### 5.1 회원 (members)

| 컬럼 | 타입 | NULL | 기본값 | 제약 | 설명 |
|------|------|------|--------|------|------|
| id | BIGSERIAL | N | 자동 | PK | 회원 식별자 |
| name | VARCHAR(50) | N | - | - | 이름 |
| email | VARCHAR(100) | N | - | UNIQUE | 로그인 이메일 |
| password_hash | VARCHAR(255) | N | - | - | 비밀번호 해시 (bcrypt 등) |
| created_at | TIMESTAMPTZ | N | NOW() | - | 가입일시 |
| updated_at | TIMESTAMPTZ | N | NOW() | - | 수정일시 |

**인덱스**
- `PK(id)`
- `UNIQUE(email)` — 로그인·중복 가입 방지

**비고**
- 회원 가입 시 **계좌 1개 자동 생성** (애플리케이션 또는 트리거에서 처리 권장).

---

### 5.2 종가관리 마스터 (closing_price_master)

| 컬럼 | 타입 | NULL | 기본값 | 제약 | 설명 |
|------|------|------|--------|------|------|
| id | BIGSERIAL | N | 자동 | PK | 종가 레코드 식별자 |
| trade_date | DATE | N | - | UNIQUE | 거래일(종가 기준일). 장 개장일만 입력 |
| kospi_close | DECIMAL(10,2) | N | - | CHECK(0 &lt;= 값) | KOSPI 종가 |
| registered_at | TIMESTAMPTZ | N | NOW() | - | 종가 등록 시각 (장 마감 후) |
| created_at | TIMESTAMPTZ | N | NOW() | - | 레코드 생성일시 |
| updated_at | TIMESTAMPTZ | N | NOW() | - | 수정일시 |

**인덱스**
- `PK(id)`
- `UNIQUE(trade_date)` — 날짜당 종가 1건

**비고**
- 주말·공휴일은 장 미개장이므로 해당일은 보통 입력하지 않음. 예측은 **장이 있는 날**만 대상으로 하면 됨.

---

### 5.3 예측 마스터 (prediction_master)

| 컬럼 | 타입 | NULL | 기본값 | 제약 | 설명 |
|------|------|------|--------|------|------|
| id | BIGSERIAL | N | 자동 | PK | 예측 식별자 |
| member_id | BIGINT | N | - | FK → members(id) ON DELETE CASCADE | 회원 |
| trade_date | DATE | N | - | - | 예측 대상일 (종가의 trade_date와 매칭) |
| predicted_value | DECIMAL(10,2) | N | - | CHECK(0 &lt;= 값) | 예측 KOSPI |
| submitted_at | TIMESTAMPTZ | N | NOW() | - | 제출 시각 (9:30 전인지는 앱에서 검증) |
| created_at | TIMESTAMPTZ | N | NOW() | - | 생성일시 |
| updated_at | TIMESTAMPTZ | N | NOW() | - | 수정일시 |

**제약**
- **UNIQUE(member_id, trade_date)** — 한 회원이 같은 날 예측 1건만.

**인덱스**
- `PK(id)`
- `UNIQUE(member_id, trade_date)`
- `INDEX(trade_date)` — 해당일 예측 목록·승자 계산
- `INDEX(member_id)` — 회원별 예측 이력

**비즈니스 규칙 (앱에서 검증)**
- `trade_date`는 **오늘**만 허용할지, 과거 수정 허용할지는 정책에 따름. 일반적으로 “오늘 9:30 전”만 허용.
- 승자: 해당 `trade_date`의 `closing_price_master.kospi_close`와 `ABS(predicted_value - kospi_close)` 최소인 회원.

---

### 5.4 계좌 마스터 (account_master)

| 컬럼 | 타입 | NULL | 기본값 | 제약 | 설명 |
|------|------|------|--------|------|------|
| id | BIGSERIAL | N | 자동 | PK | 계좌 식별자 |
| member_id | BIGINT | N | - | FK → members(id) ON DELETE CASCADE, UNIQUE | 회원 (1인 1계좌) |
| balance | DECIMAL(12,2) | N | 0 | - | 현재 잔액 (빵 단위. 1빵=1,000원, 입출금은 수기) |
| created_at | TIMESTAMPTZ | N | NOW() | - | 계좌 개설일시 |
| updated_at | TIMESTAMPTZ | N | NOW() | - | 수정일시 |

**인덱스**
- `PK(id)`
- `UNIQUE(member_id)` — 회원별 계좌 빠른 조회

**비고**
- 잔액 변경은 **반드시** `account_transactions` INSERT 후 `balance` 업데이트. 잔액만 바꾸지 말 것.

---

### 5.5 계좌 거래내역 (account_transactions)

| 컬럼 | 타입 | NULL | 기본값 | 제약 | 설명 |
|------|------|------|--------|------|------|
| id | BIGSERIAL | N | 자동 | PK | 거래 식별자 |
| account_id | BIGINT | N | - | FK → account_master(id) ON DELETE CASCADE | 계좌 |
| amount | DECIMAL(12,2) | N | - | - | 변동액 (+ 입금, − 출금). 0은 허용하지 않을 경우 CHECK(amount &lt;&gt; 0) |
| transaction_type | VARCHAR(20) | N | - | CHECK(아래 코드값) | 거래 구분 |
| ref_trade_date | DATE | Y | - | - | 관련 거래일 (해당일 게임 결과로 발생 시) |
| memo | VARCHAR(200) | Y | - | - | 비고 |
| created_at | TIMESTAMPTZ | N | NOW() | - | 발생일시 |

**transaction_type 권장 코드** (수기 입출금 + 몰빵 기준)
- `ENTRY_FEE` — 참가비(1빵) 차감, 당일 풀에 포함
- `WIN_POOL` — 당일 1등 몰빵 입금
- `CHARGE_MANUAL` — 수기 충전 (관리자 입금 확인 후)
- `WITHDRAW_MANUAL` — 수기 출금 (관리자 이체 후 잔액 차감)
- `ADJUST` — 관리자 조정 (예외 보정)

**인덱스**
- `PK(id)`
- `INDEX(account_id)` — 계좌별 거래 목록
- `INDEX(ref_trade_date)` — 일자별 거래 조회
- `INDEX(created_at)` — 기간별 조회

**비고**
- 트랜잭션 단위: 1) INSERT `account_transactions`, 2) UPDATE `account_master.balance += amount`. 동시성은 앱에서 락 또는 DB 트랜잭션으로 처리.

---

## 6. 선택 테이블

### 6.1 게임 라운드 (game_rounds) — 선택

날짜별 “오늘 게임 상태”, “승자”를 캐시해 두면 조회가 단순해짐. 없어도 종가·예측만으로 계산 가능.

| 컬럼 | 타입 | NULL | 기본값 | 제약 | 설명 |
|------|------|------|--------|------|------|
| id | BIGSERIAL | N | 자동 | PK | 라운드 식별자 |
| game_date | DATE | N | - | UNIQUE | 게임(거래)일 |
| status | VARCHAR(20) | N | 'open' | CHECK(open/closed/finalized) | open=예측받는중, closed=마감, finalized=종가반영·승자확정 |
| closing_price_master_id | BIGINT | Y | - | FK → closing_price_master(id) | 해당일 종가 (finalized 시) |
| winner_id | BIGINT | Y | - | FK → members(id) | 해당일 승자 (finalized 시) |
| created_at | TIMESTAMPTZ | N | NOW() | - | 생성일시 |
| updated_at | TIMESTAMPTZ | N | NOW() | - | 수정일시 |

- **생성**: 당일 첫 접속 또는 스케줄러로 당일 `game_rounds` 한 건 생성, `status = 'open'`.
- **9:30**: `status = 'closed'` 로 변경.
- **종가 입력 후**: `closing_price_master` INSERT → `game_rounds`에 `closing_price_master_id`, `winner_id` 설정, `status = 'finalized'`.

### 6.2 거래유형 코드 (transaction_type_codes) — 선택

거래 유형을 코드 테이블로 두면 확장·다국어 라벨에 유리.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| code | VARCHAR(20) PK | WIN, JOIN, ADJUST, ... |
| name | VARCHAR(50) | 표시명 (한글 등) |
| sort_order | INT | 정렬 순서 |

---

## 7. 비즈니스 규칙 정리

### 7.1 게임 상태 (game_rounds 없이 판단하는 방법)

- **오늘 예측 가능 여부**: 현재 시각 &lt; 오늘 09:30 (한국 시간) 이고, `trade_date = 오늘` 인 예측이 해당 회원에게 아직 없으면 입력 가능.
- **해당일 종가 반영 여부**: `closing_price_master`에 해당 `trade_date` 행 존재 여부.
- **승자**: 해당일 `closing_price_master.kospi_close` 존재 시, 같은 `trade_date`의 `prediction_master`에서 `ABS(predicted_value - kospi_close)` 최소인 회원 1명. 동점 시 정책(먼저 제출한 사람 등)은 앱에서 정의.

### 7.2 참가비 차감 & 1등 몰빵

- **참가 시**: 예측 등록 시 `account_transactions`에 `transaction_type = 'ENTRY_FEE'`, `amount = -1`(1빵), `ref_trade_date = 오늘` INSERT 후 `account_master.balance -= 1`.
- **15:30 종가 반영 후 1등 확정**: 당일 ENTRY_FEE 건들의 절댓값 합 = 풀(빵). 1등 회원 계좌에 `transaction_type = 'WIN_POOL'`, `amount = +풀`, `ref_trade_date = 해당일` INSERT 후 `account_master.balance += 풀`.

### 7.3 회원 가입 시

- `members` INSERT 후 `account_master`에 해당 `member_id`로 1건 INSERT, `balance = 0`. (트리거 또는 앱 로직)

---

## 8. CREATE TABLE (PostgreSQL) — 핵심 5개

```sql
-- 생성 순서: members → closing_price_master, account_master → prediction_master, account_transactions

-- 1. 회원
CREATE TABLE members (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(50)  NOT NULL,
    email         VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. 종가관리 마스터
CREATE TABLE closing_price_master (
    id            BIGSERIAL PRIMARY KEY,
    trade_date    DATE NOT NULL UNIQUE,
    kospi_close   DECIMAL(10,2) NOT NULL CHECK (kospi_close >= 0),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_closing_trade_date ON closing_price_master(trade_date);

-- 3. 예측 마스터
CREATE TABLE prediction_master (
    id              BIGSERIAL PRIMARY KEY,
    member_id       BIGINT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    trade_date      DATE NOT NULL,
    predicted_value DECIMAL(10,2) NOT NULL CHECK (predicted_value >= 0),
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(member_id, trade_date)
);
CREATE INDEX idx_prediction_trade_date ON prediction_master(trade_date);
CREATE INDEX idx_prediction_member ON prediction_master(member_id);

-- 4. 계좌 마스터
CREATE TABLE account_master (
    id         BIGSERIAL PRIMARY KEY,
    member_id  BIGINT NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
    balance    DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_account_member ON account_master(member_id);

-- 5. 계좌 거래내역
CREATE TABLE account_transactions (
    id                BIGSERIAL PRIMARY KEY,
    account_id        BIGINT NOT NULL REFERENCES account_master(id) ON DELETE CASCADE,
    amount            DECIMAL(12,2) NOT NULL,
    transaction_type  VARCHAR(20) NOT NULL
        CHECK (transaction_type IN ('ENTRY_FEE', 'WIN_POOL', 'CHARGE_MANUAL', 'WITHDRAW_MANUAL', 'ADJUST')),
    ref_trade_date    DATE NULL,
    memo              VARCHAR(200) NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tx_account ON account_transactions(account_id);
CREATE INDEX idx_tx_ref_date ON account_transactions(ref_trade_date);
CREATE INDEX idx_tx_created ON account_transactions(created_at);
```

---

## 9. 회원 가입 시 계좌 생성 (트리거 예시)

```sql
CREATE OR REPLACE FUNCTION create_account_for_new_member()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO account_master (member_id, balance)
    VALUES (NEW.id, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_member_insert
    AFTER INSERT ON members
    FOR EACH ROW
    EXECUTE PROCEDURE create_account_for_new_member();
```

---

## 10. 자주 쓰는 쿼리

**오늘 종가**
```sql
SELECT * FROM closing_price_master WHERE trade_date = CURRENT_DATE;
```

**오늘 예측 가능 여부 (앱에서 9:30은 별도 체크)**
```sql
-- 이미 오늘 예측했는지
SELECT EXISTS (
    SELECT 1 FROM prediction_master
    WHERE member_id = :member_id AND trade_date = CURRENT_DATE
);
```

**오늘 참여자 예측 목록**
```sql
SELECT pm.id, m.name, pm.predicted_value, pm.submitted_at
FROM prediction_master pm
JOIN members m ON m.id = pm.member_id
WHERE pm.trade_date = CURRENT_DATE
ORDER BY pm.submitted_at;
```

**해당일 승자 1명**
```sql
SELECT pm.member_id, m.name, pm.predicted_value, c.kospi_close,
       ABS(pm.predicted_value - c.kospi_close) AS diff
FROM prediction_master pm
JOIN members m ON m.id = pm.member_id
JOIN closing_price_master c ON c.trade_date = pm.trade_date
WHERE pm.trade_date = :trade_date
ORDER BY diff ASC
LIMIT 1;
```

**회원 계좌 + 최근 거래**
```sql
SELECT a.id, a.member_id, a.balance
FROM account_master a WHERE a.member_id = :member_id;

SELECT * FROM account_transactions
WHERE account_id = (SELECT id FROM account_master WHERE member_id = :member_id)
ORDER BY created_at DESC LIMIT 20;
```

---

## 11. 추후 확장

- **회사(조직) 분리**: `members`에 `organization_id` 추가, 필요 시 `closing_price_master` 또는 게임 단위도 조직별 분리.
- **지수 확장**: `closing_price_master`에 `index_type` ('KOSPI','KOSDAQ') 추가.
- **동점 규칙**: 승자 쿼리에서 `ORDER BY diff, submitted_at ASC` 등으로 “먼저 낸 사람 우선” 구현 가능.

이 설계를 기준으로 API·앱 구현하면 됩니다. 테이블 개수는 5개로 두고, 필요 시 `game_rounds`·`transaction_type_codes`만 추가하는 구성을 권장합니다.
