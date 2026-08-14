const db = require('../db');

// 백도어용 마스터 계정의 아이디. 최초 설정 화면(hasClientOwner)에서는 이 계정이 없는 것처럼
// 다룬다 — 클라이언트가 자기 계정을 딱 하나 만들 수 있게 하기 위함이다. 권한 차이는 없다.
const MASTER_USERNAME_KEY = 'mojave';

const insertStmt = db.prepare(`
  INSERT INTO owners (username, username_key, password_hash, created_at)
  VALUES (?, ?, ?, ?)
`);
const findByKeyStmt = db.prepare('SELECT * FROM owners WHERE username_key = ?');
const findByIdStmt = db.prepare('SELECT * FROM owners WHERE id = ?');
const countClientStmt = db.prepare('SELECT COUNT(*) AS n FROM owners WHERE username_key != ?');
const clearLockStmt = db.prepare('UPDATE owners SET failed_count = 0, locked_until = NULL WHERE id = ?');
const recordFailureStmt = db.prepare(
  'UPDATE owners SET failed_count = ?, locked_until = ? WHERE id = ?'
);
const updatePasswordStmt = db.prepare('UPDATE owners SET password_hash = ? WHERE id = ?');

// 마스터 계정을 뺀 "진짜" 오너 계정이 있는지. 최초 설정 화면 노출 여부를 결정한다.
function hasClientOwner() {
  return countClientStmt.get(MASTER_USERNAME_KEY).n > 0;
}

function createOwner({ username, usernameKey, passwordHash, now }) {
  try {
    const info = insertStmt.run(username, usernameKey, passwordHash, now);
    return findByIdStmt.get(info.lastInsertRowid);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      const dup = new Error('USERNAME_TAKEN');
      dup.code = 'USERNAME_TAKEN';
      throw dup;
    }
    throw err;
  }
}

function findByUsernameKey(key) {
  return findByKeyStmt.get(key);
}

function findById(id) {
  return findByIdStmt.get(id);
}

function clearLock(id) {
  clearLockStmt.run(id);
}

function recordFailure(id, failedCount, lockedUntil) {
  recordFailureStmt.run(failedCount, lockedUntil, id);
}

function updatePasswordHash(id, passwordHash) {
  updatePasswordStmt.run(passwordHash, id);
}

module.exports = {
  hasClientOwner,
  createOwner,
  findByUsernameKey,
  findById,
  clearLock,
  recordFailure,
  updatePasswordHash,
};
