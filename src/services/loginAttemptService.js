const db = require('../db');
const config = require('../config');
const { nowUnix } = require('../utils/time');

const insertStmt = db.prepare('INSERT INTO login_attempts (ip, attempt_at) VALUES (?, ?)');
const countStmt = db.prepare(
  'SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND attempt_at > ?'
);
const purgeStmt = db.prepare('DELETE FROM login_attempts WHERE attempt_at < ?');
const clearStmt = db.prepare('DELETE FROM login_attempts WHERE ip = ?');

function recordAttempt(ip) {
  insertStmt.run(ip, nowUnix());
}

function isRateLimited(ip) {
  const since = nowUnix() - config.ipAttemptWindowSec;
  const { n } = countStmt.get(ip, since);
  return n >= config.ipAttemptMax;
}

// 로그인 성공 시 호출한다. 성공한 로그인도 시도 횟수에 계속 잡히면 같은 IP를 쓰는
// 매장 손님들이 정상 비밀번호로도 차단당한다(매장 와이파이 = IP 하나).
function clearAttempts(ip) {
  clearStmt.run(ip);
}

// 3.6: 오래된 행은 크론으로 하루 한 번 삭제한다.
function purgeOld() {
  purgeStmt.run(nowUnix() - 86_400);
}

module.exports = { recordAttempt, isRateLimited, clearAttempts, purgeOld };
