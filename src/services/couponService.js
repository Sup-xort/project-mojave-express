const db = require('../db');
const config = require('../config');
const { nowUnix } = require('../utils/time');

const getStampsStmt = db.prepare('SELECT stamps FROM customers WHERE id = ?');
const deductStampsStmt = db.prepare('UPDATE customers SET stamps = stamps - ? WHERE id = ?');
const insertStmt = db.prepare(`
  INSERT INTO coupons (customer_id, status, stamp_cost, issued_at)
  VALUES (?, 'unused', ?, ?)
`);
const listUnusedStmt = db.prepare(`
  SELECT * FROM coupons WHERE customer_id = ? AND status = 'unused'
  ORDER BY issued_at ASC, id ASC
`);
const countUnusedStmt = db.prepare(
  "SELECT COUNT(*) AS n FROM coupons WHERE customer_id = ? AND status = 'unused'"
);
const listUsedStmt = db.prepare(`
  SELECT * FROM coupons WHERE customer_id = ? AND status = 'used'
  ORDER BY used_at DESC LIMIT ?
`);
const findByIdStmt = db.prepare('SELECT * FROM coupons WHERE id = ?');
const findOwnedStmt = db.prepare('SELECT * FROM coupons WHERE id = ? AND customer_id = ?');
const lastUsedStmt = db.prepare(`
  SELECT * FROM coupons WHERE customer_id = ? AND status = 'used' AND used_at >= ?
  ORDER BY used_at DESC LIMIT 1
`);

// 상태 전이는 전부 "현재 상태를 WHERE에 박은 UPDATE"로 한다. SELECT로 확인한 뒤 UPDATE하면
// 요청 두 개가 동시에 들어왔을 때 둘 다 통과해버린다 (stampService의 QR 선점과 같은 이유).
const claimStmt = db.prepare(
  "UPDATE coupons SET status = 'pending' WHERE id = ? AND status = 'unused'"
);
const releaseStmt = db.prepare(
  "UPDATE coupons SET status = 'unused' WHERE id = ? AND status = 'pending'"
);
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

  let stamps = getStampsStmt.get(customerId).stamps;
  let issued = 0;
  while (stamps >= cost) {
    deductStampsStmt.run(cost, customerId);
    insertStmt.run(customerId, cost, now);
    stamps -= cost;
    issued += 1;
  }
  return issued;
}

function listUnused(customerId) {
  return listUnusedStmt.all(customerId);
}

function countUnused(customerId) {
  return countUnusedStmt.get(customerId).n;
}

function listUsed(customerId, limit = 20) {
  return listUsedStmt.all(customerId, limit);
}

function findById(id) {
  return findByIdStmt.get(id);
}

// 남의 쿠폰 id를 넣어보는 것을 막기 위해 소유자까지 함께 조건에 넣는다.
function findOwned(id, customerId) {
  return findOwnedStmt.get(id, customerId);
}

// 최근 usedWithinSec 안에 사용된 쿠폰. 손님이 앱을 껐다 켜도 "사용 완료"를 다시 보여주기 위한 것.
function findRecentlyUsed(customerId, usedWithinSec) {
  return lastUsedStmt.get(customerId, nowUnix() - usedWithinSec);
}

function claim(id) {
  return claimStmt.run(id).changes > 0;
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
  listUsed,
  findById,
  findOwned,
  findRecentlyUsed,
  claim,
  release,
  markUsed,
};
