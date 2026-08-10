const path = require('path');
require('dotenv').config();

function int(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`환경변수 ${name} 은 정수여야 합니다`);
  return n;
}

function bool(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  return v === 'true' || v === '1';
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

const pinPepper = process.env.PIN_PEPPER || '';
const adminKey = process.env.ADMIN_KEY || '';

if (isProd && (!pinPepper || pinPepper === 'CHANGE_ME_TO_A_LONG_RANDOM_STRING')) {
  throw new Error('PIN_PEPPER가 설정되지 않았습니다. .env를 확인하세요.');
}
if (isProd && (!adminKey || adminKey === 'CHANGE_ME_ADMIN_KEY')) {
  throw new Error('ADMIN_KEY가 설정되지 않았습니다. .env를 확인하세요.');
}

module.exports = {
  nodeEnv,
  isProd,
  port: int('PORT', 3000),
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db'),
  cookieSecure: bool('COOKIE_SECURE', isProd),
  trustProxyHops: int('TRUST_PROXY_HOPS', 1),

  storeTz: process.env.STORE_TZ || 'Asia/Seoul',

  qrTtlSec: int('QR_TTL_SEC', 120),
  qrAmountMax: int('QR_AMOUNT_MAX', 10),

  sessionTtlSec: int('SESSION_TTL_SEC', 31536000),

  lockThreshold: int('LOCK_THRESHOLD', 5),
  lockDurationSec: int('LOCK_DURATION_SEC', 900),
  ipAttemptMax: int('IP_ATTEMPT_MAX', 20),
  ipAttemptWindowSec: int('IP_ATTEMPT_WINDOW_SEC', 600),

  redemptionTtlSec: int('REDEMPTION_TTL_SEC', 600),

  pinPepper,
  adminKey,
};
