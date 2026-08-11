const db = require('../db');
const config = require('../config');
const { randomToken, sha256Hex } = require('../utils/crypto');
const { nowUnix } = require('../utils/time');

const insertStmt = db.prepare(`
  INSERT INTO owner_sessions (token_hash, owner_id, created_at, last_seen_at)
  VALUES (?, ?, ?, ?)
`);
const findStmt = db.prepare('SELECT * FROM owner_sessions WHERE token_hash = ?');
const touchStmt = db.prepare('UPDATE owner_sessions SET last_seen_at = ? WHERE token_hash = ?');
const deleteStmt = db.prepare('DELETE FROM owner_sessions WHERE token_hash = ?');
const deleteByOwnerStmt = db.prepare('DELETE FROM owner_sessions WHERE owner_id = ?');

function createSession(ownerId) {
  const token = randomToken(32);
  const tokenHash = sha256Hex(token);
  const now = nowUnix();
  insertStmt.run(tokenHash, ownerId, now, now);
  return token;
}

// 유효하면 owner_id 반환, 아니면 null. 손님 세션과 동일한 슬라이딩 만료 방식.
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
  return row.owner_id;
}

function destroySession(token) {
  if (!token) return;
  deleteStmt.run(sha256Hex(token));
}

function destroyAllForOwner(ownerId) {
  deleteByOwnerStmt.run(ownerId);
}

module.exports = { createSession, validateAndTouch, destroySession, destroyAllForOwner };
