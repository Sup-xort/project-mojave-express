const crypto = require('crypto');

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// 상수 시간 비교. 길이가 다르면 즉시 false (타이밍에 큰 영향 없는 공개 키류 비교용).
function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { randomToken, sha256Hex, timingSafeEqualStr };
