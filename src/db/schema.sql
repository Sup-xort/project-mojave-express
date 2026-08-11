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

-- 리워드 정의. 사장님이 관리자에서 등록·수정한다.
-- 쿠폰 1장으로 무엇을 받을지는 "쓰는 시점의 시각"이 어느 리워드의 시간대에 들어가느냐로 정해진다.
CREATE TABLE IF NOT EXISTS rewards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,                 -- "드립 커피 1잔"
  cost       INTEGER NOT NULL,              -- 사용 안 함. 쿠폰 1장 = COUPON_STAMP_COST로 고정이라
                                            -- 서버가 그 값을 채워 넣기만 한다 (기록용)
  start_min  INTEGER NOT NULL,              -- 0~1439, 매장 로컬 시각 기준 분
  end_min    INTEGER NOT NULL,              -- start > end 이면 자정을 넘는 구간
  active     INTEGER NOT NULL DEFAULT 1,    -- 스케줄과 무관한 수동 on/off
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 스탬프가 COUPON_STAMP_COST(기본 10)개 모이면 자동 발급되는 쿠폰.
-- 발급 시점에는 "무엇으로 바꿀지"가 비어 있다 — 쓰는 시점의 시간대가 그걸 정하기 때문이다.
CREATE TABLE IF NOT EXISTS coupons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,               -- 'unused' | 'pending' | 'used' | 'expired'
  stamp_cost  INTEGER NOT NULL,            -- 발급 시점 스냅샷. 나중에 정책이 바뀌어도 과거 기록은 그대로
  issued_at   INTEGER NOT NULL,
  expires_at  INTEGER,                     -- 발급 시점의 유효기간 정책 스냅샷. NULL이면 무기한.
                                           -- 나중에 기간을 켜도 이미 발급된 쿠폰은 NULL 그대로 둔다
  used_at     INTEGER,
  reward_id   INTEGER REFERENCES rewards(id),  -- 사용 확정(사장님 승인) 시점 스냅샷
  reward_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_coupons_customer ON coupons(customer_id, status, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupons_expiry ON coupons(status, expires_at);

-- 사장님이 앱에서 바꾸는 운영 설정. 서버 재시작 없이 반영돼야 하는 값만 여기 둔다
-- (PIN_PEPPER처럼 보안에 관계된 값은 .env에 그대로 남긴다).
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 쿠폰 사용 요청. 사장님이 승인해야 쿠폰이 실제로 소진된다.
CREATE TABLE IF NOT EXISTS redemptions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id  TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  coupon_id    INTEGER REFERENCES coupons(id),
  reward_id    INTEGER NOT NULL REFERENCES rewards(id),
  reward_name  TEXT NOT NULL,               -- 요청 시점 스냅샷
  reward_cost  INTEGER NOT NULL,            -- 요청 시점 스냅샷(쿠폰의 stamp_cost). 기록용
  status       TEXT NOT NULL,               -- 'pending' | 'approved' | 'expired' | 'cancelled'
  requested_at INTEGER NOT NULL,
  resolved_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_redemptions_pending ON redemptions(status, requested_at);

-- 로그인 시도 제한 (IP 기준). 손님·사장님 로그인 모두 여기 기록한다.
CREATE TABLE IF NOT EXISTS login_attempts (
  ip         TEXT NOT NULL,
  attempt_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(ip, attempt_at);

-- 사장님(오너) 계정. 매장 태블릿 한 대에서 쓰는 것을 가정하지만 스키마는 여러 계정도 담을 수 있다.
CREATE TABLE IF NOT EXISTS owners (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL,             -- 표시용 원본
  username_key   TEXT NOT NULL UNIQUE,      -- 정규화 결과. 중복 판정/로그인 조회 기준
  password_hash  TEXT NOT NULL,             -- bcrypt
  created_at     INTEGER NOT NULL,          -- unix seconds
  failed_count   INTEGER NOT NULL DEFAULT 0,
  locked_until   INTEGER
);

CREATE TABLE IF NOT EXISTS owner_sessions (
  token_hash   TEXT PRIMARY KEY,            -- sha256(원본토큰)
  owner_id     INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_owner_sessions_owner ON owner_sessions(owner_id);

CREATE INDEX IF NOT EXISTS idx_redemptions_customer ON redemptions(customer_id, requested_at DESC);
