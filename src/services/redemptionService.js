const db = require('../db');
const config = require('../config');
const couponService = require('./couponService');
const { nowUnix } = require('../utils/time');

const findPendingForCustomerStmt = db.prepare(`
  SELECT * FROM redemptions WHERE customer_id = ? AND status = 'pending'
  ORDER BY requested_at DESC LIMIT 1
`);
// status로 거르지 않는다. 승인·만료된 요청도 손님에게 결과를 알려줘야 하기 때문이다.
const findLatestForCustomerStmt = db.prepare(`
  SELECT * FROM redemptions WHERE customer_id = ?
  ORDER BY requested_at DESC, id DESC LIMIT 1
`);
const insertStmt = db.prepare(`
  INSERT INTO redemptions (customer_id, coupon_id, reward_id, reward_name, reward_cost, status, requested_at)
  VALUES (?, ?, ?, ?, ?, 'pending', ?)
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
const listStaleStmt = db.prepare(
  "SELECT id, coupon_id FROM redemptions WHERE status = 'pending' AND requested_at < ?"
);
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

// 손님 화면이 "사용 완료"를 보려면 pending만 보는 조회로는 안 된다. 사장님이 승인하는 순간
// pending 조회는 빈 값이 되고, 화면은 아무 안내 없이 홈으로 돌아가버린다.
function getLatestForCustomer(customerId) {
  return findLatestForCustomerStmt.get(customerId);
}

// 쿠폰을 먼저 pending으로 선점한 뒤 요청 행을 만든다. 같은 쿠폰으로 요청이 두 번 겹쳐도
// claim이 한 쪽만 성공하므로 쿠폰 한 장이 두 번 쓰이지 않는다.
const createRequestTx = db.transaction(({ customerId, coupon, reward }) => {
  if (!couponService.claim(coupon.id)) return null;
  const now = nowUnix();
  const info = insertStmt.run(customerId, coupon.id, reward.id, reward.name, coupon.stamp_cost, now);
  return findByIdStmt.get(info.lastInsertRowid);
});

function getById(id) {
  return findByIdStmt.get(id);
}

// 취소하면 쿠폰은 다시 손님 것이 되어야 한다. 안 돌려놓으면 쿠폰이 pending에 갇혀 영영 못 쓴다.
const cancelTx = db.transaction((id) => {
  const redemption = findByIdStmt.get(id);
  if (!redemption || redemption.status !== 'pending') return false;
  setStatusStmt.run('cancelled', nowUnix(), id);
  if (redemption.coupon_id) couponService.release(redemption.coupon_id);
  return true;
});

function listPending() {
  return listPendingStmt.all();
}

// 팝업의 "취소" = 사장님의 즉시 거절. cancelTx와 동일하게 쿠폰을 unused로 되돌리지만,
// 손님 자진취소와 구분하기 위해 상태값은 다르게(rejected) 남긴다. status는 CHECK 없는
// TEXT 컬럼이라 스키마 변경 없이 새 문자열 값만 추가하면 된다.
const rejectTx = db.transaction((id) => {
  const redemption = findByIdStmt.get(id);
  if (!redemption || redemption.status !== 'pending') return false;
  setStatusStmt.run('rejected', nowUnix(), id);
  if (redemption.coupon_id) couponService.release(redemption.coupon_id);
  return true;
});

// 5.3/5.4/5.6: 트랜잭션 안에서 pending을 재확인한 뒤 처리한다.
// 스탬프는 쿠폰을 발급할 때 이미 빠졌다 — 여기서 또 빼면 이중 차감이라 스탬프가 음수가 된다.
// 승인이 하는 일은 쿠폰을 'used'로 확정하고 그 시점의 리워드를 새겨넣는 것뿐이다.
const approveTx = db.transaction((id) => {
  const redemption = findByIdStmt.get(id);
  if (!redemption || redemption.status !== 'pending') {
    return { ok: false, redemption };
  }
  if (redemption.coupon_id) {
    const marked = couponService.markUsed(
      redemption.coupon_id,
      { id: redemption.reward_id, name: redemption.reward_name },
      nowUnix()
    );
    // 쿠폰이 이미 pending이 아니면(만료 크론과 경쟁) 승인을 없던 일로 한다.
    if (!marked) return { ok: false, redemption };
  }
  setStatusStmt.run('approved', nowUnix(), id);
  return { ok: true, redemption: findByIdStmt.get(id) };
});

// 5.5: pending인데 requested_at + TTL이 지난 것은 크론이 expired로 바꾼다.
// 이때 묶여 있던 쿠폰도 반드시 미사용으로 되돌린다.
const expireStale = db.transaction(() => {
  const now = nowUnix();
  const stale = listStaleStmt.all(now - config.redemptionTtlSec);
  for (const row of stale) {
    setStatusStmt.run('expired', now, row.id);
    if (row.coupon_id) couponService.release(row.coupon_id);
  }
  return stale.length;
});

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
  createRequestTx,
  getById,
  cancelTx,
  rejectTx,
  listPending,
  approveTx,
  expireStale,
  listByCustomer,
  countPending,
  countApprovedSince,
};
