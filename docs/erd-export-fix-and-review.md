# ERD 내보내기 오류 정리 & 실무 관점 점검

## 1. 지금 SQL에서 잘못된 부분

### 1.1 공통

- **`id2` 컬럼**: `account_master`, `prediction_master`, `account_transactions`에 `id2 BIGSERIAL`가 들어가 있음. ERD 도구가 PK를 중복으로 인식한 것 같음. **전부 삭제**해야 함.
- **FK 없음**: `ALTER TABLE`에 FK가 하나도 없음. `member_id`, `account_id` 등은 반드시 FK로 추가해야 함.
- **`members`가 맨 나중에 정의됨**: `account_master.member_id`가 members를 참조하므로, **members를 가장 먼저** 만들어야 함. 생성 순서: members → closing_price_master, account_master → prediction_master → account_transactions → game_rounds.

### 1.2 테이블별

| 테이블 | 문제 | 수정 |
|--------|------|------|
| **account_master** | `id2` 있음, `balance` DEFAULT 0 없음, `member_id` UNIQUE 없음, members FK 없음 | id2 제거, balance DEFAULT 0, member_id UNIQUE, FK → members |
| **closing_price_master** | `trade_date` UNIQUE 없음, `kospi_close` CHECK 없음, timestamp DEFAULT NOW() 없음 | trade_date UNIQUE, kospi_close >= 0 CHECK, DEFAULT NOW() |
| **prediction_master** | `UNIQUE(member_id,` / `trade_date) NULL` 로 컬럼처럼 잘못 파싱됨, `id2` 있음, members FK 없음 | UNIQUE(member_id, trade_date) 는 **테이블 제약**으로 한 줄, id2 제거, FK → members |
| **account_transactions** | `ADJUST` )) NULL 로 컬럼처럼 나옴 (원래는 transaction_type CHECK 안의 값), `id2` 있음, account FK 없음 | transaction_type CHECK(...) 만 두고 ADJUST 컬럼 삭제, id2 제거, FK → account_master |
| **members** | `email` UNIQUE 없음 | email UNIQUE 추가 |
| **(누락)** | **game_rounds** 테이블 없음 | 테이블 추가 필요 |

---

## 2. 수정된 DDL (PostgreSQL 기준)

ERDCloud에서 백틱(`) 쓰는 건 MySQL 스타일인데, 타입(BIGSERIAL, TIMESTAMPTZ)은 PostgreSQL이므로 **PostgreSQL 문법**으로 맞춘 버전이다. MySQL 쓰면 BIGSERIAL → BIGINT AUTO_INCREMENT, TIMESTAMPTZ → DATETIME 등으로 바꿔야 함.

```sql
-- 생성 순서 지키기: members → closing_price_master, account_master → prediction_master → account_transactions → game_rounds

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

-- 3. 계좌 마스터 (회원당 1계좌)
CREATE TABLE account_master (
    id         BIGSERIAL PRIMARY KEY,
    member_id  BIGINT NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
    balance    DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. 예측 마스터
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

-- 5. 계좌 거래내역
CREATE TABLE account_transactions (
    id               BIGSERIAL PRIMARY KEY,
    account_id       BIGINT NOT NULL REFERENCES account_master(id) ON DELETE CASCADE,
    amount           DECIMAL(12,2) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL
        CHECK (transaction_type IN ('ENTRY_FEE', 'WIN_POOL', 'CHARGE_MANUAL', 'WITHDRAW_MANUAL', 'ADJUST')),
    ref_trade_date   DATE NULL,
    memo             VARCHAR(200) NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. 게임 라운드
CREATE TABLE game_rounds (
    id                      BIGSERIAL PRIMARY KEY,
    game_date               DATE NOT NULL UNIQUE,
    status                  VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'closed', 'finalized')),
    closing_price_master_id BIGINT NULL REFERENCES closing_price_master(id),
    winner_id               BIGINT NULL REFERENCES members(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_closing_trade_date ON closing_price_master(trade_date);
CREATE UNIQUE INDEX idx_account_member ON account_master(member_id);
CREATE INDEX idx_prediction_trade_date ON prediction_master(trade_date);
CREATE INDEX idx_prediction_member ON prediction_master(member_id);
CREATE INDEX idx_tx_account ON account_transactions(account_id);
CREATE INDEX idx_tx_ref_date ON account_transactions(ref_trade_date);
CREATE INDEX idx_tx_created ON account_transactions(created_at);
CREATE INDEX idx_game_rounds_date ON game_rounds(game_date);
CREATE INDEX idx_game_rounds_status ON game_rounds(status);
```

---

## 3. 실무 관점에서 테이블 설계 점검

### 3.1 잘 맞춰진 부분

| 항목 | 내용 |
|------|------|
| **PK** | 테이블마다 `id BIGSERIAL` 단일 PK → 실무에서 많이 쓰는 패턴, JOIN/FK 관리 쉬움. |
| **1인 1계좌** | `account_master.member_id` UNIQUE → 회원당 계좌 1개 보장. |
| **중복 예측 방지** | `prediction_master` UNIQUE(member_id, trade_date) → 같은 날 두 번 예측 불가. |
| **거래 로그** | `account_transactions` 로 잔액 변동 전부 기록 → 감사·정산·버그 추적에 유리. |
| **날짜 단위 종가** | `closing_price_master.trade_date` UNIQUE → 날짜당 종가 1건. |
| **게임 라운드** | `game_rounds` 로 날짜별 상태·1등 캐시 → 조회 단순, 배치/앱 로직 명확. |

### 3.2 실무에서 더 보강하면 좋은 부분

| 항목 | 제안 | 우선순위 |
|------|------|----------|
| **members.role** | 관리자/일반 구분용 `role VARCHAR(20)` 또는 `is_admin BOOLEAN` | 중 (수기 충전·출금은 관리자만 하려면 필요) |
| **members.deleted_at** | 회원 탈퇴 시 로그인만 막고 데이터는 남기려면 soft delete 컬럼 | 낮 (나중에) |
| **closing_price_master.source** | 종가 입력 경로(수동/API) 등 추적용 | 낮 |
| **account_transactions.balance_after** | 거래 시점 잔액 저장 → 검증·재계산 시 유리 | 낮 (선택) |
| **인덱스** | `account_transactions(account_id, created_at)` 복합 인덱스로 “계좌별 최근 N건” 조회 최적화 | 중 |

### 3.3 정규화·확장성

- **정규화**: 반복 데이터 없고, 회원/계좌/예측/종가/거래가 역할별로 잘 나뉘어 있어서 무난함.
- **회사(조직) 여러 개** 나중에 넣을 경우: `members`에 `organization_id` 추가, `closing_price_master` 또는 `game_rounds`도 조직별로 쪼개는 식으로 확장 가능. 지금은 단일 조직 전제라면 그대로 두면 됨.

### 3.4 요약

- **지금 ERD 내보내기**: `id2` 제거, UNIQUE/CHECK/FK/DEFAULT 보강, `game_rounds` 추가, 생성 순서 맞추면 됨.
- **실무적으로**: 전반적으로 무난하고, 관리자 역할(role)과 계좌 거래 조회용 인덱스만 보강하면 충분히 쓸 만한 수준임.

위 수정 DDL은 `sql/001_schema.sql` 과 동일한 내용이므로, 그 파일을 기준으로 ERD를 다시 맞추거나 마이그레이션에 사용하면 된다.
