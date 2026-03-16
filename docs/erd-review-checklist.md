# ERD 내보내기 검토 체크리스트

## 1. 빠진 것 / 수정할 것

### 1.1 제약 조건 (전 테이블 공통)

| 항목 | 상태 | 수정 |
|------|------|------|
| **PK** | CREATE TABLE 안에 PRIMARY KEY 없음 | 각 테이블 `id` 에 PRIMARY KEY 추가 |
| **FK** | 어디에도 없음 | 아래 관계대로 FK 추가 |
| **DEFAULT** | created_at, updated_at, balance 등 | `DEFAULT NOW()`, `balance DEFAULT 0` 등 필요 시 추가 |

### 1.2 테이블별

| 테이블 | 문제 | 수정 |
|--------|------|------|
| **account_master** | member_id UNIQUE 없음, members FK 없음, balance 기본값 없음 | UNIQUE(member_id), REFERENCES members(id), balance DEFAULT 0 |
| **closing_price_master** | `"Field" VARCHAR(255) NULL` 컬럼 있음 (도구 찌꺼기), trade_date UNIQUE 없음 | Field 컬럼 삭제, trade_date UNIQUE |
| **prediction_master** | member_id·trade_date 중복 방지 없음, members FK 없음 | UNIQUE(member_id, trade_date), REFERENCES members(id) |
| **account_transactions** | account_master FK 없음, transaction_type 허용값 제한 없음 | REFERENCES account_master(id), CHECK(transaction_type IN (...)) |
| **members** | email UNIQUE 없음 | email UNIQUE |
| **(누락)** | **game_rounds** 테이블 없음 | 테이블 추가 (날짜별 게임 상태·1등) |

### 1.3 관계 (FK 정리)

- `account_master.member_id` → `members(id)` ON DELETE CASCADE
- `prediction_master.member_id` → `members(id)` ON DELETE CASCADE
- `account_transactions.account_id` → `account_master(id)` ON DELETE CASCADE
- game_rounds 있으면: `game_rounds.closing_price_master_id` → `closing_price_master(id)`, `game_rounds.winner_id` → `members(id)`

### 1.4 코멘트

- **members.email**  
  지금: `'UNIQUE'`  
  권장: `'로그인 이메일 (중복 불가)'` 처럼 의미 적어두기
- **members.role**  
  `int` 로 두었다면: `'권한 (0=일반, 1=관리자 등)'` 처럼 코드 의미 적어두기

### 1.5 기타

- **members.role**  
  타입 `int` → 관리자/일반만 쓸 거면 `SMALLINT` 또는 `VARCHAR(20)` ('admin','user') 도 가능. 지금처럼 두고 COMMENT만 보강해도 됨.

---

## 2. 수정 반영한 DDL (참고용)

아래는 위 수정사항 반영 + game_rounds 포함한 **전체 CREATE + COMMENT** 예시다.  
(실제 적용 시 생성 순서: members → closing_price_master, account_master → prediction_master → account_transactions → game_rounds)

```sql
-- 1. members
CREATE TABLE "members" (
    "id"            BIGSERIAL PRIMARY KEY,
    "name"          VARCHAR(50)  NOT NULL,
    "email"         VARCHAR(100) NOT NULL UNIQUE,
    "password_hash"  VARCHAR(255) NOT NULL,
    "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "role"          SMALLINT NULL
);
COMMENT ON COLUMN "members"."email" IS '로그인 이메일 (중복 불가)';
COMMENT ON COLUMN "members"."role" IS '권한 (0=일반, 1=관리자)';

-- 2. closing_price_master ("Field" 제거, trade_date UNIQUE)
CREATE TABLE "closing_price_master" (
    "id"            BIGSERIAL PRIMARY KEY,
    "trade_date"    DATE NOT NULL UNIQUE,
    "kospi_close"   DECIMAL(10,2) NOT NULL CHECK ("kospi_close" >= 0),
    "registered_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. account_master (member_id UNIQUE, FK, balance DEFAULT 0)
CREATE TABLE "account_master" (
    "id"         BIGSERIAL PRIMARY KEY,
    "member_id"  BIGINT NOT NULL UNIQUE REFERENCES "members"("id") ON DELETE CASCADE,
    "balance"    DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. prediction_master (UNIQUE(member_id, trade_date), FK)
CREATE TABLE "prediction_master" (
    "id"              BIGSERIAL PRIMARY KEY,
    "member_id"       BIGINT NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
    "trade_date"      DATE NOT NULL,
    "predicted_value" DECIMAL(10,2) NOT NULL CHECK ("predicted_value" >= 0),
    "submitted_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE("member_id", "trade_date")
);

-- 5. account_transactions (FK, transaction_type CHECK)
CREATE TABLE "account_transactions" (
    "id"               BIGSERIAL PRIMARY KEY,
    "account_id"        BIGINT NOT NULL REFERENCES "account_master"("id") ON DELETE CASCADE,
    "amount"            DECIMAL(12,2) NOT NULL,
    "transaction_type"  VARCHAR(20) NOT NULL CHECK ("transaction_type" IN (
        'ENTRY_FEE', 'WIN_POOL', 'CHARGE_MANUAL', 'WITHDRAW_MANUAL', 'ADJUST'
    )),
    "ref_trade_date"    DATE NULL,
    "memo"              VARCHAR(200) NULL,
    "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. game_rounds (추가)
CREATE TABLE "game_rounds" (
    "id"                      BIGSERIAL PRIMARY KEY,
    "game_date"               DATE NOT NULL UNIQUE,
    "status"                  VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK ("status" IN ('open', 'closed', 'finalized')),
    "closing_price_master_id" BIGINT NULL REFERENCES "closing_price_master"("id"),
    "winner_id"               BIGINT NULL REFERENCES "members"("id"),
    "created_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. 요약

| 구분 | 내용 |
|------|------|
| **관계** | PK/FK가 DDL에 없음 → 위처럼 PK, REFERENCES 추가 필요 |
| **코멘트** | 대체로 괜찮음. members.email은 'UNIQUE' 대신 '로그인 이메일 (중복 불가)', members.role은 코드 의미 적어두기 |
| **수정 필요** | closing_price_master의 `Field` 컬럼 삭제, UNIQUE/CHECK/FK/DEFAULT 보강, game_rounds 테이블 추가 |

이 체크리스트대로만 반영하면 관계·코멘트·제약이 설계서와 맞게 됨.
