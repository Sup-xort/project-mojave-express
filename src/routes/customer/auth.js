const express = require('express');
const bcrypt = require('bcrypt');
const config = require('../../config');
const { validateNickname } = require('../../utils/nickname');
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
