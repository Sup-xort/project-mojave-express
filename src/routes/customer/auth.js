const express = require('express');
const bcrypt = require('bcrypt');
const config = require('../../config');
const { validateNickname } = require('../../utils/nickname');
const { randomNickname } = require('../../utils/nicknameGenerator');
const { nowUnix } = require('../../utils/time');
const { appError } = require('../../middleware/errors');
const { setSessionCookie, clearSessionCookie, requireAuth } = require('../../middleware/session');
const customerService = require('../../services/customerService');
const sessionService = require('../../services/sessionService');
const loginAttemptService = require('../../services/loginAttemptService');

const router = express.Router();

const PIN_FORMAT = /^\d{4}$/;

// 로그인 실패 응답 시간을 존재하지 않는 계정과 맞추기 위한 더미 해시.
// 실제 PIN이 될 수 없는 값으로 한번만 해시해 프로세스 수명 동안 재사용한다.
const DUMMY_HASH = bcrypt.hashSync(`__no_such_account__${config.pinPepper}`, 12);

function clientIp(req) {
  return req.ip || 'unknown';
}

router.get('/nickname-check', (req, res) => {
  const v = validateNickname(req.query.nickname);
  if (!v.ok) return res.json({ valid: false });
  const customer = customerService.findByNicknameKey(v.key);
  const exists = !!customer;
  const needsReset = exists && customer.pin_hash === '';
  res.json({ valid: true, exists, needsReset });
});

const SUGGESTION_ATTEMPTS = 20;

router.get('/nickname-suggestion', (req, res) => {
  let candidate = randomNickname();
  for (let i = 0; i < SUGGESTION_ATTEMPTS; i += 1) {
    if (i > 0) candidate = randomNickname();
    const v = validateNickname(candidate);
    if (v.ok && !customerService.findByNicknameKey(v.key)) {
      return res.json({ nickname: v.nickname });
    }
  }
  // 20회 모두 충돌하는 건 사실상 불가능하지만, 그런 경우에도 가입 시도 자체는
  // /signup의 NICKNAME_TAKEN 처리로 안전하게 막히므로 재확인 없이 그대로 내려준다.
  const fallback = `${candidate}${Math.floor(Math.random() * 90 + 10)}`;
  res.json({ nickname: fallback });
});

router.post('/signup', async (req, res, next) => {
  try {
    const { nickname, pin } = req.body || {};
    const v = validateNickname(nickname);
    if (!v.ok) return next(appError('INVALID_NICKNAME'));
    if (typeof pin !== 'string' || !PIN_FORMAT.test(pin)) {
      return next(appError('INVALID_PIN_FORMAT'));
    }

    if (customerService.findByNicknameKey(v.key)) {
      return next(appError('NICKNAME_TAKEN'));
    }

    const pinHash = await bcrypt.hash(pin + config.pinPepper, 12);

    let customer;
    try {
      customer = customerService.createCustomer({
        nickname: v.nickname,
        nicknameKey: v.key,
        pinHash,
        now: nowUnix(),
      });
    } catch (err) {
      if (err.code === 'NICKNAME_TAKEN') return next(appError('NICKNAME_TAKEN'));
      throw err;
    }

    const token = sessionService.createSession(customer.id);
    setSessionCookie(res, token);
    res.json({ nickname: customer.nickname, stamps: customer.stamps });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const ip = clientIp(req);

    if (loginAttemptService.isRateLimited(ip)) {
      return next(appError('IP_RATE_LIMITED'));
    }
    loginAttemptService.recordAttempt(ip);

    const { nickname, pin } = req.body || {};
    const v = validateNickname(nickname);
    if (!v.ok || typeof pin !== 'string' || !PIN_FORMAT.test(pin)) {
      // 형식이 아예 안 맞아도 응답 시간을 맞추기 위해 더미 비교를 거친다.
      await bcrypt.compare('x', DUMMY_HASH);
      return next(appError('INVALID_CREDENTIALS'));
    }

    const customer = v.ok ? customerService.findByNicknameKey(v.key) : null;

    if (!customer) {
      // 3.5: 계정이 없어도 즉시 반환하지 않는다 — 더미 비교로 응답 시간을 맞춘다.
      await bcrypt.compare(pin + config.pinPepper, DUMMY_HASH);
      return next(appError('INVALID_CREDENTIALS'));
    }

    const now = nowUnix();
    if (customer.locked_until && customer.locked_until > now) {
      return next(appError('ACCOUNT_LOCKED', { retryAfterSec: customer.locked_until - now }));
    }

    if (customer.pin_hash === '') {
      // 사장님이 PIN을 초기화한 계정 — /api/pin-reset으로 가야 한다.
      // 응답을 그냥 즉시 반환하면 정상 실패(bcrypt 비교, ~700ms)보다 훨씬 빨라져서(~수 ms)
      // 응답 시간만으로 "이 닉네임이 초기화된 계정인지"가 드러나므로, 더미 비교를 한 번 태운다.
      await bcrypt.compare(pin + config.pinPepper, DUMMY_HASH);
      return next(appError('INVALID_CREDENTIALS'));
    }

    const match = await bcrypt.compare(pin + config.pinPepper, customer.pin_hash);
    if (!match) {
      const failedCount = customer.failed_count + 1;
      if (failedCount >= config.lockThreshold) {
        customerService.recordFailure(customer.id, 0, now + config.lockDurationSec);
      } else {
        customerService.recordFailure(customer.id, failedCount, null);
      }
      return next(appError('INVALID_CREDENTIALS'));
    }

    customerService.clearLock(customer.id);
    loginAttemptService.clearAttempts(ip);

    const token = sessionService.createSession(customer.id);
    setSessionCookie(res, token);
    res.json({ nickname: customer.nickname, stamps: customer.stamps });
  } catch (err) {
    next(err);
  }
});

// 사장님이 초기화한 PIN을 손님이 스스로 다시 정한다. 닉네임이 존재하고
// pin_hash가 비어 있는 계정만 허용 — 클라이언트의 needsReset 표시를 믿지 않고 서버에서 재확인한다.
router.post('/pin-reset', async (req, res, next) => {
  try {
    const { nickname, pin } = req.body || {};
    const v = validateNickname(nickname);
    if (!v.ok) return next(appError('INVALID_NICKNAME'));
    if (typeof pin !== 'string' || !PIN_FORMAT.test(pin)) {
      return next(appError('INVALID_PIN_FORMAT'));
    }

    const customer = customerService.findByNicknameKey(v.key);
    if (!customer || customer.pin_hash !== '') {
      return next(appError('INVALID_CREDENTIALS'));
    }

    const pinHash = await bcrypt.hash(pin + config.pinPepper, 12);
    customerService.updatePinHash(customer.id, pinHash);
    customerService.clearLock(customer.id);

    const token = sessionService.createSession(customer.id);
    setSessionCookie(res, token);
    res.json({ nickname: customer.nickname, stamps: customer.stamps });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, (req, res) => {
  sessionService.destroySession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

module.exports = router;
