-- plan.md 섹션 1의 데이터 모델을 그대로 반영한다.
-- PRAGMA는 src/db/index.js에서 연결 시점에 설정한다.

CREATE TABLE IF NOT EXISTS customers (
  id             TEXT PRIMARY KEY,          -- UUID v4
  nickname       TEXT NOT NULL,             -- 표시용 원본
  nickname_key   TEXT NOT NULL UNIQUE,      -- 정규화 결과. 중복 판정 기준
  pin_hash       TEXT NOT NULL,             -- bcrypt
  stamps         INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,          -- unix seconds
  last_stamp_at  INTEGER,
  failed_count   INTEGER NOT NULL DEFAULT 0,
  locked_until   INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,            -- sha256(원본토큰)
  customer_id  TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_customer ON sessions(customer_id);

-- 매장 QR 토큰 (사장님 패드가 결제 시점에 발급받아 표시)
CREATE TABLE IF NOT EXISTS qr_tokens (
  token       TEXT PRIMARY KEY,             -- 랜덤 base64url
  amount      INTEGER NOT NULL,             -- 사장님이 선택한 스탬프 수량
  issued_at   INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_by     TEXT REFERENCES customers(id),-- 소진되면 채워짐
  used_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_qr_expires ON qr_tokens(expires_at);

-- 적립 원장
CREATE TABLE IF NOT EXISTS stamp_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  qr_token     TEXT NOT NULL UNIQUE,        -- 토큰당 1건. 1회용 보장의 최종 방어선
  amount       INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stamp_customer ON stamp_log(customer_id, created_at DESC);

-- 리워드 정의. 사장님이 관리자에서 등록·수정한다
CREATE TABLE IF NOT EXISTS rewards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,                 -- "드립 커피 1잔"
  cost       INTEGER NOT NULL,              -- 필요 스탬프 수
  start_min  INTEGER NOT NULL,              -- 0~1439, 매장 로컬 시각 기준 분
  end_min    INTEGER NOT NULL,              -- start > end 이면 자정을 넘는 구간
  active     INTEGER NOT NULL DEFAULT 1,    -- 스케줄과 무관한 수동 on/off
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 리워드 교환
CREATE TABLE IF NOT EXISTS redemptions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  reward_id    INTEGER NOT NULL REFERENCES rewards(id),
  reward_name  TEXT NOT NULL,               -- 요청 시점 스냅샷
  reward_cost  INTEGER NOT NULL,            -- 요청 시점 스냅샷
  status       TEXT NOT NULL,               -- 'pending' | 'approved' | 'expired' | 'cancelled'
  requested_at INTEGER NOT NULL,
  resolved_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_redemptions_pending ON redemptions(status, requested_at);

-- 로그인 시도 제한 (IP 기준)
CREATE TABLE IF NOT EXISTS login_attempts (
  ip         TEXT NOT NULL,
  attempt_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(ip, attempt_at);
