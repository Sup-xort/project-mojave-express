const db = require('../db');

const insertStmt = db.prepare(`
  INSERT INTO owners (username, username_key, password_hash, created_at)
  VALUES (?, ?, ?, ?)
`);
const findByKeyStmt = db.prepare('SELECT * FROM owners WHERE username_key = ?');
const findByIdStmt = db.prepare('SELECT * FROM owners WHERE id = ?');
const countStmt = db.prepare('SELECT COUNT(*) AS n FROM owners');
const clearLockStmt = db.prepare('UPDATE owners SET failed_count = 0, locked_until = NULL WHERE id = ?');
const recordFailureStmt = db.prepare(
  'UPDATE owners SET failed_count = ?, locked_until = ? WHERE id = ?'
);
const updatePasswordStmt = db.prepare('UPDATE owners SET password_hash = ? WHERE id = ?');

function hasAnyOwner() {
  return countStmt.get().n > 0;
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
  hasAnyOwner,
  createOwner,
  findByUsernameKey,
  findById,
  clearLock,
  recordFailure,
  updatePasswordHash,
};
