const db = require('../db');
const { nowUnix } = require('../utils/time');

const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const upsertStmt = db.prepare(`
  INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);

// 쿠폰 유효기간(일). 0이면 무기한 — 이 앱의 기본값이다.
const COUPON_TTL_DAYS = 'coupon_ttl_days';
const MAX_TTL_DAYS = 3650;

function getInt(key, fallback) {
  const row = getStmt.get(key);
  if (!row) return fallback;
  const n = Number.parseInt(row.value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function setInt(key, value) {
  upsertStmt.run(key, String(value), nowUnix());
}

function getCouponTtlDays() {
  return getInt(COUPON_TTL_DAYS, 0);
}

function isValidTtlDays(n) {
  return Number.isInteger(n) && n >= 0 && n <= MAX_TTL_DAYS;
}

function setCouponTtlDays(days) {
  setInt(COUPON_TTL_DAYS, days);
}

// 발급 시점에 만료 시각을 계산해 쿠폰에 새겨둔다. 나중에 정책이 바뀌어도 이미 발급된 쿠폰은
// 자기가 들고 있는 값을 그대로 유지한다 — 손님에게 이미 준 것을 소급해서 만료시키지 않기 위해서다.
function couponExpiresAt(issuedAt) {
  const days = getCouponTtlDays();
  return days > 0 ? issuedAt + days * 86400 : null;
}

module.exports = {
  MAX_TTL_DAYS,
  getCouponTtlDays,
  setCouponTtlDays,
  isValidTtlDays,
  couponExpiresAt,
};
