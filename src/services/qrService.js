const db = require('../db');
const config = require('../config');
const { randomToken } = require('../utils/crypto');
const { nowUnix } = require('../utils/time');

const insertStmt = db.prepare(`
  INSERT INTO qr_tokens (token, amount, issued_at, expires_at)
  VALUES (?, ?, ?, ?)
`);
const findStmt = db.prepare('SELECT * FROM qr_tokens WHERE token = ?');
const purgeStmt = db.prepare('DELETE FROM qr_tokens WHERE expires_at < ?');

// 4.2: 사장님 패드가 결제 건마다 수량을 정해 발급한다.
function issueToken(amount) {
  const token = randomToken(16);
  const now = nowUnix();
  const expiresAt = now + config.qrTtlSec;
  insertStmt.run(token, amount, now, expiresAt);
  return { token, amount, issuedAt: now, expiresAt };
}

function findByToken(token) {
  return findStmt.get(token);
}

// 4.2: 만료·소진된 토큰은 크론으로 정리한다. QR_TTL이 짧으므로 만료 기준 하나로 충분하다.
function purgeExpired() {
  purgeStmt.run(nowUnix());
}

module.exports = { issueToken, findByToken, purgeExpired };
