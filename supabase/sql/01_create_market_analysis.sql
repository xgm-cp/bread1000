-- market_analysis 테이블 생성
-- 항상 1건만 보관 (매일 TRUNCATE 후 INSERT)
CREATE TABLE IF NOT EXISTS market_analysis (
  id           bigserial PRIMARY KEY,
  date         date        NOT NULL,
  reason       text,
  impact_factor text,
  summary      text,
  created_at   timestamptz DEFAULT now()
);

-- RLS 비활성화 (Edge Function이 service role key로 접근)
ALTER TABLE market_analysis DISABLE ROW LEVEL SECURITY;
