const db = require('../db');
const config = require('../config');
const { nowUnix } = require('../utils/time');

const findPendingForCustomerStmt = db.prepare(`
  SELECT * FROM redemptions WHERE customer_id = ? AND status = 'pending'
  ORDER BY requested_at DESC LIMIT 1
`);
const findLatestForCustomerStmt = db.prepare(`
  SELECT * FROM redemptions WHERE customer_id = ?
  ORDER BY requested_at DESC LIMIT 1
`);
const insertStmt = db.prepare(`
  INSERT INTO redemptions (customer_id, reward_id, reward_name, reward_cost, status, requested_at)
  VALUES (?, ?, ?, ?, 'pending', ?)
`);
const findByIdStmt = db.prepare('SELECT * FROM redemptions WHERE id = ?');
const setStatusStmt = db.prepare(
  'UPDATE redemptions SET status = ?, resolved_at = ? WHERE id = ?'
);
const listPendingStmt = db.prepare(`
  SELECT redemptions.*, customers.nickname AS customer_nickname
  FROM redemptions JOIN customers ON customers.id = redemptions.customer_id
  WHERE redemptions.status = 'pending'
  ORDER BY redemptions.requested_at ASC
`);
const expireStaleStmt = db.prepare(`
  UPDATE redemptions SET status = 'expired', resolved_at = ?
  WHERE status = 'pending' AND requested_at < ?
`);
const listByCustomerStmt = db.prepare(
  'SELECT * FROM redemptions WHERE customer_id = ? ORDER BY requested_at DESC LIMIT ?'
);
const countPendingStmt = db.prepare("SELECT COUNT(*) AS n FROM redemptions WHERE status = 'pending'");
const countApprovedSinceStmt = db.prepare(
  "SELECT COUNT(*) AS n FROM redemptions WHERE status = 'approved' AND resolved_at >= ?"
);

function getPendingForCustomer(customerId) {
  return findPendingForCustomerStmt.get(customerId);
}

// pending 뿐 아니라 방금 approved/expired/cancelled된 것까지 알아야
// 대기 화면 폴링이 "사용 완료" 등 최종 상태를 감지할 수 있다.
function getLatestForCustomer(customerId) {
  return findLatestForCustomerStmt.get(customerId);
}

function createRequest({ customerId, reward }) {
  const now = nowUnix();
  const info = insertStmt.run(customerId, reward.id, reward.name, reward.cost, now);
  return findByIdStmt.get(info.lastInsertRowid);
}

function getById(id) {
  return findByIdStmt.get(id);
}

function cancel(id) {
  setStatusStmt.run('cancelled', nowUnix(), id);
}

function listPending() {
  return listPendingStmt.all();
}

// 5.3/5.4/5.6: 트랜잭션 안에서 pending 재확인 후 스냅샷 cost로 차감한다. db.js는 better-sqlite3(동기)이므로
// db.transaction으로 감싸면 원자성이 보장된다.
const approveTx = db.transaction((id, deductStamps) => {
  const redemption = findByIdStmt.get(id);
  if (!redemption || redemption.status !== 'pending') {
    return { ok: false, redemption };
  }
  deductStamps(redemption.customer_id, redemption.reward_cost);
  setStatusStmt.run('approved', nowUnix(), id);
  return { ok: true, redemption: findByIdStmt.get(id) };
});

// 5.5: pending인데 requested_at + TTL이 지난 것은 크론이 expired로 바꾼다.
function expireStale() {
  const cutoff = nowUnix() - config.redemptionTtlSec;
  expireStaleStmt.run(nowUnix(), cutoff);
}

function listByCustomer(customerId, limit = 20) {
  return listByCustomerStmt.all(customerId, limit);
}

function countPending() {
  return countPendingStmt.get().n;
}

// 오너 대시보드의 "오늘 승인된 교환" 집계용.
function countApprovedSince(sinceUnix) {
  return countApprovedSinceStmt.get(sinceUnix).n;
}

module.exports = {
  getPendingForCustomer,
  getLatestForCustomer,
  createRequest,
  getById,
  cancel,
  listPending,
  approveTx,
  expireStale,
  listByCustomer,
  countPending,
  countApprovedSince,
};
