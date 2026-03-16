-- ============================================================
-- game_rounds 테이블 (해당일 1등 저장용)
-- 15:30 장 마감 후, 종가 반영 + 1등 확정 시에만 INSERT 함.
-- 접수중/마감 전에는 이 테이블에 넣지 않음.
-- 실행 조건: members, closing_price_master 테이블이 이미 있어야 함.
-- ============================================================

-- ------------------------------------------------------------
-- 게임 라운드 (game_rounds)
-- ------------------------------------------------------------
CREATE TABLE "game_rounds" (
    "id"                      BIGSERIAL    NOT NULL,
    "game_date"               DATE         NOT NULL,
    "closing_price_master_id" BIGINT       NOT NULL,
    "winner_id"               BIGINT       NOT NULL,
    "created_at"              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "PK_GAME_ROUNDS" PRIMARY KEY ("id"),
    CONSTRAINT "UK_GAME_ROUNDS_DATE" UNIQUE ("game_date"),
    CONSTRAINT "FK_game_rounds_closing" FOREIGN KEY ("closing_price_master_id")
        REFERENCES "closing_price_master" ("id"),
    CONSTRAINT "FK_game_rounds_winner" FOREIGN KEY ("winner_id")
        REFERENCES "members" ("id")
);

CREATE INDEX "idx_game_rounds_date" ON "game_rounds" ("game_date");

COMMENT ON TABLE "game_rounds" IS '날짜별 1등·종가 연결. 마감 후(종가+1등 확정 시)에만 INSERT';
COMMENT ON COLUMN "game_rounds"."id" IS '식별자 (PK)';
COMMENT ON COLUMN "game_rounds"."game_date" IS '게임(거래)일 (날짜당 1건)';
COMMENT ON COLUMN "game_rounds"."closing_price_master_id" IS '해당일 종가 레코드 (FK → closing_price_master.id)';
COMMENT ON COLUMN "game_rounds"."winner_id" IS '해당일 1등 회원 (FK → members.id)';
COMMENT ON COLUMN "game_rounds"."created_at" IS '생성일시 (결과 반영 시점)';
COMMENT ON COLUMN "game_rounds"."updated_at" IS '수정일시';
