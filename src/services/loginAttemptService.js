const db = require('../db');
const config = require('../config');
const { nowUnix } = require('../utils/time');

const insertStmt = db.prepare('INSERT INTO login_attempts (ip, attempt_at) VALUES (?, ?)');
const countStmt = db.prepare(
  'SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND attempt_at > ?'
);
const purgeStmt = db.prepare('DELETE FROM login_attempts WHERE attempt_at < ?');

function recordAttempt(ip) {
  insertStmt.run(ip, nowUnix());
}

function isRateLimited(ip) {
  const since = nowUnix() - config.ipAttemptWindowSec;
  const { n } = countStmt.get(ip, since);
  return n >= config.ipAttemptMax;
}

// 3.6: 오래된 행은 크론으로 하루 한 번 삭제한다.
function purgeOld() {
  purgeStmt.run(nowUnix() - 86_400);
}

module.exports = { recordAttempt, isRateLimited, purgeOld };
