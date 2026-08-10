const crypto = require('crypto');
const db = require('../db');

const insertStmt = db.prepare(`
  INSERT INTO customers (id, nickname, nickname_key, pin_hash, stamps, created_at)
  VALUES (?, ?, ?, ?, 0, ?)
`);
const findByKeyStmt = db.prepare('SELECT * FROM customers WHERE nickname_key = ?');
const findByIdStmt = db.prepare('SELECT * FROM customers WHERE id = ?');
const rowidStmt = db.prepare('SELECT rowid AS rid FROM customers WHERE id = ?');
const clearLockStmt = db.prepare(
  'UPDATE customers SET failed_count = 0, locked_until = NULL WHERE id = ?'
);
const recordFailureStmt = db.prepare(
  'UPDATE customers SET failed_count = ? , locked_until = ? WHERE id = ?'
);
const addStampsStmt = db.prepare(
  'UPDATE customers SET stamps = stamps + ?, last_stamp_at = ? WHERE id = ?'
);
const deductStampsStmt = db.prepare('UPDATE customers SET stamps = stamps - ? WHERE id = ?');

function createCustomer({ nickname, nicknameKey, pinHash, now }) {
  const id = crypto.randomUUID();
  try {
    insertStmt.run(id, nickname, nicknameKey, pinHash, now);
  } catch (err) {
    // UNIQUE 제약 위반 시에도 NICKNAME_TAKEN으로 다뤄야 하므로 호출부에서 판별한다 (경쟁 조건 대비).
    if (String(err.message).includes('UNIQUE')) {
      const dup = new Error('NICKNAME_TAKEN');
      dup.code = 'NICKNAME_TAKEN';
      throw dup;
    }
    throw err;
  }
  return findByIdStmt.get(id);
}

function findByNicknameKey(key) {
  return findByKeyStmt.get(key);
}

function findById(id) {
  return findByIdStmt.get(id);
}

function getCardNo(id) {
  const row = rowidStmt.get(id);
  if (!row) return null;
  return String(row.rid).padStart(6, '0');
}

function clearLock(id) {
  clearLockStmt.run(id);
}

function recordFailure(id, failedCount, lockedUntil) {
  recordFailureStmt.run(failedCount, lockedUntil, id);
}

function addStamps(id, amount, now) {
  addStampsStmt.run(amount, now, id);
}

function deductStamps(id, amount) {
  deductStampsStmt.run(amount, id);
}

module.exports = {
  createCustomer,
  findByNicknameKey,
  findById,
  getCardNo,
  clearLock,
  recordFailure,
  addStamps,
  deductStamps,
};
