-- ============================================================
-- 천원빵 DB 스키마 (PostgreSQL)
-- 실행 순서대로 실행하면 됨.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 회원 (members)
-- ------------------------------------------------------------
CREATE TABLE members (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(50)  NOT NULL,
    email         VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE members IS '회원 (로그인·참가자)';
COMMENT ON COLUMN members.id IS '회원 식별자 (PK)';
COMMENT ON COLUMN members.name IS '이름';
COMMENT ON COLUMN members.email IS '로그인용 이메일 (중복 불가)';
COMMENT ON COLUMN members.password_hash IS '비밀번호 해시 (bcrypt 등)';
COMMENT ON COLUMN members.created_at IS '가입일시';
COMMENT ON COLUMN members.updated_at IS '수정일시';

-- ------------------------------------------------------------
-- 2. 종가관리 마스터 (closing_price_master)
-- ------------------------------------------------------------
CREATE TABLE closing_price_master (
    id            BIGSERIAL PRIMARY KEY,
    trade_date    DATE NOT NULL UNIQUE,
    kospi_close   DECIMAL(10,2) NOT NULL CHECK (kospi_close >= 0),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_closing_trade_date ON closing_price_master(trade_date);

COMMENT ON TABLE closing_price_master IS '날짜별 KOSPI 종가 (15:30 장 마감 기준)';
COMMENT ON COLUMN closing_price_master.id IS '종가 레코드 식별자 (PK)';
COMMENT ON COLUMN closing_price_master.trade_date IS '거래일 (종가 기준일, 날짜당 1건)';
COMMENT ON COLUMN closing_price_master.kospi_close IS 'KOSPI 종가 (예: 2512.50)';
COMMENT ON COLUMN closing_price_master.registered_at IS '종가를 DB에 등록한 시각';
COMMENT ON COLUMN closing_price_master.created_at IS '레코드 생성일시';
COMMENT ON COLUMN closing_price_master.updated_at IS '수정일시';

-- ------------------------------------------------------------
-- 3. 계좌 마스터 (account_master) - 회원당 1계좌, 빵 지갑
-- ------------------------------------------------------------
CREATE TABLE account_master (
    id         BIGSERIAL PRIMARY KEY,
    member_id  BIGINT NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
    balance    DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_account_member ON account_master(member_id);

COMMENT ON TABLE account_master IS '회원당 1계좌, balance = 빵 잔액 (1빵=1000원)';
COMMENT ON COLUMN account_master.id IS '계좌 식별자 (PK)';
COMMENT ON COLUMN account_master.member_id IS '회원 ID (1인 1계좌, FK → members.id)';
COMMENT ON COLUMN account_master.balance IS '현재 빵 잔액 (1빵=1000원, 입출금은 수기)';
COMMENT ON COLUMN account_master.created_at IS '계좌 개설일시';
COMMENT ON COLUMN account_master.updated_at IS '수정일시';

-- ------------------------------------------------------------
-- 4. 예측 마스터 (prediction_master)
-- ------------------------------------------------------------
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

COMMENT ON TABLE prediction_master IS '회원별·날짜별 예측 1건 (00.00 단위), 9:30 전 입력';
COMMENT ON COLUMN prediction_master.id IS '예측 식별자 (PK)';
COMMENT ON COLUMN prediction_master.member_id IS '예측한 회원 ID (FK → members.id)';
COMMENT ON COLUMN prediction_master.trade_date IS '예측 대상일 (해당일 종가와 비교)';
COMMENT ON COLUMN prediction_master.predicted_value IS '예측 KOSPI 지수 (00.00 단위, 예: 2512.50)';
COMMENT ON COLUMN prediction_master.submitted_at IS '예측 제출 시각 (9:30 전만 허용)';
COMMENT ON COLUMN prediction_master.created_at IS '레코드 생성일시';
COMMENT ON COLUMN prediction_master.updated_at IS '수정일시';

-- ------------------------------------------------------------
-- 5. 계좌 거래내역 (account_transactions) - 로그/원장
-- ------------------------------------------------------------
CREATE TABLE account_transactions (
    id                BIGSERIAL PRIMARY KEY,
    account_id        BIGINT NOT NULL REFERENCES account_master(id) ON DELETE CASCADE,
    amount            DECIMAL(12,2) NOT NULL,
    transaction_type  VARCHAR(20) NOT NULL
        CHECK (transaction_type IN (
            'ENTRY_FEE',       -- 참가비(1빵) 차감
            'WIN_POOL',        -- 1등 몰빵 입금
            'CHARGE_MANUAL',   -- 수기 충전
            'WITHDRAW_MANUAL', -- 수기 출금
            'ADJUST'           -- 관리자 조정
        )),
    ref_trade_date    DATE NULL,
    memo              VARCHAR(200) NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tx_account ON account_transactions(account_id);
CREATE INDEX idx_tx_ref_date ON account_transactions(ref_trade_date);
CREATE INDEX idx_tx_created ON account_transactions(created_at);

COMMENT ON TABLE account_transactions IS '계좌 잔액 변동 로그 (참가비/몰빵/충전/출금/조정)';
COMMENT ON COLUMN account_transactions.id IS '거래 식별자 (PK)';
COMMENT ON COLUMN account_transactions.account_id IS '계좌 ID (FK → account_master.id)';
COMMENT ON COLUMN account_transactions.amount IS '변동액 (양수=입금, 음수=출금, 빵 단위)';
COMMENT ON COLUMN account_transactions.transaction_type IS '거래 구분: ENTRY_FEE(참가비), WIN_POOL(1등몰빵), CHARGE_MANUAL(수기충전), WITHDRAW_MANUAL(수기출금), ADJUST(관리자조정)';
COMMENT ON COLUMN account_transactions.ref_trade_date IS '관련 거래일 (해당일 게임에서 발생한 경우)';
COMMENT ON COLUMN account_transactions.memo IS '비고';
COMMENT ON COLUMN account_transactions.created_at IS '거래 발생일시';

-- ------------------------------------------------------------
-- 6. 게임 라운드 (game_rounds) - 날짜별 게임 상태·1등 캐시
-- ------------------------------------------------------------
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

CREATE INDEX idx_game_rounds_date ON game_rounds(game_date);
CREATE INDEX idx_game_rounds_status ON game_rounds(status);

COMMENT ON TABLE game_rounds IS '날짜별 게임 상태: open(예측받는중) → closed(9:30마감) → finalized(종가·1등 확정)';
COMMENT ON COLUMN game_rounds.id IS '라운드 식별자 (PK)';
COMMENT ON COLUMN game_rounds.game_date IS '게임(거래)일 (날짜당 1건)';
COMMENT ON COLUMN game_rounds.status IS '상태: open(예측 접수중), closed(9:30 마감), finalized(종가 반영·1등 확정)';
COMMENT ON COLUMN game_rounds.closing_price_master_id IS '해당일 종가 레코드 ID (FK, finalized 시 설정)';
COMMENT ON COLUMN game_rounds.winner_id IS '해당일 1등 회원 ID (FK → members.id, finalized 시 설정)';
COMMENT ON COLUMN game_rounds.created_at IS '레코드 생성일시';
COMMENT ON COLUMN game_rounds.updated_at IS '수정일시';

-- ------------------------------------------------------------
-- 트리거: 회원 가입 시 계좌 1개 자동 생성
-- ------------------------------------------------------------
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
