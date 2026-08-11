const db = require('../db');
const { nowUnix } = require('../utils/time');

const claimQrStmt = db.prepare(`
  UPDATE qr_tokens
  SET used_by = ?, used_at = ?
  WHERE token = ? AND used_by IS NULL AND expires_at >= ?
`);
const findQrStmt = db.prepare('SELECT * FROM qr_tokens WHERE token = ?');
const insertLogStmt = db.prepare(`
  INSERT INTO stamp_log (customer_id, qr_token, amount, created_at)
  VALUES (?, ?, ?, ?)
`);
const addStampsStmt = db.prepare(
  'UPDATE customers SET stamps = stamps + ?, last_stamp_at = ? WHERE id = ?'
);
const getStampsStmt = db.prepare('SELECT stamps FROM customers WHERE id = ?');
const listByCustomerStmt = db.prepare(
  'SELECT * FROM stamp_log WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?'
);
const sumSinceStmt = db.prepare(
  'SELECT COALESCE(SUM(amount), 0) AS total FROM stamp_log WHERE created_at >= ?'
);

// 4.3/4.4: "먼저 SELECT해서 확인 후 UPDATE"하면 동시 요청 둘 다 통과해버린다.
// UPDATE ... WHERE used_by IS NULL 자체가 원자적 선점이다. 전 과정은 하나의 트랜잭션.
const redeemQr = db.transaction((customerId, token) => {
  const now = nowUnix();
  const result = claimQrStmt.run(customerId, now, token, now);

  if (result.changes === 0) {
    const row = findQrStmt.get(token);
    if (!row) return { ok: false, reason: 'INVALID_QR' };
    if (row.used_by) return { ok: false, reason: 'ALREADY_USED' };
    return { ok: false, reason: 'EXPIRED_QR' };
  }

  const qr = findQrStmt.get(token);

  // stamp_log.qr_token UNIQUE 제약이 최종 방어선이다. 여기서 걸리면 트랜잭션이 롤백된다.
  insertLogStmt.run(customerId, token, qr.amount, now);
  addStampsStmt.run(qr.amount, now, customerId);

  const stamps = getStampsStmt.get(customerId).stamps;
  return { ok: true, added: qr.amount, stamps };
});

function listByCustomer(customerId, limit = 20) {
  return listByCustomerStmt.all(customerId, limit);
}

// 오너 대시보드의 "오늘 적립" 집계용.
function sumAmountSince(sinceUnix) {
  return sumSinceStmt.get(sinceUnix).total;
}

module.exports = { redeemQr, listByCustomer, sumAmountSince };
