const db = require('../db');
const config = require('../config');
const settingsService = require('./settingsService');
const { nowUnix } = require('../utils/time');

// 만료 여부를 SQL에서 판정하는 공통 조건. 크론이 아직 쓸어담지 않은 쿠폰도 손님에게 보이면 안 되므로
// "status가 unused"만으로는 부족하고 항상 이 조건을 함께 건다.
const NOT_EXPIRED = '(expires_at IS NULL OR expires_at > ?)';

const getStampsStmt = db.prepare('SELECT stamps FROM customers WHERE id = ?');
const deductStampsStmt = db.prepare('UPDATE customers SET stamps = stamps - ? WHERE id = ?');
const insertStmt = db.prepare(`
  INSERT INTO coupons (customer_id, status, stamp_cost, issued_at, expires_at)
  VALUES (?, 'unused', ?, ?, ?)
`);
const listUnusedStmt = db.prepare(`
  SELECT * FROM coupons WHERE customer_id = ? AND status = 'unused' AND ${NOT_EXPIRED}
  ORDER BY (expires_at IS NULL), expires_at ASC, issued_at ASC, id ASC
`);
const countUnusedStmt = db.prepare(
  `SELECT COUNT(*) AS n FROM coupons WHERE customer_id = ? AND status = 'unused' AND ${NOT_EXPIRED}`
);
// 사용 완료와 만료를 한 목록으로 보여준다. 손님에게는 둘 다 "지나간 쿠폰"이다.
const listHistoryStmt = db.prepare(`
  SELECT * FROM coupons WHERE customer_id = ? AND status IN ('used', 'expired')
  ORDER BY COALESCE(used_at, expires_at) DESC LIMIT ?
`);
const findByIdStmt = db.prepare('SELECT * FROM coupons WHERE id = ?');
const findOwnedStmt = db.prepare('SELECT * FROM coupons WHERE id = ? AND customer_id = ?');
const lastUsedStmt = db.prepare(`
  SELECT * FROM coupons WHERE customer_id = ? AND status = 'used' AND used_at >= ?
  ORDER BY used_at DESC LIMIT 1
`);
const expireStaleStmt = db.prepare(`
  UPDATE coupons SET status = 'expired'
  WHERE status = 'unused' AND expires_at IS NOT NULL AND expires_at <= ?
`);

// 상태 전이는 전부 "현재 상태를 WHERE에 박은 UPDATE"로 한다. SELECT로 확인한 뒤 UPDATE하면
// 요청 두 개가 동시에 들어왔을 때 둘 다 통과해버린다 (stampService의 QR 선점과 같은 이유).
// 선점 시점에도 만료를 확인한다 — 화면에 떠 있던 쿠폰이 그 사이 만료됐을 수 있다.
const claimStmt = db.prepare(
  `UPDATE coupons SET status = 'pending' WHERE id = ? AND status = 'unused' AND ${NOT_EXPIRED}`
);
const releaseStmt = db.prepare(
  "UPDATE coupons SET status = 'unused' WHERE id = ? AND status = 'pending'"
);
// 이미 사장님 앞에 선 쿠폰이라 만료 시각이 지났더라도 승인은 통과시킨다.
// 유효기간 안에 요청한 손님이 승인 대기 몇 분 사이에 걸쳐 만료되는 것은 부당하다.
const markUsedStmt = db.prepare(`
  UPDATE coupons SET status = 'used', used_at = ?, reward_id = ?, reward_name = ?
  WHERE id = ? AND status = 'pending'
`);

// 스탬프가 기준치를 넘은 만큼 쿠폰으로 바꾼다. QR 한 장으로 최대 QR_AMOUNT_MAX개까지 적립되고
// 이월분도 있어서 한 번에 두 장 이상 나올 수 있다 — 그래서 if가 아니라 while이다.
// 반드시 스탬프를 더한 트랜잭션 안에서 호출한다 (better-sqlite3는 동기라 그대로 부르면 된다).
function issueForStamps(customerId, now = nowUnix()) {
  const cost = config.couponStampCost;
  if (cost <= 0) return 0;

  // 만료 시각은 발급하는 지금의 정책으로 계산해 쿠폰에 새긴다. 이후 정책이 바뀌어도 이 값은 그대로다.
  const expiresAt = settingsService.couponExpiresAt(now);

  let stamps = getStampsStmt.get(customerId).stamps;
  let issued = 0;
  while (stamps >= cost) {
    deductStampsStmt.run(cost, customerId);
    insertStmt.run(customerId, cost, now, expiresAt);
    stamps -= cost;
    issued += 1;
  }
  return issued;
}

// 만료가 임박한 것부터 쓰도록 정렬해서 내려준다 (무기한은 맨 뒤).
function listUnused(customerId) {
  return listUnusedStmt.all(customerId, nowUnix());
}

function countUnused(customerId) {
  return countUnusedStmt.get(customerId, nowUnix()).n;
}

function listHistory(customerId, limit = 20) {
  return listHistoryStmt.all(customerId, limit);
}

function findById(id) {
  return findByIdStmt.get(id);
}

// 남의 쿠폰 id를 넣어보는 것을 막기 위해 소유자까지 함께 조건에 넣는다.
function findOwned(id, customerId) {
  return findOwnedStmt.get(id, customerId);
}

function isExpired(coupon, now = nowUnix()) {
  return Boolean(coupon.expires_at && coupon.expires_at <= now);
}

// 유효기간이 지난 미사용 쿠폰을 크론이 expired로 바꾼다. 조회 쪽에도 만료 조건이 걸려 있어서
// 이걸 늦게 돌려도 손님에게 만료된 쿠폰이 보이지는 않는다. 상태를 정리해 내역에 남기는 역할이다.
function expireStale(now = nowUnix()) {
  return expireStaleStmt.run(now).changes;
}

// 최근 usedWithinSec 안에 사용된 쿠폰. 손님이 앱을 껐다 켜도 "사용 완료"를 다시 보여주기 위한 것.
function findRecentlyUsed(customerId, usedWithinSec) {
  return lastUsedStmt.get(customerId, nowUnix() - usedWithinSec);
}

function claim(id) {
  return claimStmt.run(id, nowUnix()).changes > 0;
}

function release(id) {
  return releaseStmt.run(id).changes > 0;
}

function markUsed(id, reward, now = nowUnix()) {
  return markUsedStmt.run(now, reward.id, reward.name, id).changes > 0;
}

module.exports = {
  issueForStamps,
  listUnused,
  countUnused,
  listHistory,
  findById,
  findOwned,
  findRecentlyUsed,
  isExpired,
  expireStale,
  claim,
  release,
  markUsed,
};
