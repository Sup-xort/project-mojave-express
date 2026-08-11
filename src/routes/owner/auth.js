const express = require('express');
const bcrypt = require('bcrypt');
const config = require('../../config');
const { validateUsername } = require('../../utils/username');
const { nowUnix } = require('../../utils/time');
const { appError } = require('../../middleware/errors');
const {
  setOwnerSessionCookie,
  clearOwnerSessionCookie,
  requireOwnerAuth,
} = require('../../middleware/ownerSession');
const ownerService = require('../../services/ownerService');
const ownerSessionService = require('../../services/ownerSessionService');
const loginAttemptService = require('../../services/loginAttemptService');

const router = express.Router();

const PASSWORD_MIN_LEN = 8;
const PASSWORD_MAX_LEN = 72; // bcrypt는 72바이트를 넘으면 조용히 잘라버리므로 그 전에 막는다.

// 존재하지 않는 아이디로 로그인 시도해도 응답 시간을 맞추기 위한 더미 해시.
const DUMMY_HASH = bcrypt.hashSync(`__no_such_owner__${config.ownerPasswordPepper}`, 12);

function clientIp(req) {
  return req.ip || 'unknown';
}

function isValidPassword(pw) {
  return typeof pw === 'string' && pw.length >= PASSWORD_MIN_LEN && pw.length <= PASSWORD_MAX_LEN;
}

router.get('/setup-status', (req, res) => {
  res.json({ hasOwner: ownerService.hasAnyOwner() });
});

// 최초 1회만 허용되는 오너 계정 생성. ADMIN_KEY 같은 별도 프로비저닝 없이 웹 화면에서 바로 만든다.
router.post('/setup', async (req, res, next) => {
  try {
    if (ownerService.hasAnyOwner()) {
      return next(appError('SETUP_ALREADY_DONE'));
    }

    const { username, password } = req.body || {};
    const v = validateUsername(username);
    if (!v.ok) return next(appError('INVALID_USERNAME'));
    if (!isValidPassword(password)) return next(appError('INVALID_PASSWORD_FORMAT'));

    const passwordHash = await bcrypt.hash(password + config.ownerPasswordPepper, 12);

    let owner;
    try {
      owner = ownerService.createOwner({
        username: v.username,
        usernameKey: v.key,
        passwordHash,
        now: nowUnix(),
      });
    } catch (err) {
      if (err.code === 'USERNAME_TAKEN') return next(appError('SETUP_ALREADY_DONE'));
      throw err;
    }

    const token = ownerSessionService.createSession(owner.id);
    setOwnerSessionCookie(res, token);
    res.json({ username: owner.username });
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

    const { username, password } = req.body || {};
    const v = validateUsername(username);
    if (!v.ok || typeof password !== 'string') {
      await bcrypt.compare('x', DUMMY_HASH);
      return next(appError('INVALID_OWNER_CREDENTIALS'));
    }

    const owner = ownerService.findByUsernameKey(v.key);

    if (!owner) {
      await bcrypt.compare(password + config.ownerPasswordPepper, DUMMY_HASH);
      return next(appError('INVALID_OWNER_CREDENTIALS'));
    }

    const now = nowUnix();
    if (owner.locked_until && owner.locked_until > now) {
      return next(appError('ACCOUNT_LOCKED', { retryAfterSec: owner.locked_until - now }));
    }

    const match = await bcrypt.compare(password + config.ownerPasswordPepper, owner.password_hash);
    if (!match) {
      const failedCount = owner.failed_count + 1;
      if (failedCount >= config.lockThreshold) {
        ownerService.recordFailure(owner.id, 0, now + config.lockDurationSec);
      } else {
        ownerService.recordFailure(owner.id, failedCount, null);
      }
      return next(appError('INVALID_OWNER_CREDENTIALS'));
    }

    ownerService.clearLock(owner.id);

    const token = ownerSessionService.createSession(owner.id);
    setOwnerSessionCookie(res, token);
    res.json({ username: owner.username });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireOwnerAuth, (req, res) => {
  ownerSessionService.destroySession(req.ownerSessionToken);
  clearOwnerSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireOwnerAuth, (req, res) => {
  res.json({ username: req.owner.username });
});

router.post('/password', requireOwnerAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string') return next(appError('WRONG_CURRENT_PASSWORD'));
    if (!isValidPassword(newPassword)) return next(appError('INVALID_PASSWORD_FORMAT'));

    const match = await bcrypt.compare(
      currentPassword + config.ownerPasswordPepper,
      req.owner.password_hash
    );
    if (!match) return next(appError('WRONG_CURRENT_PASSWORD'));

    const passwordHash = await bcrypt.hash(newPassword + config.ownerPasswordPepper, 12);
    ownerService.updatePasswordHash(req.owner.id, passwordHash);

    // 비밀번호가 바뀌면 다른 기기의 세션은 모두 끊는다. 현재 세션은 새로 발급해 로그인 상태를 유지한다.
    ownerSessionService.destroyAllForOwner(req.owner.id);
    const token = ownerSessionService.createSession(req.owner.id);
    setOwnerSessionCookie(res, token);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
