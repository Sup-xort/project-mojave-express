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
const updatePinHashStmt = db.prepare('UPDATE customers SET pin_hash = ? WHERE id = ?');
const clearPinHashStmt = db.prepare("UPDATE customers SET pin_hash = '' WHERE id = ?");
const searchByNicknameStmt = db.prepare(`
  SELECT * FROM customers WHERE nickname_key LIKE ? ESCAPE '\\' ORDER BY nickname_key LIMIT ?
`);
const countAllStmt = db.prepare('SELECT COUNT(*) AS n FROM customers');

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

// 손님이 PIN 초기화 후 스스로 새 PIN을 정할 때(/api/pin-reset) 쓴다.
function updatePinHash(id, pinHash) {
  updatePinHashStmt.run(pinHash, id);
}

// PIN 분실 시 사장님이 대면으로 초기화한다. 개인정보를 안 받는 앱이라 매장에서 직접
// 확인하는 것 자체가 본인확인 수단이다. pin_hash를 빈 문자열로 비워두면 손님이 앱에서
// 같은 닉네임을 다시 입력했을 때 새 PIN을 스스로 정하게 된다(customer/auth.js의 pin-reset).
function clearPinHash(id) {
  clearPinHashStmt.run(id);
}

// 스탬프 가감은 stampService(적립·수동지급)와 couponService(쿠폰 변환) 안에서만 한다.
// 두 곳 다 트랜잭션 안에서 처리해야 해서 여기에 범용 헬퍼를 두면 트랜잭션 밖에서 불릴 위험이 있다.

// 오너 고객 조회 화면용. LIKE의 %, _, \ 를 이스케이프해 검색어를 리터럴로만 다룬다.
function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function searchByNickname(key, limit = 20) {
  return searchByNicknameStmt.all(`%${escapeLike(key)}%`, limit);
}

function countAll() {
  return countAllStmt.get().n;
}

module.exports = {
  createCustomer,
  findByNicknameKey,
  findById,
  getCardNo,
  clearLock,
  recordFailure,
  updatePinHash,
  clearPinHash,
  searchByNickname,
  countAll,
};
