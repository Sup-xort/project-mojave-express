const db = require('../db');
const config = require('../config');
const { randomToken, sha256Hex } = require('../utils/crypto');
const { nowUnix } = require('../utils/time');

const insertStmt = db.prepare(`
  INSERT INTO sessions (token_hash, customer_id, created_at, last_seen_at)
  VALUES (?, ?, ?, ?)
`);
const findStmt = db.prepare(`
  SELECT sessions.*, customers.id AS customer_id_check
  FROM sessions JOIN customers ON customers.id = sessions.customer_id
  WHERE token_hash = ?
`);
const touchStmt = db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?');
const deleteStmt = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
const deleteByCustomerStmt = db.prepare('DELETE FROM sessions WHERE customer_id = ?');

// 3.2: 원본 토큰은 쿠키로만 내려주고, DB에는 해시만 저장한다.
function createSession(customerId) {
  const token = randomToken(32);
  const tokenHash = sha256Hex(token);
  const now = nowUnix();
  insertStmt.run(tokenHash, customerId, now, now);
  return token;
}

// 유효하면 customer_id 반환, 아니면 null. 만료된 세션은 즉시 삭제한다 (슬라이딩 만료).
function validateAndTouch(token) {
  if (!token) return null;
  const tokenHash = sha256Hex(token);
  const row = findStmt.get(tokenHash);
  if (!row) return null;
  const now = nowUnix();
  if (now - row.last_seen_at > config.sessionTtlSec) {
    deleteStmt.run(tokenHash);
    return null;
  }
  touchStmt.run(now, tokenHash);
  return row.customer_id;
}

function destroySession(token) {
  if (!token) return;
  deleteStmt.run(sha256Hex(token));
}

function destroyAllForCustomer(customerId) {
  deleteByCustomerStmt.run(customerId);
}

module.exports = { createSession, validateAndTouch, destroySession, destroyAllForCustomer };
